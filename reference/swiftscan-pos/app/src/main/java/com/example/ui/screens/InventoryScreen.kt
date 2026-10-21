package com.example.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.data.Product
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
fun InventoryScreen(
    viewModel: POSViewModel,
    isTablet: Boolean,
    modifier: Modifier = Modifier
) {
    val products by viewModel.products.collectAsState()
    
    var showAddDialog by remember { mutableStateOf(false) }
    var productToEdit by remember { mutableStateOf<Product?>(null) }
    
    var searchQuery by remember { mutableStateOf("") }
    val filteredProducts = products.filter {
        it.name.contains(searchQuery, ignoreCase = true) || it.sku.contains(searchQuery, ignoreCase = true)
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Inventory Management",
                        fontSize = 22.sp,
                        fontWeight = FontWeight.Bold,
                        color = TextDark
                    )
                    Text(
                        text = "Track item stock, barcode SKUs, and profit margins.",
                        fontSize = 14.sp,
                        color = Color.Gray
                    )
                }
                
                Button(
                    onClick = { showAddDialog = true },
                    colors = ButtonDefaults.buttonColors(containerColor = BluePrimary),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.testTag("add_product_button")
                ) {
                    Icon(Icons.Default.Add, contentDescription = "Add Product")
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("ADD PRODUCT", fontWeight = FontWeight.Bold)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // Search Filter
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("Search inventory by name, SKU or category...") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                shape = RoundedCornerShape(12.dp),
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = BluePrimary,
                    unfocusedBorderColor = BorderGray
                ),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Products Table Header (Tablet) or Simple Info List (Mobile)
            if (filteredProducts.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.Inventory, contentDescription = "Empty", modifier = Modifier.size(64.dp), tint = Color.LightGray)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text("No products in inventory", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = TextDark)
                        Text("Click 'ADD PRODUCT' above to insert your first stock item.", fontSize = 13.sp, color = Color.Gray)
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(filteredProducts) { product ->
                        InventoryItemRow(
                            product = product,
                            onEditClick = { productToEdit = product },
                            onDeleteClick = { viewModel.deleteProduct(product) }
                        )
                    }
                }
            }
        }

        // Add Product Dialog
        if (showAddDialog) {
            ProductFormDialog(
                onDismiss = { showAddDialog = false },
                onSave = { name, sku, price, cost, stock, category ->
                    viewModel.addProduct(name, sku, price, cost, stock, category)
                    showAddDialog = false
                }
            )
        }

        // Edit Product Dialog
        if (productToEdit != null) {
            ProductFormDialog(
                product = productToEdit,
                onDismiss = { productToEdit = null },
                onSave = { name, sku, price, cost, stock, category ->
                    productToEdit?.let {
                        viewModel.updateProduct(
                            it.copy(
                                name = name,
                                sku = sku,
                                price = price,
                                cost = cost,
                                stock = stock,
                                category = category
                            )
                        )
                    }
                    productToEdit = null
                }
            )
        }
    }
}

@Composable
fun InventoryItemRow(
    product: Product,
    onEditClick: () -> Unit,
    onDeleteClick: () -> Unit
) {
    val profit = product.price - product.cost
    val marginPercentage = if (product.price > 0) (profit / product.price) * 100 else 0.0
    val isLowStock = product.stock > 0 && product.stock < 10
    val isOutOfStock = product.stock == 0

    Card(
        colors = CardDefaults.cardColors(containerColor = Color.White),
        shape = RoundedCornerShape(12.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, BorderGray),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Category icon box
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .background(LightBlueBackground, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = when (product.category.lowercase()) {
                        "beverages" -> Icons.Default.LocalCafe
                        "bakery" -> Icons.Default.BreakfastDining
                        "produce" -> Icons.Default.Eco
                        "dairy" -> Icons.Default.WaterDrop
                        "grocery" -> Icons.Default.LocalGroceryStore
                        else -> Icons.Default.ShoppingBag
                    },
                    contentDescription = product.category,
                    tint = BluePrimary,
                    modifier = Modifier.size(20.dp)
                )
            }

            Spacer(modifier = Modifier.width(14.dp))

            // Main Info
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = product.name,
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp,
                    color = TextDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                
                Spacer(modifier = Modifier.height(2.dp))
                
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "SKU: ${product.sku}",
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Box(modifier = Modifier.size(3.dp).background(Color.Gray, CircleShape))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = product.category,
                        fontSize = 12.sp,
                        color = BlueSecondary,
                        fontWeight = FontWeight.Medium
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Price Metrics
                Row(
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = String.format("Price: $%.2f", product.price),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Bold,
                        color = OrangeAccent
                    )
                    Text(
                        text = String.format("Cost: $%.2f", product.cost),
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                    Text(
                        text = String.format("Margin: %.0f%%", marginPercentage),
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = SuccessGreen
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            // Stock tag & Actions
            Column(
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Stock Badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(
                            when {
                                isOutOfStock -> ErrorRed.copy(alpha = 0.15f)
                                isLowStock -> YellowAccent.copy(alpha = 0.25f)
                                else -> SuccessGreen.copy(alpha = 0.15f)
                            }
                        )
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = when {
                            isOutOfStock -> "OUT OF STOCK"
                            isLowStock -> "LOW STOCK: ${product.stock}"
                            else -> "STOCK: ${product.stock}"
                        },
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = when {
                            isOutOfStock -> ErrorRed
                            isLowStock -> OrangeAccent
                            else -> SuccessGreen
                        }
                    )
                }

                // Edit/Delete buttons
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(
                        onClick = onEditClick,
                        modifier = Modifier
                            .size(32.dp)
                            .background(OffWhite, CircleShape)
                    ) {
                        Icon(Icons.Default.Edit, contentDescription = "Edit", modifier = Modifier.size(16.dp), tint = BlueSecondary)
                    }

                    IconButton(
                        onClick = onDeleteClick,
                        modifier = Modifier
                            .size(32.dp)
                            .background(OffWhite, CircleShape)
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete", modifier = Modifier.size(16.dp), tint = ErrorRed)
                    }
                }
            }
        }
    }
}

