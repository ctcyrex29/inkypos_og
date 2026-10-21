// src/app/(auth)/login.tsx
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useAuthStore } from "../../store/useAuthStore";

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithEmailAndPin, logout, error, clearError, isLoading } =
    useAuthStore();

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);

  const handleLogin = async () => {
    if (!email || !pin) return;
    const success = await loginWithEmailAndPin(email, pin);
    if (success) {
      router.replace("/(app)/portal" as never);
    }
  };

  const handleLogout = () => {
    logout();
    clearError();
    setEmail("");
    setPin("");
    setShowPin(false);
  };

  const toggleShowPin = () => {
    setShowPin((value) => !value);
  };

  return (
    <SafeAreaView className="flex-1 bg-primary dark:bg-primary-dark">
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 24,
        }}
      >
        {/* Branding */}
        <View className="items-center mb-8">
          <View className="w-20 h-20 bg-accent rounded-3xl justify-center items-center mb-4 shadow-lg">
            <Text className="text-primary text-4xl font-extrabold">iP</Text>
          </View>
          <Text className="text-3xl font-extrabold text-white tracking-tight">
            InkyPOS
          </Text>
          <Text className="text-sm text-blue-200 mt-1">
            Zimbabwe's Smart POS & Ledger
          </Text>
        </View>

        {/* Card Form */}
        <View className="w-full max-w-md self-center bg-white dark:bg-[#071A34] p-6 rounded-3xl shadow-xl border border-slate-100 dark:border-[#1C2F50]">
          <Text className="text-xl font-bold text-slate-800 dark:text-white mb-6">
            Sign In
          </Text>

          <Input
            label="Email Address"
            placeholder="e.g. cashier@inkypos.co.zw"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(txt) => {
              clearError();
              setEmail(txt);
            }}
          />

          <View className="mb-4 w-full">
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                4-Digit POS PIN
              </Text>
              <TouchableOpacity onPress={toggleShowPin} className="py-1 px-2">
                <Text className="text-sm text-primary font-semibold">
                  {showPin ? "Hide PIN" : "Show PIN"}
                </Text>
              </TouchableOpacity>
            </View>
            <Input
              placeholder="••••"
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry={!showPin}
              value={pin}
              onChangeText={(txt) => {
                clearError();
                setPin(txt);
              }}
            />
          </View>

          {error && (
            <View className="bg-red-50 border border-red-200 p-3.5 rounded-xl mb-4">
              <Text className="text-xs text-red-600 font-semibold text-center">
                {error}
              </Text>
            </View>
          )}

          <Button
            label="Access Terminal"
            onPress={handleLogin}
            loading={isLoading}
            disabled={!email || pin.length < 4}
            variant="secondary"
            className="w-full mt-2"
          />
          <Button
            label="Logout / Clear Session"
            onPress={handleLogout}
            variant="outline"
            className="w-full mt-3"
          />
        </View>

        <View className="mt-8 bg-primary-light/35 p-5 rounded-2xl border border-primary-light">
          <Text className="text-xs font-semibold text-accent uppercase tracking-wider text-center mb-2">
            Secure demo access
          </Text>
          <Text className="text-sm text-blue-100 text-center">
            Use the credentials assigned during setup for your local demo
            account.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
