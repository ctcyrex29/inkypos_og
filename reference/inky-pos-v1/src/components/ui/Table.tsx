// src/components/ui/Table.tsx
import React from 'react';
import { View, Text, ScrollView, ViewProps } from 'react-native';

interface Column {
  key: string;
  title: string;
  flex?: number;
  align?: 'left' | 'center' | 'right';
}

interface TableProps extends ViewProps {
  columns: Column[];
  data: any[];
  onRowPress?: (row: any) => void;
  emptyMessage?: string;
}

export function Table({
  columns,
  data,
  onRowPress,
  emptyMessage = 'No data available',
  className = '',
  ...props
}: TableProps) {
  return (
    <View className={`border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 ${className}`} {...props}>
      {/* Table Header */}
      <View className="flex-row bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 py-3 px-4">
        {columns.map((col) => {
          const flex = col.flex ?? 1;
          const align = col.align ?? 'left';
          const textAlignment = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
          
          return (
            <Text
              key={col.key}
              style={{ flex }}
              className={`text-xs font-bold text-slate-500 dark:text-slate-400 tracking-wider uppercase ${textAlignment}`}
            >
              {col.title}
            </Text>
          );
        })}
      </View>

      {/* Table Body */}
      {data.length === 0 ? (
        <View className="p-8 items-center justify-center">
          <Text className="text-sm text-slate-400">{emptyMessage}</Text>
        </View>
      ) : (
        <View>
          {data.map((row, rowIndex) => (
            <View
              key={row.id || rowIndex}
              className={`flex-row py-3.5 px-4 border-b border-slate-100 dark:border-slate-800 items-center last:border-b-0`}
            >
              {columns.map((col) => {
                const flex = col.flex ?? 1;
                const align = col.align ?? 'left';
                const textAlignment = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
                const val = row[col.key];

                return (
                  <View key={col.key} style={{ flex }}>
                    {React.isValidElement(val) ? (
                      val
                    ) : (
                      <Text
                        numberOfLines={1}
                        className={`text-sm text-slate-700 dark:text-slate-200 font-medium ${textAlignment}`}
                      >
                        {val !== undefined && val !== null ? String(val) : '-'}
                      </Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
