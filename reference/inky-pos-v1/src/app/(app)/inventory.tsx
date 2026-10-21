// src/app/(app)/inventory.tsx
import { useFocusEffect } from "expo-router";
import {
    BarChart2,
    Edit3,
    FolderPlus,
    Package,
    PlusCircle,
    Search,
} from "lucide-react-native";
import React, { useState } from "react";
import {
    Alert,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Category, Product } from "../../db/schema";
import { generateUUID, getDatabase } from "../../db/sqlite";
import { useAuthStore } from "../../store/useAuthStore";
import { usePortalRouteGuard } from "../../utils/portalGuard";

export default function InventoryScreen() {
  usePortalRouteGuard(["inventory"]);

  const dbPromise = getDatabase();
  const { user } = useAuthStore();
  const isOperator = user?.role === "operator"; // Operators cannot view costs or adjust stock

  // Navigation tabs
  const [activeTab, setActiveTab] = useState<
    "catalog" | "add_product" | "categories" | "valuation"
  >("catalog");

  // Lists
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Forms states
  const [newProdName, setNewProdName] = useState("");
  const [newProdSku, setNewProdSku] = useState("");
  const [newProdBarcode, setNewProdBarcode] = useState("");
  const [newProdCost, setNewProdCost] = useState("");
  const [newProdSell, setNewProdSell] = useState("");
  const [newProdCatId, setNewProdCatId] = useState("");
  const [newProdQty, setNewProdQty] = useState("");
  const [newProdMin, setNewProdMin] = useState("5.0");

  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  // Stock Adjustment Dialog States
  const [isAdjustModalVisible, setIsAdjustModalVisible] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustType, setAdjustType] = useState<"IN" | "ADJUSTMENT" | "DAMAGE">(
    "IN",
  );
  const [adjustReason, setAdjustReason] = useState("");

  // Load Inventory Data
  const loadInventory = async () => {
    try {
      const db = await dbPromise;
      const prods = await db.getAllAsync<Product>(
        "SELECT * FROM products WHERE deleted = 0;",
      );
      setProducts(prods);

      const cats = await db.getAllAsync<Category>(
        "SELECT * FROM categories WHERE deleted = 0;",
      );
      setCategories(cats);
    } catch (err) {
      console.error("Failed to load inventory data:", err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadInventory();
    }, []),
  );

  // Add Category Handler
  const handleAddCategory = async () => {
    if (!newCatName) return;
    try {
      const db = await dbPromise;
      const now = new Date().toISOString();
      await db.runAsync(
        "INSERT INTO categories (id, business_id, name, description, sync_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);",
        [
          generateUUID(),
          user?.business_id || "default_biz",
          newCatName,
          newCatDesc,
          "pending_insert",
          now,
          now,
        ],
      );

      setNewCatName("");
      setNewCatDesc("");
      Alert.alert("Success", "Category created successfully.");
      loadInventory();
      setActiveTab("catalog");
    } catch (err) {
      console.error("Failed to add category:", err);
      Alert.alert("Error", "Could not create category.");
    }
  };

  // Add Product Handler
  const handleAddProduct = async () => {
    if (!newProdName || !newProdSell) {
      Alert.alert(
        "Required Fields",
        "Product Name and Selling Price are required.",
      );
      return;
    }

    try {
      const db = await dbPromise;
      const now = new Date().toISOString();
      const prodId = generateUUID();
      const qty = parseFloat(newProdQty) || 0.0;
      const cost = parseFloat(newProdCost) || 0.0;
      const sell = parseFloat(newProdSell);
      const minStock = parseFloat(newProdMin) || 5.0;

      await db.runAsync(
        `INSERT INTO products (id, business_id, category_id, name, sku, barcode, cost_price, selling_price, selling_price_zig, stock_quantity, min_stock_level, sync_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          prodId,
          user?.business_id || "default_biz",
          newProdCatId || null,
          newProdName,
          newProdSku || null,
          newProdBarcode || null,
          cost,
          sell,
          sell * 25.5, // Seed ZiG exchange calculation
          qty,
          minStock,
          "pending_insert",
          now,
          now,
        ],
      );

      // Record stock movement log if initial qty is set
      if (qty > 0) {
        await db.runAsync(
          "INSERT INTO stock_movements (id, product_id, quantity, type, reason, user_id, sync_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
          [
            generateUUID(),
            prodId,
            qty,
            "IN",
            "Initial stock intake",
            user?.id || "system",
            "pending_insert",
            now,
          ],
        );
      }

      // Clear Form
      setNewProdName("");
      setNewProdSku("");
      setNewProdBarcode("");
      setNewProdCost("");
      setNewProdSell("");
      setNewProdCatId("");
      setNewProdQty("");
      setNewProdMin("5.0");

      Alert.alert("Success", "Product registered successfully.");
      loadInventory();
      setActiveTab("catalog");
    } catch (err) {
      console.error("Failed to register product:", err);
      Alert.alert("Error", "Could not register product.");
    }
  };

  // Adjust Stock level inside SQLite
  const handleAdjustStock = async () => {
    if (!selectedProduct || !adjustQty) return;
    const delta = parseFloat(adjustQty);
    if (isNaN(delta) || delta <= 0) {
      Alert.alert("Error", "Please enter a valid positive number.");
      return;
    }

    try {
      const db = await dbPromise;
      const now = new Date().toISOString();
      let sqlUpdate =
        "UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?;";
      let netQty = delta;

      if (adjustType === "DAMAGE") {
        sqlUpdate =
          "UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?;";
        netQty = -delta;
      } else if (adjustType === "ADJUSTMENT") {
        // Full override or relative? Relative is standard.
        // If relative, we can add or subtract. Let's make it add/subtract relative based on input.
        sqlUpdate =
          "UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?;";
      }

      await db.runAsync(sqlUpdate, [delta, now, selectedProduct.id]);

      // Write Stock Movement Log
      await db.runAsync(
        "INSERT INTO stock_movements (id, product_id, quantity, type, reason, user_id, sync_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?);",
        [
          generateUUID(),
          selectedProduct.id,
          netQty,
          adjustType,
          adjustReason || `${adjustType} correction`,
          user?.id || "system",
          "pending_insert",
          now,
        ],
      );

      setIsAdjustModalVisible(false);
      setSelectedProduct(null);
      setAdjustQty("");
      setAdjustReason("");
      Alert.alert("Success", "Inventory updated successfully.");
      loadInventory();
    } catch (err) {
      console.error("Failed to log stock movement:", err);
      Alert.alert("Error", "Adjustment failed.");
    }
  };

  // Computations for valuation tab
  const getInventoryValuation = () => {
    let totalCostVal = 0;
    let totalRetailVal = 0;

    products.forEach((p) => {
      totalCostVal += p.stock_quantity * p.cost_price;
      totalRetailVal += p.stock_quantity * p.selling_price;
    });

    const potentialMargin = totalRetailVal - totalCostVal;

    return {
      cost: totalCostVal,
      retail: totalRetailVal,
      margin: potentialMargin,
    };
  };

  const valuation = getInventoryValuation();

  // Filter products matching search
  const filteredProducts = products.filter((p) => {
    return (
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.includes(searchQuery)
    );
  });

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Navigation Sub-Tabs */}
      <View className="flex-row bg-primary border-b border-primary-dark">
        {[
          { key: "catalog", label: "Catalog", icon: Package },
          {
            key: "add_product",
            label: "+ Product",
            icon: PlusCircle,
            disabled: isOperator,
          },
          {
            key: "categories",
            label: "+ Category",
            icon: FolderPlus,
            disabled: isOperator,
          },
          {
            key: "valuation",
            label: "Valuation",
            icon: BarChart2,
            disabled: isOperator,
          },
        ].map((tab) => {
          if (tab.disabled) return null;
          const isSelected = activeTab === tab.key;
          const IconComponent = tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setActiveTab(tab.key as any)}
              className={`flex-1 py-3 items-center flex-row justify-center space-x-1.5 border-b-2 ${
                isSelected
                  ? "border-accent bg-primary-light/10"
                  : "border-transparent"
              }`}
            >
              <IconComponent
                color={isSelected ? "#FFD700" : "#94A3B8"}
                size={16}
              />
              <Text
                className={`text-xs font-bold ${
                  isSelected ? "text-accent" : "text-slate-400"
                }`}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Main tab content */}
      <View className="flex-1">
        {/* TAB 1: Product Catalog list */}
        {activeTab === "catalog" && (
          <View className="flex-1">
            {/* Search inputs */}
            <View className="p-3 bg-white border-b border-slate-200 flex-row items-center px-4">
              <Search color="#94A3B8" size={18} />
              <TextInput
                placeholder="Search inventory SKU or name..."
                className="text-sm text-slate-800 ml-2 flex-1 p-0"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>

            <ScrollView
              className="flex-1 p-3"
              contentContainerStyle={{ paddingBottom: 90 }}
            >
              {filteredProducts.map((p) => {
                const isLow = p.stock_quantity <= p.min_stock_level;
                const isOut = p.stock_quantity <= 0;

                return (
                  <Card key={p.id} className="mb-3">
                    <CardContent className="p-4 flex-row justify-between items-center">
                      {/* Name & Details */}
                      <View className="flex-1 pr-4">
                        <View className="flex-row items-center space-x-2">
                          <Text
                            className="text-sm font-bold text-slate-800 dark:text-white"
                            numberOfLines={1}
                          >
                            {p.name}
                          </Text>
                          {isOut ? (
                            <Badge
                              label="Out"
                              variant="destructive"
                              className="ml-1.5"
                            />
                          ) : isLow ? (
                            <Badge
                              label="Low"
                              variant="warning"
                              className="ml-1.5"
                            />
                          ) : null}
                        </View>
                        <Text className="text-[10px] text-slate-400 mt-0.5">
                          SKU: {p.sku || "N/A"} • Barcode: {p.barcode || "N/A"}
                        </Text>

                        <View className="flex-row space-x-4 mt-2">
                          {!isOperator && (
                            <Text className="text-xs text-slate-500">
                              Cost:{" "}
                              <Text className="font-semibold text-slate-700">
                                ${p.cost_price.toFixed(2)}
                              </Text>
                            </Text>
                          )}
                          <Text className="text-xs text-slate-500">
                            Sell:{" "}
                            <Text className="font-semibold text-primary">
                              ${p.selling_price.toFixed(2)}
                            </Text>
                          </Text>
                        </View>
                      </View>

                      {/* Stock Level & Adjustments buttons */}
                      <View className="items-end">
                        <Text className="text-base font-extrabold text-slate-800 dark:text-white">
                          {p.stock_quantity}
                        </Text>
                        <Text className="text-[10px] text-slate-400 uppercase tracking-wide">
                          Stock Qty
                        </Text>

                        {!isOperator && (
                          <TouchableOpacity
                            onPress={() => {
                              setSelectedProduct(p);
                              setIsAdjustModalVisible(true);
                            }}
                            className="bg-primary py-1 px-2.5 rounded-lg flex-row items-center mt-2"
                          >
                            <Edit3 color="#FFFFFF" size={10} />
                            <Text className="text-[10px] font-bold text-white ml-1">
                              Stock
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </CardContent>
                  </Card>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* TAB 2: Add Product form */}
        {activeTab === "add_product" && (
          <ScrollView
            className="flex-1 p-5"
            contentContainerStyle={{ paddingBottom: 90 }}
          >
            <Card className="p-5">
              <Text className="text-base font-bold text-slate-800 mb-4">
                Register New Product
              </Text>

              <Input
                label="Product Name *"
                placeholder="e.g. Cerelac Maize 500g"
                value={newProdName}
                onChangeText={setNewProdName}
              />

              <View className="flex-row flex-wrap justify-between mb-1">
                <Input
                  label="SKU Code"
                  placeholder="CER-500"
                  className="w-full sm:w-[48%] mb-3 sm:mb-0"
                  value={newProdSku}
                  onChangeText={setNewProdSku}
                />
                <Input
                  label="Barcode (EAN)"
                  placeholder="600987654321"
                  className="w-full sm:w-[48%]"
                  value={newProdBarcode}
                  onChangeText={setNewProdBarcode}
                />
              </View>

              <View className="flex-row flex-wrap justify-between mb-1">
                <Input
                  label="Cost Price (USD) *"
                  placeholder="0.00"
                  keyboardType="numeric"
                  className="w-full sm:w-[48%] mb-3 sm:mb-0"
                  value={newProdCost}
                  onChangeText={setNewProdCost}
                />
                <Input
                  label="Selling Price (USD) *"
                  placeholder="0.00"
                  keyboardType="numeric"
                  className="w-full sm:w-[48%]"
                  value={newProdSell}
                  onChangeText={setNewProdSell}
                />
              </View>

              {/* Category selector */}
              <View className="mb-4">
                <Text className="text-sm font-semibold text-slate-700 mb-1.5">
                  Category
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {categories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => setNewProdCatId(c.id)}
                      className={`py-1.5 px-3 rounded-lg mr-2 border ${
                        newProdCatId === c.id
                          ? "bg-primary border-primary"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
                          newProdCatId === c.id
                            ? "text-white font-bold"
                            : "text-slate-600"
                        }`}
                      >
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View className="flex-row flex-wrap justify-between mb-4">
                <Input
                  label="Opening Quantity"
                  placeholder="0.0"
                  keyboardType="numeric"
                  className="w-full sm:w-[48%]"
                  value={newProdQty}
                  onChangeText={setNewProdQty}
                />
                <Input
                  label="Low Stock Alert Qty"
                  placeholder="5.0"
                  keyboardType="numeric"
                  className="w-full sm:w-[48%]"
                  value={newProdMin}
                  onChangeText={setNewProdMin}
                />
              </View>

              <Button
                label="Register product"
                onPress={handleAddProduct}
                variant="success"
                className="w-full mt-2"
              />
            </Card>
          </ScrollView>
        )}

        {/* TAB 3: Categories Manager */}
        {activeTab === "categories" && (
          <ScrollView
            className="flex-1 p-5"
            contentContainerStyle={{ paddingBottom: 90 }}
          >
            <Card className="p-5 mb-6">
              <Text className="text-base font-bold text-slate-800 mb-4">
                Create Category
              </Text>
              <Input
                label="Category Name *"
                placeholder="e.g. Beverages"
                value={newCatName}
                onChangeText={setNewCatName}
              />
              <Input
                label="Description"
                placeholder="Describe stock category items..."
                value={newCatDesc}
                onChangeText={setNewCatDesc}
              />
              <Button
                label="Add Category"
                onPress={handleAddCategory}
                variant="primary"
                className="w-full mt-2"
              />
            </Card>

            <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-2">
              Existing Categories
            </Text>
            {categories.map((c) => (
              <Card key={c.id} className="mb-2.5">
                <CardContent className="p-3.5 flex-row justify-between items-center">
                  <View>
                    <Text className="text-sm font-bold text-slate-800">
                      {c.name}
                    </Text>
                    {c.description && (
                      <Text className="text-xs text-slate-400 mt-0.5">
                        {c.description}
                      </Text>
                    )}
                  </View>
                </CardContent>
              </Card>
            ))}
          </ScrollView>
        )}

        {/* TAB 4: Stock Valuation report */}
        {activeTab === "valuation" && (
          <ScrollView
            className="flex-1 p-5"
            contentContainerStyle={{ paddingBottom: 90 }}
          >
            <Text className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
              Inventory Financial Valuation
            </Text>

            <Card className="mb-4 border-l-4 border-l-primary">
              <CardContent className="p-4">
                <Text className="text-xs font-semibold text-slate-400">
                  Total Asset Cost (USD)
                </Text>
                <Text className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">
                  ${valuation.cost.toFixed(2)}
                </Text>
                <Text className="text-[10px] text-slate-400 mt-1">
                  Capital invested in active inventory items.
                </Text>
              </CardContent>
            </Card>

            <Card className="mb-4 border-l-4 border-l-success">
              <CardContent className="p-4">
                <Text className="text-xs font-semibold text-slate-400">
                  Total Retail Potential Value (USD)
                </Text>
                <Text className="text-2xl font-extrabold text-success mt-1">
                  ${valuation.retail.toFixed(2)}
                </Text>
                <Text className="text-[10px] text-slate-400 mt-1">
                  Expected revenue if all items sell at retail price.
                </Text>
              </CardContent>
            </Card>

            <Card className="mb-6 border-l-4 border-l-accent">
              <CardContent className="p-4">
                <Text className="text-xs font-semibold text-slate-400">
                  Potential Gross Profit Margin (USD)
                </Text>
                <Text className="text-2xl font-extrabold text-slate-800 dark:text-white mt-1">
                  ${valuation.margin.toFixed(2)}
                </Text>
                <Text className="text-[10px] text-slate-400 mt-1">
                  Expected gross profit spread.
                </Text>
              </CardContent>
            </Card>
          </ScrollView>
        )}
      </View>

      {/* ADJUST MODAL dialog: Stock adjust forms */}
      <Modal visible={isAdjustModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/55 justify-end">
          <View className="bg-white rounded-t-3xl p-6 border-t border-slate-200">
            <Text className="text-base font-bold text-slate-800 mb-2">
              Adjust Inventory level
            </Text>
            <Text className="text-xs text-slate-400 mb-4">
              {selectedProduct?.name}
            </Text>

            {/* Type selector */}
            <View className="flex-row flex-wrap justify-between mb-4">
              {[
                { type: "IN", label: "Stock Intake" },
                { type: "ADJUSTMENT", label: "Correction (+/-)" },
                { type: "DAMAGE", label: "Damaged Stock (-)" },
              ].map((t) => (
                <TouchableOpacity
                  key={t.type}
                  onPress={() => setAdjustType(t.type as any)}
                  className={`py-2 px-3 rounded-lg border w-full sm:w-[48%] md:w-[31%] mb-3 ${
                    adjustType === t.type
                      ? "bg-primary border-primary"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <Text
                    className={`text-[10px] text-center font-bold ${
                      adjustType === t.type ? "text-white" : "text-slate-600"
                    }`}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Input
              label="Quantity to adjust *"
              placeholder="0.0"
              keyboardType="numeric"
              value={adjustQty}
              onChangeText={setAdjustQty}
            />

            <Input
              label="Reason / Reference *"
              placeholder="e.g. GRN-998877, monthly count discrepancy"
              value={adjustReason}
              onChangeText={setAdjustReason}
            />

            <View className="flex-row flex-wrap justify-between space-x-0 sm:space-x-3 mt-4">
              <Button
                label="Cancel"
                variant="outline"
                className="w-full sm:w-[48%]"
                onPress={() => {
                  setIsAdjustModalVisible(false);
                  setSelectedProduct(null);
                }}
              />
              <Button
                label="Submit Log"
                variant="success"
                className="w-full sm:w-[48%] mt-3 sm:mt-0"
                onPress={handleAdjustStock}
              />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
