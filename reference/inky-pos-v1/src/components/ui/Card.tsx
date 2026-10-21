// src/components/ui/Card.tsx
import { Text, View, ViewProps } from "react-native";

export function Card({ children, className = "", ...props }: ViewProps) {
  return (
    <View
      className={`bg-white dark:bg-[#071A34] border border-slate-200 dark:border-[#1C2F50] rounded-2xl shadow-sm overflow-hidden ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}

export function CardHeader({ children, className = "", ...props }: ViewProps) {
  return (
    <View
      className={`p-5 border-b border-slate-100 dark:border-slate-800 ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}

interface CardTitleProps extends ViewProps {
  title: string;
  subtitle?: string;
}

export function CardTitle({
  title,
  subtitle,
  className = "",
  ...props
}: CardTitleProps) {
  return (
    <View className={`${className}`} {...props}>
      <Text className="text-lg font-bold text-slate-800 dark:text-slate-100">
        {title}
      </Text>
      {subtitle && (
        <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          {subtitle}
        </Text>
      )}
    </View>
  );
}

export function CardContent({ children, className = "", ...props }: ViewProps) {
  return (
    <View className={`p-5 ${className}`} {...props}>
      {children}
    </View>
  );
}

export function CardFooter({ children, className = "", ...props }: ViewProps) {
  return (
    <View
      className={`p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/20 ${className}`}
      {...props}
    >
      {children}
    </View>
  );
}
