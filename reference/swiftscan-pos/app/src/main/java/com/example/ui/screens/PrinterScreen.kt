package com.example.ui.screens

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.example.printer.PrinterState
import com.example.ui.POSViewModel
import com.example.ui.theme.BluePrimary
import com.example.ui.theme.BlueSecondary
import com.example.ui.theme.BorderGray
import com.example.ui.theme.ErrorRed
import com.example.ui.theme.LightBlueBackground
import com.example.ui.theme.OffWhite
import com.example.ui.theme.OrangeAccent
import com.example.ui.theme.SuccessGreen
import com.example.ui.theme.TextDark
import com.example.ui.theme.YellowAccent
import kotlinx.coroutines.launch

@Composable
fun PrinterScreen(
    viewModel: POSViewModel,
    isTablet: Boolean,
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    
    val connectionState by viewModel.printerManager.connectionState.collectAsState()
    val connectedDevice by viewModel.printerManager.connectedDevice.collectAsState()
    val virtualReceipt by viewModel.printerManager.virtualReceiptBuffer.collectAsState()

    var pairedDevices by remember { mutableStateOf<List<BluetoothDevice>>(emptyList()) }
    
    // Bluetooth permissions request flow
    val permissionsToRequest = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
    } else {
        arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
    }

    var hasBluetoothPermission by remember {
        mutableStateOf(
            permissionsToRequest.all {
                ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
            }
        )
    }

    val launcher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions(),
        onResult = { permissionsMap ->
            hasBluetoothPermission = permissionsMap.values.all { it }
            if (hasBluetoothPermission) {
                pairedDevices = viewModel.printerManager.getPairedDevices()
            }
        }
    )

    LaunchedEffect(hasBluetoothPermission) {
        if (hasBluetoothPermission) {
            pairedDevices = viewModel.printerManager.getPairedDevices()
        }
    }

    Row(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Left Column: Device scan list & status (flexible on tablet, full-screen on mobile)
        Column(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
        ) {
            // Header
            Text(
                text = "Bluetooth Receipt Printer",
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold,
                color = TextDark
            )
            Text(
                text = "Connect physical ESC/POS thermal printers over Bluetooth or use onscreen virtual printing feed.",
                fontSize = 14.sp,
                color = Color.Gray,
                modifier = Modifier.padding(bottom = 16.dp)
            )

            // Connection Status Panel
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(12.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, BorderGray),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Status Beacon Glow
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .background(
                                when (connectionState) {
                                    is PrinterState.Connected -> SuccessGreen.copy(alpha = 0.15f)
                                    is PrinterState.Connecting -> YellowAccent.copy(alpha = 0.15f)
                                    else -> OrangeAccent.copy(alpha = 0.15f)
                                },
                                CircleShape
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Box(
                            modifier = Modifier
                                .size(12.dp)
                                .background(
                                    when (connectionState) {
                                        is PrinterState.Connected -> SuccessGreen
                                        is PrinterState.Connecting -> YellowAccent
                                        else -> OrangeAccent
                                    },
                                    CircleShape
                                )
                        )
                    }

                    Spacer(modifier = Modifier.width(16.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = when (connectionState) {
                                is PrinterState.Connected -> "Connected"
                                is PrinterState.Connecting -> "Connecting..."
                                is PrinterState.Error -> "Connection Error"
                                else -> "Printer Disconnected"
                            },
                            fontWeight = FontWeight.Bold,
                            fontSize = 15.sp,
                            color = TextDark
                        )
                        Text(
                            text = when (connectionState) {
                                is PrinterState.Connected -> (connectionState as PrinterState.Connected).deviceName
                                is PrinterState.Error -> (connectionState as PrinterState.Error).error
                                else -> "Virtual print simulator active by default"
                            },
                            fontSize = 12.sp,
                            color = Color.Gray
                        )
                    }

                    if (connectionState is PrinterState.Connected) {
                        Button(
                            onClick = { viewModel.printerManager.disconnect() },
                            colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Text("DISCONNECT", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Paired devices scanner list
            Text(
                text = "Available Paired Printers",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = TextDark,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            if (!hasBluetoothPermission) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .background(OffWhite, RoundedCornerShape(12.dp))
                        .border(1.dp, BorderGray, RoundedCornerShape(12.dp))
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.Bluetooth, contentDescription = "BT", modifier = Modifier.size(48.dp), tint = BluePrimary)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "Bluetooth Access Required",
                            fontWeight = FontWeight.Bold,
                            color = TextDark,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "Grant permissions to discover and connect local thermal receipt printers.",
                            color = Color.Gray,
                            fontSize = 13.sp,
                            textAlign = TextAlign.Center
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { launcher.launch(permissionsToRequest) },
                            colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                        ) {
                            Text("Enable Bluetooth Scan", color = Color.White)
                        }
                    }
                }
            } else if (pairedDevices.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .background(OffWhite, RoundedCornerShape(12.dp))
                        .border(1.dp, BorderGray, RoundedCornerShape(12.dp))
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.PrintDisabled, contentDescription = "No Printer", modifier = Modifier.size(48.dp), tint = Color.Gray)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "No Paired Printers Found",
                            fontWeight = FontWeight.Bold,
                            color = TextDark
                        )
                        Text(
                            text = "Please pair your thermal receipt printer inside system settings first, then reopen this tab.",
                            color = Color.Gray,
                            fontSize = 12.sp,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 16.dp)
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                        .clip(RoundedCornerShape(12.dp))
                        .background(Color.White)
                        .border(1.dp, BorderGray, RoundedCornerShape(12.dp)),
                    verticalArrangement = Arrangement.spacedBy(1.dp)
                ) {
                    items(pairedDevices) { device ->
                        val isConnecting = connectionState is PrinterState.Connecting
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable(enabled = !isConnecting) {
                                    coroutineScope.launch {
                                        viewModel.printerManager.connectToDevice(device)
                                    }
                                }
                                .padding(16.dp)
                                .testTag("printer_device_${device.address}"),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text(
                                    text = device.name ?: "Generic Thermal Printer",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = TextDark
                                )
                                Text(text = device.address, fontSize = 11.sp, color = Color.Gray)
                            }
                            
                            Icon(
                                imageVector = Icons.Default.BluetoothConnecting,
                                contentDescription = "Connect",
                                tint = BluePrimary,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Divider(color = BorderGray.copy(alpha = 0.5f))
                    }
                }
            }
        }

        // Right Column on Tablet (Visual thermal printer simulator overlay)
        if (isTablet || virtualReceipt.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .weight(0.9f)
                    .fillMaxHeight(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "Thermal Paper Feed Simulator",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = TextDark,
                    modifier = Modifier.padding(bottom = 8.dp)
                )

                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .clip(RoundedCornerShape(16.dp))
                        .background(Color.DarkGray)
                        .padding(16.dp)
                ) {
                    Column(modifier = Modifier.fillMaxSize()) {
                        // Slot cut
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(8.dp)
                                .background(Color.Black, RoundedCornerShape(50))
                        )
                        
                        Spacer(modifier = Modifier.height(8.dp))

                        if (virtualReceipt.isEmpty()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .weight(1f)
                                    .background(Color.LightGray.copy(alpha = 0.1f), RoundedCornerShape(8.dp)),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Thermal paper roll empty.\nComplete a checkout transaction to auto-feed receipt.",
                                    color = Color.LightGray,
                                    fontSize = 12.sp,
                                    textAlign = TextAlign.Center
                                )
                            }
                        } else {
                            // Thermal paper rollout sheet
                            Column(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth()
                                    .background(Color.White)
                                    .border(1.dp, Color.Gray)
                                    .padding(16.dp)
                            ) {
                                LazyColumn(
                                    modifier = Modifier.weight(1f),
                                    verticalArrangement = Arrangement.spacedBy(2.dp)
                                ) {
                                    items(virtualReceipt) { line ->
                                        Text(
                                            text = line,
                                            fontFamily = FontFamily.Monospace,
                                            fontSize = 12.sp,
                                            fontWeight = FontWeight.Bold,
                                            color = Color.Black,
                                            textAlign = if (line.contains("==") || line.contains("--")) TextAlign.Center else TextAlign.Start,
                                            modifier = Modifier.fillMaxWidth()
                                        )
                                    }
                                }

                                Spacer(modifier = Modifier.height(12.dp))

                                // Clear button
                                Button(
                                    onClick = { viewModel.printerManager.clearVirtualReceipt() },
                                    colors = ButtonDefaults.buttonColors(containerColor = ErrorRed),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.align(Alignment.CenterHorizontally)
                                ) {
                                    Text("TEAR PAPER", fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
