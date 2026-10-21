package com.example.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.example.ui.screens.CheckoutScreen
import com.example.ui.screens.InventoryScreen
import com.example.ui.screens.PrinterScreen
import com.example.ui.screens.ReportsScreen
import com.example.ui.theme.BluePrimary
import com.example.ui.theme.BorderGray
import com.example.ui.theme.OffWhite
import com.example.ui.theme.OrangeAccent
import com.example.ui.theme.TextDark
import com.example.ui.theme.YellowAccent

sealed class Screen(val title: String, val icon: ImageVector, val tag: String) {
    object Checkout : Screen("Checkout POS", Icons.Default.ShoppingCart, "tab_checkout")
    object Inventory : Screen("Inventory", Icons.Default.Inventory, "tab_inventory")
    object Reports : Screen("Reports & Sync", Icons.Default.BarChart, "tab_reports")
    object Printer : Screen("Printer Settings", Icons.Default.Print, "tab_printer")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun POSApp(
    viewModel: POSViewModel = viewModel(),
    modifier: Modifier = Modifier
) {
    var currentScreen by remember { mutableStateOf<Screen>(Screen.Checkout) }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val isTablet = maxWidth > 760.dp

        Scaffold(
            topBar = {
                // Main Header Bar
                TopAppBar(
                    title = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            // Logo Box
                            Box(
                                modifier = Modifier
                                    .size(36.dp)
                                    .background(YellowAccent, CircleShape)
                                    .border(1.dp, OrangeAccent, CircleShape),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Store,
                                    contentDescription = "POS Logo",
                                    tint = TextDark,
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "Smart POS Suite",
                                    fontWeight = FontWeight.Black,
                                    fontSize = 17.sp,
                                    color = Color.White
                                )
                                Text(
                                    text = "Offline-First Small Business POS",
                                    fontSize = 11.sp,
                                    color = Color.LightGray
                                )
                            }
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = BluePrimary,
                        titleContentColor = Color.White
                    ),
                    actions = {
                        // Unsynced indicator helper badge
                        val transactions by viewModel.transactions.collectAsState()
                        val unsyncedCount = transactions.count { !it.isSynced }
                        if (unsyncedCount > 0) {
                            Badge(
                                containerColor = OrangeAccent,
                                contentColor = Color.White,
                                modifier = Modifier
                                    .padding(end = 16.dp)
                                    .testTag("unsynced_badge")
                            ) {
                                Text("$unsyncedCount OFFLINE LOGS", fontSize = 10.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp))
                            }
                        }
                    }
                )
            },
            bottomBar = {
                // MOBILE NAVIGATION: Bottom Navigation Bar
                if (!isTablet) {
                    NavigationBar(
                        containerColor = Color.White,
                        tonalElevation = 8.dp,
                        modifier = Modifier.windowInsetsPadding(WindowInsets.navigationBars)
                    ) {
                        listOf(Screen.Checkout, Screen.Inventory, Screen.Reports, Screen.Printer).forEach { screen ->
                            val isSelected = currentScreen == screen
                            NavigationBarItem(
                                selected = isSelected,
                                onClick = { currentScreen = screen },
                                icon = {
                                    Icon(
                                        imageVector = screen.icon,
                                        contentDescription = screen.title
                                    )
                                },
                                label = {
                                    Text(
                                        text = screen.title.split(" ").first(),
                                        fontSize = 11.sp,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                                    )
                                },
                                colors = NavigationBarItemDefaults.colors(
                                    selectedIconColor = BluePrimary,
                                    selectedTextColor = BluePrimary,
                                    indicatorColor = YellowAccent,
                                    unselectedIconColor = Color.Gray,
                                    unselectedTextColor = Color.Gray
                                ),
                                modifier = Modifier.testTag(screen.tag)
                            )
                        }
                    }
                }
            }
        ) { innerPadding ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .background(OffWhite)
            ) {
                // TABLET NAVIGATION: Sidebar Navigation Rail on Left
                if (isTablet) {
                    NavigationRail(
                        containerColor = Color.White,
                        header = {
                            Spacer(modifier = Modifier.height(8.dp))
                        },
                        modifier = Modifier
                            .fillMaxHeight()
                            .border(width = 1.dp, color = BorderGray)
                    ) {
                        listOf(Screen.Checkout, Screen.Inventory, Screen.Reports, Screen.Printer).forEach { screen ->
                            val isSelected = currentScreen == screen
                            NavigationRailItem(
                                selected = isSelected,
                                onClick = { currentScreen = screen },
                                icon = {
                                    Icon(
                                        imageVector = screen.icon,
                                        contentDescription = screen.title
                                    )
                                },
                                label = {
                                    Text(
                                        text = screen.title,
                                        fontSize = 11.sp,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                                    )
                                },
                                colors = NavigationRailItemDefaults.colors(
                                    selectedIconColor = BluePrimary,
                                    selectedTextColor = BluePrimary,
                                    indicatorColor = YellowAccent,
                                    unselectedIconColor = Color.Gray,
                                    unselectedTextColor = Color.Gray
                                ),
                                modifier = Modifier
                                    .padding(vertical = 4.dp)
                                    .testTag(screen.tag)
                            )
                        }
                    }
                }

                // Main Content Screen Holder
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f)
                ) {
                    when (currentScreen) {
                        is Screen.Checkout -> CheckoutScreen(viewModel = viewModel, isTablet = isTablet)
                        is Screen.Inventory -> InventoryScreen(viewModel = viewModel, isTablet = isTablet)
                        is Screen.Reports -> ReportsScreen(viewModel = viewModel, isTablet = isTablet)
                        is Screen.Printer -> PrinterScreen(viewModel = viewModel, isTablet = isTablet)
                    }
                }
            }
        }
    }
}
