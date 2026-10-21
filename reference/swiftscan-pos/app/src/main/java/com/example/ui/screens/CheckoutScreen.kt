package com.example.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.Product
import com.example.ui.CartItem
import com.example.ui.CheckoutState
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    viewModel: POSViewModel,
    isTablet: Boolean,
    modifier: Modifier = Modifier
) {
    val searchQuery by viewModel.searchQuery.collectAsState()
    val selectedCategory by viewModel.selectedCategory.collectAsState()
    val filteredProducts by viewModel.filteredProducts.collectAsState()
    val cart by viewModel.cart.collectAsState()
    val isScanning by viewModel.isScanning.collectAsState()
    
    var showCartMobile by remember { mutableStateOf(false) }

    Box(modifier = modifier.fillMaxSize()) {
        if (isTablet) {
            // TABLET MODE: Two-column split-pane layout
            Row(modifier = Modifier.fillMaxSize()) {
                // Left Column: Search & Products Grid (60% width)
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .weight(1.2f)
                        .padding(16.dp)
                ) {
                    SearchAndCategoryHeader(
                        searchQuery = searchQuery,
                        onSearchChange = { viewModel.setSearchQuery(it) },
                        selectedCategory = selectedCategory,
                        onCategorySelect = { viewModel.setCategoryFilter(it) },
                        onScanClick = { viewModel.toggleScanning(true) }
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    ProductsGrid(
                        products = filteredProducts,
                        onProductClick = { viewModel.addToCart(it) },
                        columnsCount = 3
                    )
                }

                // Vertical Divider
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(1.dp)
                        .background(BorderGray)
                )

                // Right Column: Active Cart & Totals (40% width)
                Column(
                    modifier = Modifier
                        .fillMaxHeight()
                        .weight(0.8f)
                        .background(Color.White)
                        .padding(16.dp)
                ) {
                    CartSection(viewModel = viewModel)
                }
            }
        } else {
            // MOBILE MODE: Standard List + Bottom Sheet Cart Trigger
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(12.dp)
            ) {
                SearchAndCategoryHeader(
                    searchQuery = searchQuery,
                    onSearchChange = { viewModel.setSearchQuery(it) },
                    selectedCategory = selectedCategory,
                    onCategorySelect = { viewModel.setCategoryFilter(it) },
                    onScanClick = { viewModel.toggleScanning(true) }
                )

                Spacer(modifier = Modifier.height(12.dp))

                Box(modifier = Modifier.weight(1f)) {
                    ProductsGrid(
                        products = filteredProducts,
                        onProductClick = { viewModel.addToCart(it) },
                        columnsCount = 2
                    )
                }

                // Mobile active cart bar
                if (cart.isNotEmpty()) {
                    Card(
                        onClick = { showCartMobile = true },
                        colors = CardDefaults.cardColors(containerColor = BluePrimary),
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 8.dp)
                            .testTag("mobile_cart_trigger"),
                        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(28.dp)
                                        .background(YellowAccent, CircleShape),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(
                                        text = cart.sumOf { it.quantity }.toString(),
                                        color = TextDark,
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 14.sp
                                    )
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    text = "View Active Order",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 16.sp
                                )
                            }
                            
                            val totalAmount by viewModel.total.collectAsState()
                            Text(
                                text = String.format("$%.2f", totalAmount),
                                color = Color.White,
                                fontWeight = FontWeight.Black,
                                fontSize = 18.sp
                            )
                        }
                    }
                }
            }
        }

        // Camera barcode scanner overlay
        if (isScanning) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black)
            ) {
                CameraScannerView(
                    onBarcodeDetected = { barcode ->
                        viewModel.handleScannedBarcode(barcode)
                    },
                    onClose = { viewModel.toggleScanning(false) }
                )
            }
        }

        // Mobile Cart Bottom Sheet Modal
        if (showCartMobile && !isTablet) {
            ModalBottomSheet(
                onDismissRequest = { showCartMobile = false },
                containerColor = OffWhite,
                shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxHeight(0.85f)
                        .padding(16.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Shopping Cart",
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Bold,
                            color = TextDark
                        )
                        IconButton(onClick = { showCartMobile = false }) {
                            Icon(Icons.Default.Close, contentDescription = "Close")
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Box(modifier = Modifier.weight(1f)) {
                        CartSection(viewModel = viewModel, onCheckoutComplete = {
                            showCartMobile = false
                        })
                    }
                }
            }
        }
    }
}

