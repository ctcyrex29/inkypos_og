package com.example.printer

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.os.Build
import android.util.Log
import com.example.data.Transaction
import com.example.data.TransactionItem
import com.squareup.moshi.Moshi
import com.squareup.moshi.Types
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

@SuppressLint("MissingPermission")
class PrinterManager(private val context: Context) {

    private val bluetoothManager: BluetoothManager? = 
        context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager?.adapter

    // Connection states
    private val _connectionState = MutableStateFlow<PrinterState>(PrinterState.Disconnected)
    val connectionState: StateFlow<PrinterState> = _connectionState

    // Connected device information
    private val _connectedDevice = MutableStateFlow<BluetoothDevice?>(null)
    val connectedDevice: StateFlow<BluetoothDevice?> = _connectedDevice

    // Virtual print buffer for the onscreen receipt simulator
    private val _virtualReceiptBuffer = MutableStateFlow<List<String>>(emptyList())
    val virtualReceiptBuffer: StateFlow<List<String>> = _virtualReceiptBuffer

    private var socket: BluetoothSocket? = null
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    /**
     * Get list of paired Bluetooth devices
     */
    fun getPairedDevices(): List<BluetoothDevice> {
        return try {
            bluetoothAdapter?.bondedDevices?.toList() ?: emptyList()
        } catch (e: SecurityException) {
            emptyList()
        }
    }

    /**
     * Connect to a specific Bluetooth printer device
     */
    suspend fun connectToDevice(device: BluetoothDevice): Boolean = withContext(Dispatchers.IO) {
        _connectionState.value = PrinterState.Connecting
        try {
            // Cancel discovery as it slows down connection
            bluetoothAdapter?.cancelDiscovery()

            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            socket?.connect()

            _connectedDevice.value = device
            _connectionState.value = PrinterState.Connected(device.name ?: "Unknown Printer")
            true
        } catch (e: Exception) {
            Log.e("PrinterManager", "Connection failed", e)
            closeSocket()
            _connectionState.value = PrinterState.Error("Connection failed: ${e.localizedMessage}")
            false
        }
    }

    /**
     * Disconnect printer
     */
    fun disconnect() {
        closeSocket()
        _connectedDevice.value = null
        _connectionState.value = PrinterState.Disconnected
    }

    private fun closeSocket() {
        try {
            socket?.close()
        } catch (e: IOException) {
            Log.e("PrinterManager", "Could not close socket", e)
        }
        socket = null
    }

