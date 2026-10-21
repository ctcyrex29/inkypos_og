package com.example.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.AppDatabase
import com.example.data.POSRepository
import com.example.data.Product
import com.example.data.SyncResult
import com.example.data.Transaction
import com.example.data.TransactionItem
import com.example.printer.PrinterManager
import com.example.printer.PrinterState
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

data class CartItem(
    val product: Product,
    val quantity: Int
)

sealed class CheckoutState {
    object Idle : CheckoutState()
    object Processing : CheckoutState()
    data class Success(val transaction: Transaction) : CheckoutState()
    data class Error(val message: String) : CheckoutState()
}

sealed class SyncState {
    object Idle : SyncState()
    object Syncing : SyncState()
    data class Success(val count: Int) : SyncState()
    data class Error(val message: String) : SyncState()
}

class POSViewModel(application: Application) : AndroidViewModel(application) {

    private val db = AppDatabase.getDatabase(application)
    private val repository = POSRepository(db.productDao(), db.transactionDao())
    val printerManager = PrinterManager(application)

    // Data sources
    val products: StateFlow<List<Product>> = repository.allProducts
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val transactions: StateFlow<List<Transaction>> = repository.allTransactions
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Cart Management
    private val _cart = MutableStateFlow<List<CartItem>>(emptyList())
    val cart: StateFlow<List<CartItem>> = _cart.asStateFlow()

    // Discount and Taxes
    private val _discountPercentage = MutableStateFlow(0) // 0%, 5%, 10%, 15% etc
    val discountPercentage: StateFlow<Int> = _discountPercentage.asStateFlow()

    private val _paymentMethod = MutableStateFlow("Cash") // Cash, Card, Mobile
    val paymentMethod: StateFlow<String> = _paymentMethod.asStateFlow()

    // Camera Barcode Scanning
    private val _isScanning = MutableStateFlow(false)
    val isScanning: StateFlow<Boolean> = _isScanning.asStateFlow()

    // UI state
    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _selectedCategory = MutableStateFlow("All")
    val selectedCategory: StateFlow<String> = _selectedCategory.asStateFlow()

