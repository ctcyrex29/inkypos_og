package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "products")
data class Product(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val sku: String, // Barcode / SKU
    val price: Double,
    val cost: Double, // Cost price (for profit reporting)
    val stock: Int,
    val category: String
)
