// src/app/(app)/pos.tsx
import { useFocusEffect } from "expo-router";
import {
    Barcode,
    CheckCircle,
    CreditCard,
    FolderOpen,
    Minus,
    Plus,
    Search,
    ShoppingCart,
    Tag,
    Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import {
    Alert,
    FlatList,
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
import { ReceiptPreview } from "../../components/ui/ReceiptPreview";
import { Category, Customer, Product } from "../../db/schema";
import { generateUUID, getDatabase } from "../../db/sqlite";
import { useAuthStore } from "../../store/useAuthStore";
import { useCartStore } from "../../store/useCartStore";
import { useSettingsStore } from "../../store/useSettingsStore";
import { usePortalRouteGuard } from "../../utils/portalGuard";
import { useResponsive } from "../../utils/responsive";

export default function POSScreen() {
  usePortalRouteGuard(["pos"]);

  const dbPromise = getDatabase();
  const { user } = useAuthStore();
  const { business, zigExchangeRate } = useSettingsStore();

  // Zustand Cart Store
  const {
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    setDiscount,
    discountAmount,
    discountType,
    getTotals,
    holdCart,
    heldTransactions,
    resumeCart,
  } = useCartStore();

  // Component States
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isVirtualScannerActive, setIsVirtualScannerActive] = useState(false);
  const [isCartSheetVisible, setIsCartSheetVisible] = useState(false);

  // Checkout States
  const [isCheckoutModalVisible, setIsCheckoutModalVisible] = useState(false);
  const [isReceiptModalVisible, setIsReceiptModalVisible] = useState(false);
  const [isHeldModalVisible, setIsHeldModalVisible] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "ECOCASH" | "CARD" | "ZIPIT" | "SPLIT"
  >("CASH");

  // Split payment allocations (in USD)
  const [splitUSD, setSplitUSD] = useState("");
  const [splitZiG, setSplitZiG] = useState(""); // input in ZiG, converted to USD

  // Saved Receipt State for preview
  const [savedReceiptData, setSavedReceiptData] = useState<{
    receiptNumber: string;
    items: {
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    date: string;
    paymentMethod: string;
  } | null>(null);

  // Load Categories & Products on mount / focus
  const loadPOSData = async () => {
    try {
      const db = await dbPromise;
      // Load Categories
      const cats = await db.getAllAsync<Category>(
        "SELECT * FROM categories WHERE deleted = 0;",
      );
      setCategories([
        { id: "all", name: "All Categories" } as Category,
        ...cats,
      ]);

      // Load Products
      const prods = await db.getAllAsync<Product>(
        "SELECT * FROM products WHERE deleted = 0 AND status = 'active';",
      );
      setProducts(prods);

      // Load Customers
      const custs = await db.getAllAsync<Customer>(
        "SELECT * FROM customers WHERE deleted = 0;",
      );
      setCustomers(custs);
    } catch (err) {
      console.error("Failed to load POS catalog data:", err);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      loadPOSData();
    }, []),
  );

  // Virtual Barcode scanner simulation handler
  const handleBarcodeSubmit = () => {
    if (!barcodeQuery) return;
    const found = products.find(
      (p) =>
        p.barcode === barcodeQuery ||
        p.sku?.toLowerCase() === barcodeQuery.toLowerCase(),
    );

    if (found) {
      if (found.stock_quantity <= 0) {
        Alert.alert("Out of Stock", `${found.name} is currently out of stock.`);
      } else {
        addToCart(found, 1);
        setBarcodeQuery("");
        setIsVirtualScannerActive(false);
      }
    } else {
      Alert.alert(
        "Not Found",
        `Product with code/SKU "${barcodeQuery}" not registered.`,
      );
    }
  };

  // Filter products by selected category and search input
  const filteredProducts = products.filter((p) => {
    const matchesCategory =
      selectedCategory && selectedCategory !== "all"
        ? p.category_id === selectedCategory
        : true;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode?.includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  const totals = getTotals(business?.tax_rate || 15.0, zigExchangeRate);

  // Processes the sale transaction write to SQLite
  const handleProcessPayment = async () => {
    if (items.length === 0) return;

    // Validate split payment values
    if (paymentMethod === "SPLIT") {
      const usdPaid = parseFloat(splitUSD) || 0;
      const zigPaidInUSD = (parseFloat(splitZiG) || 0) / zigExchangeRate;
      const totalPaid = usdPaid + zigPaidInUSD;
      if (Math.abs(totalPaid - totals.total) > 0.05) {
        Alert.alert(
          "Mismatch",
          `Total split payments ($${totalPaid.toFixed(
            2,
          )}) must equal transaction total ($${totals.total.toFixed(2)}).`,
        );
        return;
      }
    }

    try {
      const db = await dbPromise;
      const now = new Date().toISOString();
      const saleId = generateUUID();
      const salesNumber = "SL-" + Math.floor(100000 + Math.random() * 900000);

      // 1. Write core Sale record
      await db.runAsync(
        `INSERT INTO sales (id, business_id, customer_id, sales_number, status, subtotal, tax_amount, discount_amount, total_amount, payment_method, user_id, sync_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          saleId,
          business?.id || "default_biz",
          selectedCustomer?.id || null,
          salesNumber,
          "completed",
          totals.subtotal,
          totals.tax,
          totals.discount,
          totals.total,
          paymentMethod,
          user?.id || "system",
          "pending_insert",
          now,
          now,
        ],
      );

      // 2. Write individual Sale Items and update stocks
      for (const item of items) {
        const itemId = generateUUID();
        await db.runAsync(
          `INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price, cost_price, total_price, sync_status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            itemId,
            saleId,
            item.product.id,
            item.quantity,
            item.product.selling_price,
            item.product.cost_price,
            item.product.selling_price * item.quantity,
            "pending_insert",
            now,
          ],
        );

        // Update product stock level in database
        await db.runAsync(
          "UPDATE products SET stock_quantity = stock_quantity - ?, updated_at = ? WHERE id = ?;",
          [item.quantity, now, item.product.id],
        );

        // Record stock movement log
        await db.runAsync(
          "INSERT INTO stock_movements (id, product_id, quantity, type, reason, reference_id, user_id, sync_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);",
          [
            generateUUID(),
            item.product.id,
            item.quantity,
            "OUT",
            `POS Sale ${salesNumber}`,
            saleId,
            user?.id || "system",
            "pending_insert",
            now,
          ],
        );
      }

      // 3. Update Customer loyalty points & balance if Credit check
      if (selectedCustomer) {
        const ptsEarned = Math.floor(totals.total);
        await db.runAsync(
          "UPDATE customers SET loyalty_points = loyalty_points + ?, updated_at = ? WHERE id = ?;",
          [ptsEarned, now, selectedCustomer.id],
        );
      }

      // Save receipt data details for display
      setSavedReceiptData({
        receiptNumber: salesNumber,
        items: items.map((i) => ({
          name: i.product.name,
          quantity: i.quantity,
          unitPrice: i.product.selling_price,
          totalPrice: i.product.selling_price * i.quantity,
        })),
        subtotal: totals.subtotal,
        discount: totals.discount,
        tax: totals.tax,
        total: totals.total,
        date: now.replace("T", " ").substring(0, 19),
        paymentMethod:
          paymentMethod === "SPLIT"
            ? `Split ($${parseFloat(splitUSD).toFixed(2)} + ${parseFloat(
                splitZiG,
              ).toFixed(2)} ZiG)`
            : paymentMethod,
      });

      // Clear checkout states
      setIsCheckoutModalVisible(false);
      clearCart();
      setSelectedCustomer(null);
      setSplitUSD("");
      setSplitZiG("");

      // Load updated catalog quantities
      loadPOSData();

      // Display Receipt
      setIsReceiptModalVisible(true);
    } catch (err) {
      console.error("POS Checkout Transaction failed:", err);
      Alert.alert(
        "Checkout Error",
        "Transaction failed writing to SQLite database.",
      );
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Top Controls Bar */}
      <View className="bg-primary p-4 border-b border-primary-dark">
        <View className="flex-row items-center space-x-3 mb-2 justify-between">
          <View className="bg-white/10 flex-row items-center px-3 py-2 rounded-xl flex-1 mr-3">
            <Search color="#94A3B8" size={18} />
            <TextInput
              placeholder="Search product, SKU..."
              placeholderTextColor="#94A3B8"
              className="text-white ml-2 text-sm flex-1 p-0"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>

          <TouchableOpacity
            onPress={() => setIsVirtualScannerActive(!isVirtualScannerActive)}
            className={`p-3 rounded-xl ${
              isVirtualScannerActive ? "bg-accent" : "bg-white/10"
            }`}
          >
            <Barcode
              color={isVirtualScannerActive ? "#0A2540" : "#FFFFFF"}
              size={20}
            />
          </TouchableOpacity>
        </View>

        {/* Virtual Scanner Input Form */}
        {isVirtualScannerActive && (
          <View className="bg-accent/10 border border-accent/20 p-3 rounded-xl flex-row items-center mt-2 justify-between">
            <TextInput
              placeholder="Type/Scan Barcode code..."
              placeholderTextColor="#B39700"
              className="text-accent text-sm font-semibold flex-1 mr-3 p-0"
              value={barcodeQuery}
              onChangeText={setBarcodeQuery}
              onSubmitEditing={handleBarcodeSubmit}
              autoFocus
            />
            <TouchableOpacity
              onPress={handleBarcodeSubmit}
              className="bg-accent py-1.5 px-3 rounded-lg"
            >
              <Text className="text-primary font-bold text-xs">Scan</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Category Scrollbar */}
      <View className="py-2.5 bg-white border-b border-slate-200">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12 }}
        >
          {categories.map((cat) => {
            const isSelected =
              selectedCategory === cat.id ||
              (!selectedCategory && cat.id === "all");
            return (
              <TouchableOpacity
                key={cat.id}
                onPress={() =>
                  setSelectedCategory(cat.id === "all" ? null : cat.id)
                }
                className={`py-1.5 px-3.5 rounded-full mr-2 ${
                  isSelected ? "bg-primary" : "bg-slate-100"
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    isSelected ? "text-white" : "text-slate-600"
                  }`}
                >
                  {cat.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Split Layout (responsive) */}
      {(() => {
        const { isSmallPhone } = useResponsive();

        if (isSmallPhone) {
          return (
            <View className="flex-1">
              {/* Product Grid Full Width for small phones */}
              <View className="p-3 flex-1">
                <FlatList
                  data={filteredProducts}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingBottom: 90 }}
                  numColumns={2}
                  renderItem={({ item }) => {
                    const isLowStock =
                      item.stock_quantity <= item.min_stock_level;
                    const isOut = item.stock_quantity <= 0;
                    return (
                      <TouchableOpacity
                        disabled={isOut}
                        onPress={() => addToCart(item, 1)}
                        className={`w-full sm:w-[48%] m-[1%] bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm active:opacity-75 ${
                          isOut ? "opacity-40" : ""
                        }`}
                      >
                        <View className="h-20 bg-slate-100 items-center justify-center">
                          <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {item.sku || "N/A"}
                          </Text>
                        </View>
                        <View className="p-2.5">
                          <Text
                            className="text-xs font-bold text-slate-800"
                            numberOfLines={2}
                          >
                            {item.name}
                          </Text>
                          <Text className="text-xs font-extrabold text-primary mt-1">
                            ${item.selling_price.toFixed(2)}
                          </Text>
                          <Text className="text-[9px] text-slate-400 mt-0.5">
                            {(item.selling_price * zigExchangeRate).toFixed(0)}{" "}
                            ZiG
                          </Text>

                          <View className="flex-row justify-between items-center mt-2 pt-1.5 border-t border-slate-50">
                            <Text
                              className={`text-[9px] font-semibold ${isOut ? "text-red-500" : isLowStock ? "text-amber-500" : "text-slate-400"}`}
                            >
                              Qty: {item.stock_quantity}
                            </Text>
                            {isLowStock && (
                              <Badge
                                label="Low"
                                variant="warning"
                                className="px-1 py-0.5"
                              />
                            )}
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                  ListEmptyComponent={() => (
                    <View className="flex-1 items-center justify-center py-20">
                      <Text className="text-sm text-slate-400">
                        No products found matching query.
                      </Text>
                    </View>
                  )}
                />
              </View>

              {/* Floating Cart button */}
              <TouchableOpacity
                onPress={() => setIsCartSheetVisible(true)}
                className="absolute right-4 bottom-24 bg-accent p-3 rounded-full shadow-lg flex-row items-center"
              >
                <ShoppingCart color="#0A2540" size={18} />
                <View className="ml-2 bg-white rounded-full px-2 py-1">
                  <Text className="text-xs font-bold">{items.length}</Text>
                </View>
              </TouchableOpacity>

              {/* Cart as Bottom Sheet Modal */}
              <Modal
                visible={isCartSheetVisible}
                transparent
                animationType="slide"
              >
                <View className="flex-1 bg-black/55 justify-end">
                  <View className="bg-white rounded-t-3xl p-3 max-h-[80%]">
                    {/* Cart Header */}
                    <View className="flex-row justify-between items-center p-3.5 border-b border-slate-100 bg-slate-50/50">
                      <View className="flex-row items-center">
                        <ShoppingCart color="#0A2540" size={16} />
                        <Text className="text-sm font-bold text-slate-800 ml-1.5">
                          Basket ({items.length})
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => setIsCartSheetVisible(false)}
                        className="p-1 active:opacity-60"
                      >
                        <Text className="text-sm font-bold text-slate-600">
                          Close
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Cart Items List */}
                    <ScrollView className="flex-1 p-2">
                      {items.length === 0 ? (
                        <View className="items-center justify-center py-16">
                          <Text className="text-xs text-slate-400 text-center">
                            Terminal empty. Tap products to add.
                          </Text>
                        </View>
                      ) : (
                        items.map((item) => (
                          <View
                            key={item.product.id}
                            className="bg-slate-50 rounded-xl p-2.5 mb-2 border border-slate-100"
                          >
                            <Text
                              className="text-xs font-bold text-slate-700"
                              numberOfLines={1}
                            >
                              {item.product.name}
                            </Text>
                            <View className="flex-row justify-between items-center mt-1.5">
                              <Text className="text-xs text-primary font-semibold">
                                $
                                {(
                                  item.product.selling_price * item.quantity
                                ).toFixed(2)}
                              </Text>
                              <View className="flex-row items-center bg-white border border-slate-200 rounded-lg px-1.5 py-0.5 space-x-2">
                                <TouchableOpacity
                                  onPress={() =>
                                    updateQuantity(
                                      item.product.id,
                                      item.quantity - 1,
                                    )
                                  }
                                  className="p-0.5"
                                >
                                  <Minus color="#64748B" size={12} />
                                </TouchableOpacity>
                                <Text className="text-xs font-bold text-slate-800 px-1">
                                  {item.quantity}
                                </Text>
                                <TouchableOpacity
                                  onPress={() =>
                                    updateQuantity(
                                      item.product.id,
                                      item.quantity + 1,
                                    )
                                  }
                                  className="p-0.5"
                                >
                                  <Plus color="#64748B" size={12} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>
                        ))
                      )}
                    </ScrollView>

                    {/* Summary */}
                    <View className="border-t border-slate-200 p-3 bg-slate-50/80">
                      <View className="space-y-1 mb-3">
                        <View className="flex-row justify-between">
                          <Text className="text-xs text-slate-500">
                            Subtotal:
                          </Text>
                          <Text className="text-xs text-slate-700 font-semibold">
                            ${totals.subtotal.toFixed(2)}
                          </Text>
                        </View>
                        <View className="flex-row justify-between">
                          <Text className="text-xs text-slate-500">
                            VAT (15%):
                          </Text>
                          <Text className="text-xs text-slate-700 font-semibold">
                            ${totals.tax.toFixed(2)}
                          </Text>
                        </View>
                        <View className="flex-row justify-between pt-1 border-t border-slate-200 mt-1">
                          <Text className="text-sm font-bold text-slate-800">
                            Total USD:
                          </Text>
                          <Text className="text-sm font-bold text-slate-900">
                            ${totals.total.toFixed(2)}
                          </Text>
                        </View>
                      </View>

                      <View className="flex-row flex-wrap justify-between gap-2">
                        <TouchableOpacity
                          disabled={items.length === 0}
                          onPress={() => {
                            holdCart("POS Queue");
                            Alert.alert(
                              "Sale Held",
                              "Transaction has been stored to hold queue.",
                            );
                            setIsCartSheetVisible(false);
                          }}
                          className="bg-primary-light/10 border border-primary-light/20 py-2.5 px-3 rounded-xl items-center w-full sm:w-[48%] md:w-[30%]"
                        >
                          <Tag color="#0A2540" size={16} />
                          <Text className="text-[9px] font-bold text-primary mt-1">
                            Hold
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => {
                            setIsHeldModalVisible(true);
                            setIsCartSheetVisible(false);
                          }}
                          className="bg-slate-100 py-2.5 px-3 rounded-xl items-center w-full sm:w-[48%] md:w-[30%]"
                        >
                          <FolderOpen color="#64748B" size={16} />
                          <Text className="text-[9px] font-bold text-slate-600 mt-1">
                            Resume ({heldTransactions.length})
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          disabled={items.length === 0}
                          onPress={() => {
                            setIsCheckoutModalVisible(true);
                            setIsCartSheetVisible(false);
                          }}
                          className="bg-accent py-2.5 px-3 rounded-xl items-center justify-center w-full sm:w-[48%] md:w-[30%] flex-row"
                        >
                          <CreditCard color="#0A2540" size={16} />
                          <Text className="text-xs font-bold text-primary ml-1">
                            Pay
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              </Modal>
            </View>
          );
        }

        // Default two-column layout for larger screens
        return (
          <View className="flex-1 flex-col lg:flex-row">
            {/* Left Side: Product Grid Catalog (60% width) */}
            <View className="w-full lg:w-[60%] p-3 lg:border-r lg:border-slate-200">
              <FlatList
                data={filteredProducts}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 90 }}
                numColumns={2}
                renderItem={({ item }) => {
                  const isLowStock =
                    item.stock_quantity <= item.min_stock_level;
                  const isOut = item.stock_quantity <= 0;
                  return (
                    <TouchableOpacity
                      disabled={isOut}
                      onPress={() => addToCart(item, 1)}
                      className={`w-full sm:w-[48%] m-[1%] bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm active:opacity-75 ${
                        isOut ? "opacity-40" : ""
                      }`}
                    >
                      {/* Mock Image Placeholder */}
                      <View className="h-20 bg-slate-100 items-center justify-center">
                        <Text className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {item.sku || "N/A"}
                        </Text>
                      </View>
                      <View className="p-2.5">
                        <Text
                          className="text-xs font-bold text-slate-800"
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                        <Text className="text-xs font-extrabold text-primary mt-1">
                          ${item.selling_price.toFixed(2)}
                        </Text>
                        <Text className="text-[9px] text-slate-400 mt-0.5">
                          {(item.selling_price * zigExchangeRate).toFixed(0)}{" "}
                          ZiG
                        </Text>

                        <View className="flex-row justify-between items-center mt-2 pt-1.5 border-t border-slate-50">
                          <Text
                            className={`text-[9px] font-semibold ${isOut ? "text-red-500" : isLowStock ? "text-amber-500" : "text-slate-400"}`}
                          >
                            Qty: {item.stock_quantity}
                          </Text>
                          {isLowStock && (
                            <Badge
                              label="Low"
                              variant="warning"
                              className="px-1 py-0.5"
                            />
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={() => (
                  <View className="flex-1 items-center justify-center py-20">
                    <Text className="text-sm text-slate-400">
                      No products found matching query.
                    </Text>
                  </View>
                )}
              />
            </View>

            {/* Right Side: Active Cart (40% width) */}
            <View className="w-full lg:w-[40%] bg-white flex-1 justify-between">
              <View className="flex-1">
                {/* Cart Header */}
                <View className="flex-row justify-between items-center p-3.5 border-b border-slate-100 bg-slate-50/50">
                  <View className="flex-row items-center">
                    <ShoppingCart color="#0A2540" size={16} />
                    <Text className="text-sm font-bold text-slate-800 ml-1.5">
                      Basket ({items.length})
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={clearCart}
                    className="p-1 active:opacity-60"
                  >
                    <Trash2 color="#EF4444" size={16} />
                  </TouchableOpacity>
                </View>

                {/* Cart Items List */}
                <ScrollView className="flex-1 p-2">
                  {items.length === 0 ? (
                    <View className="items-center justify-center py-16">
                      <Text className="text-xs text-slate-400 text-center">
                        Terminal empty. Tap products to add.
                      </Text>
                    </View>
                  ) : (
                    items.map((item) => (
                      <View
                        key={item.product.id}
                        className="bg-slate-50 rounded-xl p-2.5 mb-2 border border-slate-100"
                      >
                        <Text
                          className="text-xs font-bold text-slate-700"
                          numberOfLines={1}
                        >
                          {item.product.name}
                        </Text>
                        <View className="flex-row justify-between items-center mt-1.5">
                          <Text className="text-xs text-primary font-semibold">
                            $
                            {(
                              item.product.selling_price * item.quantity
                            ).toFixed(2)}
                          </Text>
                          <View className="flex-row items-center bg-white border border-slate-200 rounded-lg px-1.5 py-0.5 space-x-2">
                            <TouchableOpacity
                              onPress={() =>
                                updateQuantity(
                                  item.product.id,
                                  item.quantity - 1,
                                )
                              }
                              className="p-0.5"
                            >
                              <Minus color="#64748B" size={12} />
                            </TouchableOpacity>
                            <Text className="text-xs font-bold text-slate-800 px-1">
                              {item.quantity}
                            </Text>
                            <TouchableOpacity
                              onPress={() =>
                                updateQuantity(
                                  item.product.id,
                                  item.quantity + 1,
                                )
                              }
                              className="p-0.5"
                            >
                              <Plus color="#64748B" size={12} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>

              {/* Cart Bottom Summary Panels */}
              <View className="border-t border-slate-200 p-3 bg-slate-50/80">
                {/* Customer Picker */}
                <View className="flex-row justify-between items-center mb-2.5 bg-white border border-slate-200 px-2 py-1.5 rounded-xl">
                  <Text className="text-xs text-slate-400 font-medium">
                    Customer:
                  </Text>
                  {selectedCustomer ? (
                    <View className="flex-row items-center">
                      <Text className="text-xs font-bold text-slate-800 mr-2">
                        {selectedCustomer.name}
                      </Text>
                      <TouchableOpacity
                        onPress={() => setSelectedCustomer(null)}
                      >
                        <Text className="text-[10px] text-red-500 font-bold">
                          X
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ maxWidth: 150 }}
                    >
                      {customers.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          onPress={() => setSelectedCustomer(c)}
                          className="bg-slate-100 py-0.5 px-2 rounded mr-1"
                        >
                          <Text className="text-[10px] font-bold text-slate-600">
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>

                {/* Calculations */}
                <View className="space-y-1 mb-3">
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-slate-500">Subtotal:</Text>
                    <Text className="text-xs text-slate-700 font-semibold">
                      ${totals.subtotal.toFixed(2)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs text-slate-500">VAT (15%):</Text>
                    <Text className="text-xs text-slate-700 font-semibold">
                      ${totals.tax.toFixed(2)}
                    </Text>
                  </View>

                  <View className="flex-row justify-between pt-1 border-t border-slate-200 mt-1">
                    <Text className="text-sm font-bold text-slate-800">
                      Total USD:
                    </Text>
                    <Text className="text-sm font-bold text-slate-900">
                      ${totals.total.toFixed(2)}
                    </Text>
                  </View>
                  <View className="flex-row justify-between">
                    <Text className="text-xs font-bold text-emerald-600">
                      Total ZiG:
                    </Text>
                    <Text className="text-xs font-bold text-emerald-600">
                      {totals.totalZiG.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Text>
                  </View>
                </View>

                {/* Action buttons */}
                <View className="flex-row flex-wrap justify-between gap-2">
                  <TouchableOpacity
                    disabled={items.length === 0}
                    onPress={() => {
                      holdCart("POS Queue");
                      Alert.alert(
                        "Sale Held",
                        "Transaction has been stored to hold queue.",
                      );
                    }}
                    className="bg-primary-light/10 border border-primary-light/20 py-2.5 px-3 rounded-xl items-center w-full sm:w-[48%] md:w-[30%]"
                  >
                    <Tag color="#0A2540" size={16} />
                    <Text className="text-[9px] font-bold text-primary mt-1">
                      Hold
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setIsHeldModalVisible(true)}
                    className="bg-slate-100 py-2.5 px-3 rounded-xl items-center w-full sm:w-[48%] md:w-[30%]"
                  >
                    <FolderOpen color="#64748B" size={16} />
                    <Text className="text-[9px] font-bold text-slate-600 mt-1">
                      Resume ({heldTransactions.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    disabled={items.length === 0}
                    onPress={() => setIsCheckoutModalVisible(true)}
                    className="bg-accent py-2.5 px-3 rounded-xl items-center justify-center w-full sm:w-[48%] md:w-[30%] flex-row"
                  >
                    <CreditCard color="#0A2540" size={16} />
                    <Text className="text-xs font-bold text-primary ml-1">
                      Pay
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        );
      })()}

      {/* MODAL 1: Payment Checkout Options Selector */}
      <Modal visible={isCheckoutModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/55 justify-end">
          <View className="bg-white dark:bg-slate-900 rounded-t-3xl p-6 border-t border-slate-200 dark:border-slate-800">
            <Text className="text-lg font-bold text-slate-800 dark:text-white mb-4">
              Complete Checkout
            </Text>

            {/* Selector list */}
            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Select Payment Method
            </Text>
            <View className="flex-row flex-wrap justify-between mb-4">
              {[
                { key: "CASH", label: "Cash USD" },
                { key: "ECOCASH", label: "EcoCash" },
                { key: "CARD", label: "Swipe Card" },
                { key: "ZIPIT", label: "ZIPIT Transfer" },
                { key: "SPLIT", label: "Split (USD + ZiG)" },
              ].map((method) => (
                <TouchableOpacity
                  key={method.key}
                  onPress={() => setPaymentMethod(method.key as any)}
                  className={`w-full sm:w-[48%] py-3 px-4 rounded-xl border mb-3 flex-row items-center ${
                    paymentMethod === method.key
                      ? "bg-primary/5 border-primary border-2"
                      : "bg-white border-slate-200"
                  }`}
                >
                  <View
                    className={`w-3.5 h-3.5 rounded-full border mr-2 items-center justify-center ${
                      paymentMethod === method.key
                        ? "border-primary bg-primary"
                        : "border-slate-300"
                    }`}
                  />
                  <Text className="text-xs font-bold text-slate-800">
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Split input values fields */}
            {paymentMethod === "SPLIT" && (
              <View className="bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-4">
                <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Split Allocation
                </Text>
                <View className="flex-row justify-between mb-3">
                  <View className="w-full sm:w-[48%] mb-3 sm:mb-0">
                    <Text className="text-[10px] text-slate-500 font-bold mb-1">
                      Cash USD Amount
                    </Text>
                    <TextInput
                      keyboardType="numeric"
                      placeholder="$0.00"
                      className="bg-white border border-slate-200 rounded-lg p-2 text-xs"
                      value={splitUSD}
                      onChangeText={setSplitUSD}
                    />
                  </View>
                  <View className="w-full sm:w-[48%]">
                    <Text className="text-[10px] text-slate-500 font-bold mb-1">
                      EcoCash/ZIPIT ZiG Amount
                    </Text>
                    <TextInput
                      keyboardType="numeric"
                      placeholder="0.00 ZiG"
                      className="bg-white border border-slate-200 rounded-lg p-2 text-xs"
                      value={splitZiG}
                      onChangeText={setSplitZiG}
                    />
                  </View>
                </View>
                <Text className="text-[10px] text-slate-400 italic">
                  Note: {parseFloat(splitZiG) || 0} ZiG represents $
                  {((parseFloat(splitZiG) || 0) / zigExchangeRate).toFixed(2)}{" "}
                  USD.
                </Text>
              </View>
            )}

            <View className="flex-row flex-wrap justify-between space-x-0 sm:space-x-3 mt-4">
              <Button
                label="Cancel"
                variant="outline"
                className="w-full sm:w-[48%]"
                onPress={() => setIsCheckoutModalVisible(false)}
              />
              <Button
                label="Process checkout"
                variant="success"
                className="w-full sm:w-[48%] mt-3 sm:mt-0"
                onPress={handleProcessPayment}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: Receipt Preview and success screen */}
      <Modal visible={isReceiptModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/65 justify-center items-center p-6">
          <View className="bg-white dark:bg-slate-900 rounded-3xl p-6 w-full max-w-[380px] shadow-2xl">
            <View className="items-center mb-4">
              <CheckCircle color="#00C853" size={40} />
              <Text className="text-base font-bold text-slate-800 mt-2">
                Sale Recorded Successfully
              </Text>
            </View>

            {savedReceiptData && (
              <ScrollView style={{ maxHeight: 350 }} className="mb-4">
                <ReceiptPreview
                  businessName={business?.name || "Harare Mega Mart"}
                  businessAddress={business?.address}
                  taxNumber={business?.tax_number}
                  vatNumber={business?.vat_number}
                  items={savedReceiptData.items}
                  subtotal={savedReceiptData.subtotal}
                  discount={savedReceiptData.discount}
                  tax={savedReceiptData.tax}
                  total={savedReceiptData.total}
                  zigExchangeRate={zigExchangeRate}
                  paymentMethod={savedReceiptData.paymentMethod}
                  receiptNumber={savedReceiptData.receiptNumber}
                  dateString={savedReceiptData.date}
                />
              </ScrollView>
            )}

            <View className="space-y-2.5">
              <Button
                label="Print thermal Receipt"
                onPress={() => {
                  Alert.alert(
                    "Printing Mockup",
                    "Print job submitted successfully to Bluetooth Thermal Printer.",
                  );
                  setIsReceiptModalVisible(false);
                }}
                variant="primary"
                className="w-full"
              />
              <Button
                label="Done / New checkout"
                onPress={() => setIsReceiptModalVisible(false)}
                variant="outline"
                className="w-full"
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: Held Transactions manager */}
      <Modal visible={isHeldModalVisible} transparent animationType="slide">
        <View className="flex-1 bg-black/55 justify-center p-6">
          <View className="bg-white rounded-3xl p-6 max-h-[80%]">
            <Text className="text-base font-bold text-slate-800 mb-4">
              Held Transactions
            </Text>

            <ScrollView className="mb-4">
              {heldTransactions.length === 0 ? (
                <Text className="text-xs text-slate-400 text-center py-8">
                  No transactions currently on hold.
                </Text>
              ) : (
                heldTransactions.map((ht) => (
                  <View
                    key={ht.id}
                    className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-2 flex-row justify-between items-center"
                  >
                    <View className="flex-1 pr-3">
                      <Text className="text-xs font-bold text-slate-800">
                        {ht.notes}
                      </Text>
                      <Text className="text-[10px] text-slate-400">
                        {ht.items.length} item(s) •{" "}
                        {new Date(ht.timestamp).toLocaleTimeString()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => {
                        resumeCart(ht.id);
                        setIsHeldModalVisible(false);
                      }}
                      className="bg-primary py-1.5 px-3.5 rounded-lg"
                    >
                      <Text className="text-[10px] font-bold text-white">
                        Resume
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>

            <Button
              label="Close"
              variant="outline"
              className="w-full"
              onPress={() => setIsHeldModalVisible(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
