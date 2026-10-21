// src/app/(app)/settings.tsx
import { useRouter } from "expo-router";
import { ArrowLeft, DollarSign, Printer, Settings } from "lucide-react-native";
import { useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { useSettingsStore } from "../../store/useSettingsStore";
import { usePortalRouteGuard } from "../../utils/portalGuard";
import { useResponsive } from "../../utils/responsive";

export default function SettingsScreen() {
  usePortalRouteGuard(["settings"]);

  const router = useRouter();
  const { columnWidth, spacing, contentPadding, isSmallPhone } =
    useResponsive();
  const {
    business,
    zigExchangeRate,
    printerWidth,
    updateExchangeRate,
    updateBusinessDetails,
    setPrinterWidth,
  } = useSettingsStore();

  const [bizName, setBizName] = useState(business?.name || "");
  const [bizAddress, setBizAddress] = useState(business?.address || "");
  const [bizTax, setBizTax] = useState(business?.tax_number || "");
  const [bizVat, setBizVat] = useState(business?.vat_number || "");

  const [exchangeInput, setExchangeInput] = useState(String(zigExchangeRate));
  const [vatInput, setVatInput] = useState(String(business?.tax_rate || 15.0));

  const [isLoading, setIsLoading] = useState(false);

  const handleSaveBusinessSettings = async () => {
    setIsLoading(true);
    const taxRate = parseFloat(vatInput) || 15.0;
    const success = await updateBusinessDetails({
      name: bizName,
      address: bizAddress,
      tax_number: bizTax,
      vat_number: bizVat,
      tax_rate: taxRate,
    });

    if (success) {
      Alert.alert("Saved", "Business settings updated successfully.");
    } else {
      Alert.alert("Error", "Failed to update business configuration.");
    }
    setIsLoading(false);
  };

  const handleSaveExchangeRate = async () => {
    const rate = parseFloat(exchangeInput);
    if (isNaN(rate) || rate <= 0) {
      Alert.alert(
        "Invalid Input",
        "Exchange rate must be a valid positive number.",
      );
      return;
    }

    setIsLoading(true);
    const success = await updateExchangeRate(rate);
    if (success) {
      Alert.alert("Saved", "Zimbabwe Gold (ZiG) exchange rate updated.");
    } else {
      Alert.alert("Error", "Failed to update exchange parameters.");
    }
    setIsLoading(false);
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <View className="bg-primary px-4 py-3.5 flex-row items-center space-x-3">
        <TouchableOpacity
          onPress={() => router.back()}
          className="p-1 active:opacity-75"
        >
          <ArrowLeft color="#FFFFFF" size={20} />
        </TouchableOpacity>
        <Text className="text-base font-extrabold text-white">
          System Settings
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Currency Conversion Rates card */}
        <Card className="mb-6 border-l-4 border-l-accent">
          <CardContent className="p-5">
            <View className="flex-row items-center mb-4">
              <DollarSign color="#B39700" size={18} />
              <Text className="text-sm font-bold text-slate-800 ml-2">
                Zimbabwe Multi-Currency Config
              </Text>
            </View>

            <Input
              label="1.00 USD to ZiG Exchange Rate *"
              placeholder="e.g. 25.5"
              keyboardType="numeric"
              value={exchangeInput}
              onChangeText={setExchangeInput}
            />

            <Button
              label="Update ZiG Rate"
              onPress={handleSaveExchangeRate}
              variant="secondary"
              loading={isLoading}
              className="w-full"
            />
          </CardContent>
        </Card>

        {/* Business configuration settings card */}
        <Card className="mb-6">
          <CardContent className="p-5">
            <View className="flex-row items-center mb-4">
              <Settings color="#0A2540" size={18} />
              <Text className="text-sm font-bold text-slate-800 ml-2">
                Business Profile & VAT Details
              </Text>
            </View>

            <Input
              label="Business/Trading Name *"
              placeholder="e.g. Harare Mega Mart"
              value={bizName}
              onChangeText={setBizName}
            />

            <Input
              label="Physical Address"
              placeholder="e.g. 101 Leopold Takawira St, Harare"
              value={bizAddress}
              onChangeText={setBizAddress}
            />

            <View
              className={`flex-row ${isSmallPhone ? "flex-col" : "justify-between"} mb-1`}
            >
              <Input
                label="TIN / Tax Number"
                placeholder="BP70012345"
                className={`${isSmallPhone ? "w-full mb-3" : `w-[${columnWidth}]`}`}
                value={bizTax}
                onChangeText={setBizTax}
              />
              <Input
                label="VAT Registration No"
                placeholder="VAT80098765"
                className={`${isSmallPhone ? "w-full" : `w-[${columnWidth}]`}`}
                value={bizVat}
                onChangeText={setBizVat}
              />
            </View>

            <Input
              label="Standard VAT Tax Rate (%)"
              placeholder="15.0"
              keyboardType="numeric"
              value={vatInput}
              onChangeText={setVatInput}
            />

            <Button
              label="Save Business Details"
              onPress={handleSaveBusinessSettings}
              variant="primary"
              loading={isLoading}
              className="w-full mt-2"
            />
          </CardContent>
        </Card>

        {/* Thermal Printer Config */}
        <Card className="mb-6">
          <CardContent className="p-5">
            <View className="flex-row items-center mb-4">
              <Printer color="#0A2540" size={18} />
              <Text className="text-sm font-bold text-slate-800 ml-2">
                Thermal Printer Settings
              </Text>
            </View>

            <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Select Paper Width
            </Text>
            <View className="flex-row mb-4">
              {["58mm", "80mm"].map((size) => {
                const isSelected = printerWidth === size;
                return (
                  <TouchableOpacity
                    key={size}
                    onPress={() => setPrinterWidth(size as any)}
                    className={`flex-1 py-3 border rounded-xl mr-2 items-center justify-center ${
                      isSelected
                        ? "bg-primary/5 border-primary border-2"
                        : "bg-white border-slate-200"
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${isSelected ? "text-primary" : "text-slate-500"}`}
                    >
                      {size} Paper Roll
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View className="bg-slate-50 border border-slate-100 p-3 rounded-xl flex-row justify-between items-center">
              <View>
                <Text className="text-xs font-bold text-slate-700">
                  Bluetooth Receipt Printer
                </Text>
                <Text className="text-[10px] text-slate-400 mt-0.5">
                  Mock Connection: Enabled
                </Text>
              </View>
              <Badge label="Active" variant="success" />
            </View>
          </CardContent>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}