    // Filtered products list
    val filteredProducts: StateFlow<List<Product>> = combine(
        products,
        _searchQuery,
        _selectedCategory
    ) { productsList, query, category ->
        productsList.filter { product ->
            val matchesQuery = product.name.contains(query, ignoreCase = true) || 
                               product.sku.contains(query, ignoreCase = true)
            val matchesCategory = category == "All" || product.category == category
            matchesQuery && matchesCategory
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // Cart Totals calculations
    val subtotal: StateFlow<Double> = _cart.combine(_cart) { cartList, _ ->
        cartList.sumOf { it.product.price * it.quantity }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    val discountAmount: StateFlow<Double> = combine(subtotal, _discountPercentage) { sub, discPercent ->
        sub * (discPercent / 100.0)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    val taxAmount: StateFlow<Double> = combine(subtotal, discountAmount) { sub, disc ->
        // 10% tax rate on the taxable amount (subtotal - discount)
        (sub - disc).coerceAtLeast(0.0) * 0.10
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    val total: StateFlow<Double> = combine(subtotal, discountAmount, taxAmount) { sub, disc, tax ->
        (sub - disc + tax).coerceAtLeast(0.0)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    // Sync state
    private val _syncState = MutableStateFlow<SyncState>(SyncState.Idle)
    val syncState: StateFlow<SyncState> = _syncState.asStateFlow()

    private val _syncProgress = MutableStateFlow("")
    val syncProgress: StateFlow<String> = _syncProgress.asStateFlow()

    // Checkout state
    private val _checkoutState = MutableStateFlow<CheckoutState>(CheckoutState.Idle)
    val checkoutState: StateFlow<CheckoutState> = _checkoutState.asStateFlow()

    init {
        // Pre-populate with dummy items if database is empty
        viewModelScope.launch {
            products.collect { list ->
                if (list.isEmpty()) {
                    insertDemoProducts()
                }
            }
        }
    }

    // Cart Actions
    fun addToCart(product: Product) {
        val current = _cart.value.toMutableList()
        val index = current.indexOfFirst { it.product.id == product.id }
        if (index != -1) {
            val item = current[index]
            if (item.quantity < product.stock) {
                current[index] = item.copy(quantity = item.quantity + 1)
            }
        } else {
            if (product.stock > 0) {
                current.add(CartItem(product, 1))
            }
        }
        _cart.value = current
    }

    fun handleScannedBarcode(barcode: String) {
        viewModelScope.launch {
            val product = repository.getProductBySku(barcode)
            if (product != null) {
                addToCart(product)
                _isScanning.value = false // Close camera after scanning successfully
            }
        }
    }

    fun removeFromCart(productId: Int) {
        val current = _cart.value.toMutableList()
        val index = current.indexOfFirst { it.product.id == productId }
        if (index != -1) {
            current.removeAt(index)
        }
        _cart.value = current
    }

    fun updateCartQuantity(productId: Int, quantity: Int) {
        if (quantity <= 0) {
            removeFromCart(productId)
            return
        }
        val current = _cart.value.toMutableList()
        val index = current.indexOfFirst { it.product.id == productId }
        if (index != -1) {
            val item = current[index]
            if (quantity <= item.product.stock) {
                current[index] = item.copy(quantity = quantity)
            }
        }
        _cart.value = current
    }

    fun clearCart() {
        _cart.value = emptyList()
        _discountPercentage.value = 0
        _checkoutState.value = CheckoutState.Idle
    }

    fun setDiscount(percentage: Int) {
        _discountPercentage.value = percentage
    }

    fun setPaymentMethod(method: String) {
        _paymentMethod.value = method
    }

    fun toggleScanning(active: Boolean) {
        _isScanning.value = active
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    fun setCategoryFilter(category: String) {
        _selectedCategory.value = category
    }

    // Checkout
    fun processCheckout(businessName: String = "SMART POS MINI-MART") {
        val items = _cart.value
        if (items.isEmpty()) {
            _checkoutState.value = CheckoutState.Error("Cart is empty")
            return
        }

        _checkoutState.value = CheckoutState.Processing
        viewModelScope.launch {
            try {
                val sub = subtotal.value
                val disc = discountAmount.value
                val tax = taxAmount.value
                val tot = total.value
                val payMethod = _paymentMethod.value
                
                // Construct transaction items
                val transactionItems = items.map {
                    TransactionItem(
                        productId = it.product.id,
                        name = it.product.name,
                        quantity = it.quantity,
                        unitPrice = it.product.price,
                        unitCost = it.product.cost
                    )
                }

                // Serialize items list using basic custom serialization (safe and direct)
                val itemsJson = serializeTransactionItems(transactionItems)

                val txId = "TX-${System.currentTimeMillis() % 100000000}"
                val transaction = Transaction(
                    id = txId,
                    timestamp = System.currentTimeMillis(),
                    itemsJson = itemsJson,
                    subtotal = sub,
                    tax = tax,
                    discount = disc,
                    total = tot,
                    paymentMethod = payMethod,
                    isSynced = false // Initial status
                )

                // Save to Room and update stock
                repository.insertTransaction(transaction, transactionItems)

                // Print receipt (physically write if connected, and saves to onscreen buffer)
                printerManager.printReceipt(transaction, transactionItems, businessName)

                // Complete checkout state
                _checkoutState.value = CheckoutState.Success(transaction)
                _cart.value = emptyList() // clear cart
                _discountPercentage.value = 0
            } catch (e: Exception) {
                _checkoutState.value = CheckoutState.Error("Checkout failed: ${e.localizedMessage}")
            }
        }
    }

    fun resetCheckoutState() {
        _checkoutState.value = CheckoutState.Idle
    }

    // Cloud Database Sync
    fun syncWithCloud() {
        _syncState.value = SyncState.Syncing
        _syncProgress.value = "Starting secure synchronization..."
        viewModelScope.launch {
            val result = repository.syncUnsyncedTransactions { progressMessage ->
                _syncProgress.value = progressMessage
            }
            when (result) {
                is SyncResult.Success -> {
                    _syncState.value = SyncState.Success(result.count)
                    _syncProgress.value = "All transactions synced successfully!"
                }
                is SyncResult.Failure -> {
                    _syncState.value = SyncState.Error(result.error)
                    _syncProgress.value = "Sync failed: ${result.error}"
                }
            }
        }
    }

    fun resetSyncState() {
        _syncState.value = SyncState.Idle
        _syncProgress.value = ""
    }

    // Inventory operations
    fun addProduct(name: String, sku: String, price: Double, cost: Double, stock: Int, category: String) {
        viewModelScope.launch {
            repository.insertProduct(
                Product(name = name, sku = sku, price = price, cost = cost, stock = stock, category = category)
            )
        }
    }

    fun updateProduct(product: Product) {
        viewModelScope.launch {
            repository.updateProduct(product)
        }
    }

    fun deleteProduct(product: Product) {
        viewModelScope.launch {
            repository.deleteProduct(product)
        }
    }

    // Helper functions for manual serialization to avoid runtime Moshi compile complexity
    private fun serializeTransactionItems(items: List<TransactionItem>): String {
        val builder = StringBuilder()
        builder.append("[")
        items.forEachIndexed { index, item ->
            builder.append("{")
            builder.append("\"productId\":${item.productId},")
            builder.append("\"name\":\"${item.name.replace("\"", "\\\"")}\",")
            builder.append("\"quantity\":${item.quantity},")
            builder.append("\"unitPrice\":${item.unitPrice},")
            builder.append("\"unitCost\":${item.unitCost}")
            builder.append("}")
            if (index < items.size - 1) {
                builder.append(",")
            }
        }
        builder.append("]")
        return builder.toString()
    }

    fun deserializeTransactionItems(json: String): List<TransactionItem> {
        val list = mutableListOf<TransactionItem>()
        try {
            // Very simple JSON parser for TransactionItem list
            var index = 0
            while (true) {
                val start = json.indexOf("{", index)
                if (start == -1) break
                val end = json.indexOf("}", start)
                if (end == -1) break
                val objStr = json.substring(start + 1, end)
                
                var pId = 0
                var name = ""
                var qty = 0
                var uPrice = 0.0
                var uCost = 0.0

                val parts = objStr.split(",")
                parts.forEach { part ->
                    val pair = part.split(":")
                    if (pair.size == 2) {
                        val key = pair[0].trim().replace("\"", "")
                        val value = pair[1].trim()
                        when (key) {
                            "productId" -> pId = value.toInt()
                            "name" -> name = value.replace("\"", "")
                            "quantity" -> qty = value.toInt()
                            "unitPrice" -> uPrice = value.toDouble()
                            "unitCost" -> uCost = value.toDouble()
                        }
                    }
                }
                list.add(TransactionItem(pId, name, qty, uPrice, uCost))
                index = end + 1
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return list
    }

    private suspend fun insertDemoProducts() {
        val demos = listOf(
            Product(name = "Organic Espresso Beans", sku = "880101111", price = 14.99, cost = 6.50, stock = 45, category = "Beverages"),
            Product(name = "Whole Wheat Sourdough Bread", sku = "880101122", price = 4.50, cost = 1.20, stock = 12, category = "Bakery"),
            Product(name = "Premium Olive Oil 500ml", sku = "880101133", price = 18.25, cost = 9.00, stock = 20, category = "Grocery"),
            Product(name = "Fresh Red Apples (Bag)", sku = "880101144", price = 3.99, cost = 1.50, stock = 30, category = "Produce"),
            Product(name = "Whole Milk 1 Gallon", sku = "880101155", price = 4.20, cost = 2.00, stock = 18, category = "Dairy"),
            Product(name = "Artisanal Dark Chocolate Bar", sku = "880101166", price = 5.50, cost = 2.20, stock = 50, category = "Snacks"),
            Product(name = "Cold Brew Iced Coffee", sku = "880101177", price = 3.75, cost = 1.10, stock = 25, category = "Beverages"),
            Product(name = "Avocados (3 Pack)", sku = "880101188", price = 4.99, cost = 2.10, stock = 15, category = "Produce"),
            Product(name = "Gourmet Potato Chips 150g", sku = "880101199", price = 3.20, cost = 1.00, stock = 40, category = "Snacks")
        )
        demos.forEach { repository.insertProduct(it) }
    }
}
