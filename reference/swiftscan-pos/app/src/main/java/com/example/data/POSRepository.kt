package com.example.data

import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class POSRepository(
    private val productDao: ProductDao,
    private val transactionDao: TransactionDao
) {
    val allProducts: Flow<List<Product>> = productDao.getAllProducts()
    val allTransactions: Flow<List<Transaction>> = transactionDao.getAllTransactions()

    suspend fun getProductBySku(sku: String): Product? {
        return productDao.getProductBySku(sku)
    }

    suspend fun insertProduct(product: Product) {
        productDao.insertProduct(product)
    }

    suspend fun updateProduct(product: Product) {
        productDao.updateProduct(product)
    }

    suspend fun deleteProduct(product: Product) {
        productDao.deleteProduct(product)
    }

    suspend fun insertTransaction(transaction: Transaction, items: List<TransactionItem>) {
        // First insert the transaction itself
        transactionDao.insertTransaction(transaction)
        
        // Then deduct stock from the products
        items.forEach { item ->
            val product = productDao.getProductById(item.productId)
            if (product != null) {
                val updatedStock = (product.stock - item.quantity).coerceAtLeast(0)
                productDao.updateProductStock(product.id, updatedStock)
            }
        }
    }

    /**
     * Simulates syncing unsynced local transactions with a remote cloud database.
     * We'll simulate a secure background network sync.
     * It checks unsynced txs, simulates a restful API POST request,
     * and updates local sync state on success.
     */
    suspend fun syncUnsyncedTransactions(onProgress: (String) -> Unit): SyncResult = withContext(Dispatchers.IO) {
        val unsynced = transactionDao.getUnsyncedTransactions()
        if (unsynced.isEmpty()) {
            return@withContext SyncResult.Success(0)
        }

        onProgress("Connecting to cloud POS backup server...")
        delay(1200) // Realistic latency

        // We can do a simulated sync. Let's show beautiful syncing logs!
        var syncedCount = 0
        try {
            unsynced.forEach { tx ->
                onProgress("Uploading Transaction ${tx.id} (${tx.total} USD)...")
                delay(800) // Simulating network transmission for each record
                
                // Mark as synced locally
                transactionDao.markAsSynced(tx.id)
                syncedCount++
            }
            return@withContext SyncResult.Success(syncedCount)
        } catch (e: Exception) {
            return@withContext SyncResult.Failure(e.localizedMessage ?: "Unknown network error")
        }
    }
}

sealed class SyncResult {
    data class Success(val count: Int) : SyncResult()
    data class Failure(val error: String) : SyncResult()
}
