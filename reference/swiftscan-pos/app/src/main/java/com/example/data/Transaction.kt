package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "transactions")
data class Transaction(
    @PrimaryKey val id: String, // E.g. TX-168341234
    val timestamp: Long,
    val itemsJson: String, // JSON list of TransactionItem
    val subtotal: Double,
    val tax: Double,
    val discount: Double,
    val total: Double,
    val paymentMethod: String, // E.g., "Cash", "Card", "Mobile"
    val isSynced: Boolean = false // Sync status for offline-first design
)

data class TransactionItem(
    val productId: Int,
    val name: String,
    val quantity: Int,
    val unitPrice: Double,
    val unitCost: Double // For exact profit calculation
)
