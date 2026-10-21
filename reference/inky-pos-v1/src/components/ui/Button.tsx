// src/components/ui/Button.tsx
import { useTheme } from "@/hooks/use-theme";
import {
    ActivityIndicator,
    Text,
    TouchableOpacity,
    TouchableOpacityProps,
} from "react-native";

interface ButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: "primary" | "secondary" | "success" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  // Variant styling
  let bgClass = "bg-primary";
  let textClass = "text-white";
  let borderClass = "";

  if (variant === "secondary") {
    bgClass = "bg-accent";
    textClass = "text-white font-bold";
  } else if (variant === "success") {
    bgClass = "bg-success";
    textClass = "text-white font-bold";
  } else if (variant === "danger") {
    bgClass = "bg-danger";
    textClass = "text-white font-bold";
  } else if (variant === "outline") {
    bgClass = "bg-transparent";
    textClass = "text-primary font-semibold";
    borderClass = "border border-primary";
  }

  // Size styling
  let paddingClass = "py-3 px-6 rounded-xl";
  let fontClass = "text-base font-semibold text-center";

  if (size === "sm") {
    paddingClass = "py-1.5 px-3 rounded-lg";
    fontClass = "text-sm font-medium text-center";
  } else if (size === "lg") {
    paddingClass = "py-4 px-8 rounded-2xl";
    fontClass = "text-lg font-bold text-center";
  }

  const isDisabled = disabled || loading;
  const theme = useTheme();

  return (
    <TouchableOpacity
      disabled={isDisabled}
      className={`active:opacity-80 flex-row justify-center items-center ${bgClass} ${borderClass} ${paddingClass} ${
        isDisabled ? "opacity-50" : ""
      } ${className}`}
      {...props}
    >
      {loading && (
        <ActivityIndicator
          color={variant === "outline" ? theme["primary"] : "#FFFFFF"}
          className="mr-2"
          size="small"
        />
      )}
      <Text className={`${textClass} ${fontClass}`}>{label}</Text>
    </TouchableOpacity>
  );
}
