// src/app/(auth)/pin.tsx
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuthStore } from "../../store/useAuthStore";

export default function PinLockScreen() {
  const router = useRouter();
  const { user, unlockWithPin, logout } = useAuthStore();
  const [pin, setPin] = useState("");
  const [errorCount, setErrorCount] = useState(0);

  const handleKeyPress = (num: string) => {
    if (pin.length < 4) {
      setPin((prev) => prev + num);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin("");
  };

  useEffect(() => {
    if (pin.length === 4) {
      verifyPin();
    }
  }, [pin]);

  const verifyPin = async () => {
    const success = await unlockWithPin(pin);
    if (success) {
      router.replace("/(app)");
    } else {
      setPin("");
      setErrorCount((prev) => prev + 1);
      Alert.alert("Incorrect PIN", "Please try again.");
    }
  };

  const handleLogout = () => {
    logout();
    router.replace("/(auth)/login");
  };

  return (
    <SafeAreaView className="flex-1 bg-primary justify-between py-12 px-6">
      {/* Upper Section */}
      <View className="items-center mt-6">
        <Text className="text-xl font-bold text-accent tracking-wide uppercase">
          Terminal Locked
        </Text>
        <Text className="text-2xl font-bold text-white mt-4">
          {user?.full_name || "Cashier"}
        </Text>
        <Text className="text-sm text-blue-200 mt-1">
          Enter your 4-digit PIN to unlock
        </Text>

        {/* PIN Indicators */}
        <View className="flex-row space-x-6 mt-8 justify-center">
          {[0, 1, 2, 3].map((index) => {
            const filled = pin.length > index;
            return (
              <View
                key={index}
                className={`w-4 h-4 rounded-full mx-3 ${
                  filled
                    ? "bg-accent shadow-md scale-110"
                    : "border border-blue-300"
                }`}
              />
            );
          })}
        </View>
      </View>

      {/* Numeric Keypad */}
      <View className="items-center mb-8">
        <View className="flex-row justify-center w-full max-w-[280px] mb-4">
          {["1", "2", "3"].map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => handleKeyPress(n)}
              className="w-16 h-16 rounded-full bg-primary-light/40 border border-primary-light/30 justify-center items-center mx-3 active:bg-primary-light"
            >
              <Text className="text-2xl font-bold text-white">{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="flex-row justify-center w-full max-w-[280px] mb-4">
          {["4", "5", "6"].map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => handleKeyPress(n)}
              className="w-16 h-16 rounded-full bg-primary-light/40 border border-primary-light/30 justify-center items-center mx-3 active:bg-primary-light"
            >
              <Text className="text-2xl font-bold text-white">{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="flex-row justify-center w-full max-w-[280px] mb-4">
          {["7", "8", "9"].map((n) => (
            <TouchableOpacity
              key={n}
              onPress={() => handleKeyPress(n)}
              className="w-16 h-16 rounded-full bg-primary-light/40 border border-primary-light/30 justify-center items-center mx-3 active:bg-primary-light"
            >
              <Text className="text-2xl font-bold text-white">{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View className="flex-row flex-wrap justify-center w-full max-w-[320px]">
          <TouchableOpacity
            onPress={handleClear}
            className="w-16 h-16 rounded-full justify-center items-center mx-3 active:opacity-60"
          >
            <Text className="text-sm font-semibold text-red-400">CLR</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleKeyPress("0")}
            className="w-16 h-16 rounded-full bg-primary-light/40 border border-primary-light/30 justify-center items-center mx-3 active:bg-primary-light"
          >
            <Text className="text-2xl font-bold text-white">0</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleBackspace}
            className="w-16 h-16 rounded-full justify-center items-center mx-3 active:opacity-60"
          >
            <Text className="text-sm font-semibold text-blue-200">DEL</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Switch User Footer */}
      <View className="items-center">
        <TouchableOpacity onPress={handleLogout} className="active:opacity-80">
          <Text className="text-sm font-bold text-accent underline tracking-wide">
            Sign In with Different Account
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