@Composable
fun ProductFormDialog(
    product: Product? = null,
    onDismiss: () -> Unit,
    onSave: (name: String, sku: String, price: Double, cost: Double, stock: Int, category: String) -> Unit
) {
    var name by remember { mutableStateOf(product?.name ?: "") }
    var sku by remember { mutableStateOf(product?.sku ?: "") }
    var priceStr by remember { mutableStateOf(product?.price?.toString() ?: "") }
    var costStr by remember { mutableStateOf(product?.cost?.toString() ?: "") }
    var stockStr by remember { mutableStateOf(product?.stock?.toString() ?: "") }
    var category by remember { mutableStateOf(product?.category ?: "Grocery") }

    val categories = listOf("Grocery", "Produce", "Beverages", "Bakery", "Dairy", "Snacks")
    var categoryExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(
                text = if (product == null) "Add New Product" else "Edit Product",
                fontWeight = FontWeight.Bold,
                fontSize = 18.sp
            )
        },
        text = {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Product Name") },
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().testTag("product_name_input")
                )

                OutlinedTextField(
                    value = sku,
                    onValueChange = { sku = it },
                    label = { Text("Barcode SKU") },
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth().testTag("product_sku_input")
                )

                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    OutlinedTextField(
                        value = priceStr,
                        onValueChange = { priceStr = it },
                        label = { Text("Price ($)") },
                        shape = RoundedCornerShape(8.dp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f).testTag("product_price_input")
                    )

                    OutlinedTextField(
                        value = costStr,
                        onValueChange = { costStr = it },
                        label = { Text("Cost ($)") },
                        shape = RoundedCornerShape(8.dp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f).testTag("product_cost_input")
                    )
                }

                OutlinedTextField(
                    value = stockStr,
                    onValueChange = { stockStr = it },
                    label = { Text("Stock Level") },
                    shape = RoundedCornerShape(8.dp),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth().testTag("product_stock_input")
                )

                // Category selector
                Box(modifier = Modifier.fillMaxWidth()) {
                    OutlinedTextField(
                        value = category,
                        onValueChange = {},
                        label = { Text("Category") },
                        shape = RoundedCornerShape(8.dp),
                        readOnly = true,
                        trailingIcon = {
                            IconButton(onClick = { categoryExpanded = !categoryExpanded }) {
                                Icon(Icons.Default.ArrowDropDown, contentDescription = "Select Category")
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                    DropdownMenu(
                        expanded = categoryExpanded,
                        onDismissRequest = { categoryExpanded = false },
                        modifier = Modifier.fillMaxWidth(0.9f)
                    ) {
                        categories.forEach { cat ->
                            DropdownMenuItem(
                                text = { Text(cat) },
                                onClick = {
                                    category = cat
                                    categoryExpanded = false
                                }
                            )
                        }
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val price = priceStr.toDoubleOrNull() ?: 0.0
                    val cost = costStr.toDoubleOrNull() ?: 0.0
                    val stock = stockStr.toIntOrNull() ?: 0
                    if (name.isNotEmpty() && sku.isNotEmpty()) {
                        onSave(name, sku, price, cost, stock, category)
                    }
                },
                colors = ButtonDefaults.buttonColors(containerColor = BluePrimary)
            ) {
                Text("Save", color = Color.White)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = Color.Gray)
            }
        }
    )
}