@Composable
fun SearchAndCategoryHeader(
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    selectedCategory: String,
    onCategorySelect: (String) -> Unit,
    onScanClick: () -> Unit
) {
    val categories = listOf("All", "Produce", "Beverages", "Bakery", "Dairy", "Grocery", "Snacks")

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchChange,
                placeholder = { Text("Search by name or scan barcode...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                shape = RoundedCornerShape(12.dp),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = BluePrimary,
                    unfocusedBorderColor = BorderGray
                ),
                modifier = Modifier
                    .weight(1f)
                    .testTag("search_input")
            )
            
            Spacer(modifier = Modifier.width(8.dp))
            
            IconButton(
                onClick = onScanClick,
                colors = IconButtonDefaults.iconButtonColors(containerColor = BluePrimary),
                modifier = Modifier
                    .size(54.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .testTag("scan_barcode_button")
            ) {
                Icon(
                    imageVector = Icons.Outlined.QrCodeScanner,
                    contentDescription = "Scan Barcode",
                    tint = Color.White,
                    modifier = Modifier.size(28.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        LazyRow(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(end = 16.dp)
        ) {
            items(categories) { category ->
                val isSelected = category == selectedCategory
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(50))
                        .background(if (isSelected) YellowAccent else LightBlueBackground)
                        .clickable { onCategorySelect(category) }
                        .padding(horizontal = 16.dp, vertical = 8.dp)
                ) {
                    Text(
                        text = category,
                        color = if (isSelected) TextDark else BluePrimary,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        fontSize = 13.sp
                    )
                }
            }
        }
    }
}

@Composable
fun ProductsGrid(
    products: List<Product>,
    onProductClick: (Product) -> Unit,
    columnsCount: Int
) {
    if (products.isEmpty()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                Icons.Default.Inbox,
                contentDescription = "No products",
                modifier = Modifier.size(64.dp),
                tint = Color.Gray
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "No Products Found",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = TextDark
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Try clearing search filter or add some products inside the Inventory tab.",
                fontSize = 14.sp,
                color = Color.Gray,
                textAlign = TextAlign.Center
            )
        }
    } else {
        LazyVerticalGrid(
            columns = GridCells.Fixed(columnsCount),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(products) { product ->
                ProductCard(product = product, onClick = { onProductClick(product) })
            }
        }
    }
}

