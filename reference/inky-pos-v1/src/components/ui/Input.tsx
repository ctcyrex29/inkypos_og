// src/components/ui/Input.tsx
import { Text, TextInput, TextInputProps, View } from "react-native";

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
}

export function Input({
  label,
  error,
  helperText,
  className = "",
  ...props
}: InputProps) {
  return (
    <View className={`mb-4 w-full ${className}`}>
      {label && (
        <Text className="text-sm font-semibold text-slate-700 mb-1.5 dark:text-slate-300">
          {label}
        </Text>
      )}

      <View
        className={`w-full bg-white dark:bg-[#0B1E3B] rounded-xl px-4 py-3.5 border ${
          error ? "border-red-500" : "border-slate-200 dark:border-[#1C2F50]"
        } focus:border-primary focus:border-2`}
      >
        <TextInput
          placeholderTextColor="#94A3B8"
          className="text-base text-slate-800 dark:text-slate-100 p-0"
          {...props}
        />
      </View>

      {error ? (
        <Text className="text-xs font-medium text-red-500 mt-1">{error}</Text>
      ) : helperText ? (
        <Text className="text-xs text-slate-500 mt-1">{helperText}</Text>
      ) : null}
    </View>
  );
}