    /**
     * Formats and prints a transaction receipt.
     * Writes to both the physical Bluetooth socket (if connected) and the virtual print buffer.
     */
    suspend fun printReceipt(transaction: Transaction, items: List<TransactionItem>, businessName: String = "SMART POS MINI-MART") = withContext(Dispatchers.IO) {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
        val dateString = dateFormat.format(Date(transaction.timestamp))

        // 1. Generate text lines for visual display and virtual printing
        val textLines = mutableListOf<String>()
        textLines.add("================================")
        textLines.add(businessName.uppercase())
        textLines.add("Receipt: ${transaction.id}")
        textLines.add("Date: $dateString")
        textLines.add("--------------------------------")
        
        items.forEach { item ->
            val totalItemPrice = item.quantity * item.unitPrice
            val itemLine = String.format("%-18s x%2d %6.2f", 
                if (item.name.length > 18) item.name.substring(0, 15) + "..." else item.name, 
                item.quantity, 
                totalItemPrice
            )
            textLines.add(itemLine)
        }
        
        textLines.add("--------------------------------")
        textLines.add(String.format("%-22s %8.2f", "Subtotal:", transaction.subtotal))
        if (transaction.tax > 0) {
            textLines.add(String.format("%-22s %8.2f", "Tax (10%):", transaction.tax))
        }
        if (transaction.discount > 0) {
            textLines.add(String.format("%-22s -%7.2f", "Discount:", transaction.discount))
        }
        textLines.add("================================")
        textLines.add(String.format("TOTAL PAID (%s):    %8.2f", transaction.paymentMethod.uppercase(), transaction.total))
        textLines.add("================================")
        textLines.add("THANK YOU FOR YOUR BUSINESS!")
        textLines.add("Powered by Smart POS")
        textLines.add("\n\n")

        // Update virtual scroll receipt buffer
        _virtualReceiptBuffer.value = textLines

        // 2. If Bluetooth is connected, write Esc/Pos commands
        val currentSocket = socket
        if (currentSocket != null && currentSocket.isConnected) {
            try {
                val outputStream = currentSocket.outputStream

                // ESC/POS Command constants
                val initPrinter = byteArrayOf(0x1B, 0x40)
                val selectFont = byteArrayOf(0x1B, 0x4D, 0x00) // Font A
                val centerAlign = byteArrayOf(0x1B, 0x61, 0x01)
                val leftAlign = byteArrayOf(0x1B, 0x61, 0x00)
                val boldOn = byteArrayOf(0x1B, 0x45, 0x01)
                val boldOff = byteArrayOf(0x1B, 0x45, 0x00)
                val doubleSize = byteArrayOf(0x1D, 0x21, 0x11)
                val normalSize = byteArrayOf(0x1D, 0x21, 0x00)
                val feedPaper = byteArrayOf(0x1D, 0x56, 0x41, 0x10) // Cut command (if supported)

                outputStream.write(initPrinter)
                outputStream.write(selectFont)

                // Header - Bold & Large
                outputStream.write(centerAlign)
                outputStream.write(doubleSize)
                outputStream.write(boldOn)
                outputStream.write("$businessName\n".toByteArray())
                outputStream.write(normalSize)
                outputStream.write(boldOff)
                outputStream.write("Smart Retail POS Solutions\n".toByteArray())
                outputStream.write("--------------------------------\n".toByteArray())

                // Metadata - Left Aligned
                outputStream.write(leftAlign)
                outputStream.write("Receipt ID: ${transaction.id}\n".toByteArray())
                outputStream.write("Date: $dateString\n".toByteArray())
                outputStream.write("Payment: ${transaction.paymentMethod}\n".toByteArray())
                outputStream.write("--------------------------------\n".toByteArray())

                // Items list
                items.forEach { item ->
                    val totalItemPrice = item.quantity * item.unitPrice
                    val itemText = String.format("%-18s x%2d %6.2f\n", 
                        if (item.name.length > 18) item.name.substring(0, 15) + "..." else item.name, 
                        item.quantity, 
                        totalItemPrice
                    )
                    outputStream.write(itemText.toByteArray())
                }

                outputStream.write("--------------------------------\n".toByteArray())

                // Totals
                outputStream.write(String.format("%-22s %8.2f\n", "Subtotal:", transaction.subtotal).toByteArray())
                if (transaction.tax > 0) {
                    outputStream.write(String.format("%-22s %8.2f\n", "Tax (10%):", transaction.tax).toByteArray())
                }
                if (transaction.discount > 0) {
                    outputStream.write(String.format("%-22s -%7.2f\n", "Discount:", transaction.discount).toByteArray())
                }
                
                outputStream.write(boldOn)
                outputStream.write(String.format("%-22s %8.2f\n", "TOTAL:", transaction.total).toByteArray())
                outputStream.write(boldOff)
                outputStream.write("--------------------------------\n".toByteArray())

                // Thank you
                outputStream.write(centerAlign)
                outputStream.write("THANK YOU FOR YOUR PURCHASE!\n".toByteArray())
                outputStream.write("Please visit us again.\n".toByteArray())
                outputStream.write("Offline-First Cloud Sync Enabled\n\n\n\n".toByteArray())

                // Cut paper
                outputStream.write(feedPaper)
                outputStream.flush()
            } catch (e: Exception) {
                Log.e("PrinterManager", "Printing failed", e)
            }
        }
    }

    /**
     * Clear the visual receipt simulator
     */
    fun clearVirtualReceipt() {
        _virtualReceiptBuffer.value = emptyList()
    }
}

sealed class PrinterState {
    object Disconnected : PrinterState()
    object Connecting : PrinterState()
    data class Connected(val deviceName: String) : PrinterState()
    data class Error(val error: String) : PrinterState()
}