@Composable
fun ProductCard(
    product: Product,
    onClick: () -> Unit
) {
    val isLowStock = product.stock > 0 && product.stock < 10
    val isOutOfStock = product.stock == 0

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !isOutOfStock) { onClick() }
            .testTag("product_card_${product.id}"),
        colors = CardDefaults.cardColors(
            containerColor = if (isOutOfStock) Color.LightGray.copy(alpha = 0.3f) else Color.White
        ),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, BorderGray)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            // Category tag
            Box(
                modifier = Modifier
                    .background(LightBlueBackground, RoundedCornerShape(4.dp))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = product.category.uppercase(),
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    color = BlueSecondary
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Title
            Text(
                text = product.name,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = if (isOutOfStock) Color.Gray else TextDark,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.height(40.dp)
            )

            Spacer(modifier = Modifier.height(4.dp))

            // Barcode / SKU
            Text(
                text = "SKU: ${product.sku}",
                fontSize = 11.sp,
                color = Color.Gray
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Price & Stock
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = String.format("$%.2f", product.price),
                    fontWeight = FontWeight.Black,
                    fontSize = 16.sp,
                    color = if (isOutOfStock) Color.Gray else OrangeAccent
                )

                // Stock indicator
                Box(
                    modifier = Modifier
                        .background(
                            when {
                                isOutOfStock -> ErrorRed.copy(alpha = 0.15f)
                                isLowStock -> YellowAccent.copy(alpha = 0.25f)
                                else -> SuccessGreen.copy(alpha = 0.15f)
                            },
                            RoundedCornerShape(4.dp)
                        )
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = when {
                            isOutOfStock -> "OUT"
                            isLowStock -> "LOW: ${product.stock}"
                            else -> "STK: ${product.stock}"
                        },
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        color = when {
                            isOutOfStock -> ErrorRed
                            isLowStock -> OrangeAccent
                            else -> SuccessGreen
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun CartSection(
    viewModel: POSViewModel,
    onCheckoutComplete: () -> Unit = {}
) {
    val cart by viewModel.cart.collectAsState()
    val checkoutState by viewModel.checkoutState.collectAsState()
    val subtotal by viewModel.subtotal.collectAsState()
    val discountAmount by viewModel.discountAmount.collectAsState()
    val discountPercentage by viewModel.discountPercentage.collectAsState()
    val taxAmount by viewModel.taxAmount.collectAsState()
    val total by viewModel.total.collectAsState()
    val paymentMethod by viewModel.paymentMethod.collectAsState()

    var showSuccessDialog by remember { mutableStateOf(false) }

    // Dialog state for checkout completion
    LaunchedEffect(checkoutState) {
        if (checkoutState is CheckoutState.Success) {
            showSuccessDialog = true
        }
    }

    if (cart.isEmpty()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Icon(
                Icons.Default.ShoppingCart,
                contentDescription = "Empty Cart",
                modifier = Modifier.size(64.dp),
                tint = Color.LightGray
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = "Shopping Cart is Empty",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = TextDark
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = "Select products from the catalog on the left to start a transaction.",
                fontSize = 14.sp,
                color = Color.Gray,
                textAlign = TextAlign.Center
            )
        }
    } else {
        Column(modifier = Modifier.fillMaxSize()) {
            Text(
                text = "Active Order",
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold,
                color = TextDark,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            // Items list
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(cart) { item ->
                    CartItemRow(item = item, onQtyChange = { qty ->
                        viewModel.updateCartQuantity(item.product.id, qty)
                    }, onRemove = {
                        viewModel.removeFromCart(item.product.id)
                    })
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            Divider(color = BorderGray)
            Spacer(modifier = Modifier.height(12.dp))

            // Discounts Selection Row
            Text(
                text = "Apply Discount",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = Color.Gray
            )
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                listOf(0, 5, 10, 15, 20).forEach { disc ->
                    val isSelected = disc == discountPercentage
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isSelected) YellowAccent else LightBlueBackground)
                            .clickable { viewModel.setDiscount(disc) }
                            .padding(vertical = 8.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = if (disc == 0) "None" else "$disc%",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (isSelected) TextDark else BluePrimary
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Payment Methods Row
            Text(
                text = "Payment Method",
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                color = Color.Gray
            )
            Spacer(modifier = Modifier.height(6.dp))
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                listOf("Cash", "Card", "Mobile").forEach { method ->
                    val isSelected = method == paymentMethod
                    Button(
                        onClick = { viewModel.setPaymentMethod(method) },
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (isSelected) BluePrimary else LightBlueBackground,
                            contentColor = if (isSelected) Color.White else BluePrimary
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.weight(1f),
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = when (method) {
                                    "Cash" -> Icons.Default.Payments
                                    "Card" -> Icons.Default.CreditCard
                                    else -> Icons.Default.QrCode
                                },
                                contentDescription = method,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(text = method, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Totals breakdown
            Card(
                colors = CardDefaults.cardColors(containerColor = OffWhite),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Subtotal", color = Color.Gray, fontSize = 13.sp)
                        Text(String.format("$%.2f", subtotal), color = TextDark, fontSize = 13.sp)
                    }
                    if (discountPercentage > 0) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("Discount ($discountPercentage%)", color = SuccessGreen, fontSize = 13.sp)
                            Text(String.format("-$%.2f", discountAmount), color = SuccessGreen, fontSize = 13.sp)
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text("Tax (10%)", color = Color.Gray, fontSize = 13.sp)
                        Text(String.format("$%.2f", taxAmount), color = TextDark, fontSize = 13.sp)
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                    Divider(color = BorderGray)
                    Spacer(modifier = Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("TOTAL AMOUNT", fontWeight = FontWeight.Bold, color = TextDark, fontSize = 15.sp)
                        Text(
                            String.format("$%.2f", total),
                            fontWeight = FontWeight.Black,
                            color = OrangeAccent,
                            fontSize = 20.sp
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Primary Checkout Button
            Button(
                onClick = { viewModel.processCheckout() },
                enabled = checkoutState !is CheckoutState.Processing,
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(54.dp)
                    .testTag("process_checkout_button")
            ) {
                if (checkoutState is CheckoutState.Processing) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                } else {
                    Icon(Icons.Default.CheckCircle, contentDescription = "Checkout")
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "COMPLETE CHECKOUT",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        color = Color.White
                    )
                }
            }
        }
    }

    // Success dialog
    if (showSuccessDialog) {
        val successTx = (checkoutState as? CheckoutState.Success)?.transaction
        AlertDialog(
            onDismissRequest = {
                showSuccessDialog = false
                viewModel.resetCheckoutState()
                onCheckoutComplete()
            },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.CheckCircle, contentDescription = "Success", tint = SuccessGreen, modifier = Modifier.size(32.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Checkout Successful!", fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column {
                    Text("Transaction has been successfully saved to the local offline database.", fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(12.dp))
                    if (successTx != null) {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = LightBlueBackground),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(12.dp)) {
                                Text("Receipt ID: ${successTx.id}", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = BluePrimary)
                                Text("Amount: " + String.format("$%.2f", successTx.total), fontWeight = FontWeight.Bold, fontSize = 14.sp, color = OrangeAccent)
                                Text("Method: ${successTx.paymentMethod}", fontSize = 12.sp)
                                Spacer(modifier = Modifier.height(4.dp))
                                Text("A receipt has been printed to the connected Bluetooth device or the virtual thermal printer feed.", fontSize = 11.sp, color = Color.Gray)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        showSuccessDialog = false
                        viewModel.resetCheckoutState()
                        onCheckoutComplete()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
                ) {
                    Text("Done", color = Color.White)
                }
            }
        )
    }
}

@Composable
fun CartItemRow(
    item: CartItem,
    onQtyChange: (Int) -> Unit,
    onRemove: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(OffWhite)
            .padding(10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = item.product.name,
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                color = TextDark,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = String.format("$%.2f ea", item.product.price),
                fontSize = 11.sp,
                color = Color.Gray
            )
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            // Decrease
            IconButton(
                onClick = { onQtyChange(item.quantity - 1) },
                modifier = Modifier
                    .size(28.dp)
                    .background(Color.White, CircleShape)
                    .border(0.5.dp, BorderGray, CircleShape)
            ) {
                Icon(Icons.Default.Remove, contentDescription = "Decrease", modifier = Modifier.size(16.dp), tint = BluePrimary)
            }

            // Qty
            Text(
                text = item.quantity.toString(),
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
                color = TextDark,
                modifier = Modifier.padding(horizontal = 6.dp)
            )

            // Increase
            IconButton(
                onClick = { onQtyChange(item.quantity + 1) },
                enabled = item.quantity < item.product.stock,
                modifier = Modifier
                    .size(28.dp)
                    .background(Color.White, CircleShape)
                    .border(0.5.dp, BorderGray, CircleShape)
            ) {
                Icon(Icons.Default.Add, contentDescription = "Increase", modifier = Modifier.size(16.dp), tint = BluePrimary)
            }

            Spacer(modifier = Modifier.width(6.dp))

            // Delete
            IconButton(
                onClick = onRemove,
                modifier = Modifier.size(28.dp)
            ) {
                Icon(Icons.Default.Delete, contentDescription = "Remove", modifier = Modifier.size(18.dp), tint = ErrorRed)
            }
        }
    }
}
