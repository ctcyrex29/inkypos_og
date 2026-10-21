// src/components/ui/Badge.tsx
import { Text, View, ViewProps } from "react-native";

interface BadgeProps extends ViewProps {
  label: string;
  variant?:
    | "default"
    | "secondary"
    | "success"
    | "warning"
    | "destructive"
    | "outline";
}

export function Badge({
  label,
  variant = "default",
  className = "",
  ...props
}: BadgeProps) {
  let bgClass = "bg-slate-100 dark:bg-slate-800";
  let textClass = "text-slate-800 dark:text-slate-200";
  let borderClass = "";

  if (variant === "default") {
    bgClass = "bg-primary/10 dark:bg-primary/25";
    textClass = "text-primary dark:text-primary-light font-semibold";
  } else if (variant === "secondary") {
    bgClass = "bg-accent/10 dark:bg-accent/20";
    textClass = "text-accent dark:text-accent-light font-semibold";
  } else if (variant === "success") {
    bgClass = "bg-success/15 dark:bg-success/20";
    textClass = "text-success dark:text-success-light font-semibold";
  } else if (variant === "warning") {
    bgClass = "bg-accent/15 dark:bg-accent/30";
    textClass = "text-accent dark:text-accent-light font-semibold";
  } else if (variant === "destructive") {
    bgClass = "bg-danger/15 dark:bg-danger/30";
    textClass = "text-danger dark:text-danger-light font-semibold";
  } else if (variant === "outline") {
    bgClass = "bg-transparent";
    textClass = "text-slate-600 dark:text-slate-300 font-medium";
    borderClass = "border border-slate-200 dark:border-slate-700";
  }

  return (
    <View
      className={`px-2.5 py-1 rounded-full flex-row justify-center items-center self-start ${bgClass} ${borderClass} ${className}`}
      {...props}
    >
      <Text className={`text-xs ${textClass}`}>{label}</Text>
    </View>
  );
}
