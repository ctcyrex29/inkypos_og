// src/components/ui/ReceiptPreview.tsx
import React from 'react';
import { View, Text, ScrollView } from 'react-native';

interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number; // in USD
  totalPrice: number; // in USD
}

interface ReceiptPreviewProps {
  businessName: string;
  businessAddress?: string;
  taxNumber?: string;
  vatNumber?: string;
  items: ReceiptItem[];
  subtotal: number; // USD
  discount: number; // USD
  tax: number; // USD
  total: number; // USD
  zigExchangeRate: number;
  paymentMethod: string;
  receiptNumber: string;
  dateString: string;
  width?: '58mm' | '80mm';
}

export function ReceiptPreview({
  businessName,
  businessAddress = '123 Business St, Harare',
  taxNumber = 'BP1234567',
  vatNumber = 'VAT9876543',
  items,
  subtotal,
  discount,
  tax,
  total,
  zigExchangeRate,
  paymentMethod,
  receiptNumber,
  dateString,
  width = '80mm'
}: ReceiptPreviewProps) {
  const is58 = width === '58mm';
  
  // Convert totals to ZiG for local reporting
  const totalZiG = total * zigExchangeRate;
  const taxZiG = tax * zigExchangeRate;

  return (
    <View className="items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800">
      <Text className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
        Receipt Preview ({width})
      </Text>
      
      {/* Receipt Paper Body */}
      <View 
        style={{ width: is58 ? 260 : 340 }} 
        className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-4 shadow-md rounded-lg"
      >
        {/* Receipt Header */}
        <View className="items-center mb-4">
          <Text className="text-lg font-bold text-center uppercase text-slate-900 dark:text-white">
            {businessName}
          </Text>
          <Text className="text-xs text-center text-slate-500 dark:text-slate-400 mt-1">
            {businessAddress}
          </Text>
          {taxNumber && (
            <Text className="text-[10px] text-slate-400 uppercase mt-0.5">
              TIN: {taxNumber}
            </Text>
          )}
          {vatNumber && (
            <Text className="text-[10px] text-slate-400 uppercase">
              VAT No: {vatNumber}
            </Text>
          )}
        </View>

        {/* Info Rows */}
        <View className="mb-3 border-b border-dashed border-slate-300 pb-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-[10px] text-slate-500">Date: {dateString}</Text>
            <Text className="text-[10px] text-slate-500">No: {receiptNumber}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-[10px] text-slate-500">Mode: {paymentMethod.toUpperCase()}</Text>
            <Text className="text-[10px] text-slate-500">Rate: 1 USD = {zigExchangeRate.toFixed(2)} ZiG</Text>
          </View>
        </View>

        {/* Item Columns Headers */}
        <View className="flex-row mb-1 pb-1 border-b border-slate-200">
          <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-200" style={{ flex: 2 }}>Item</Text>
          <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-center" style={{ flex: 1 }}>Qty</Text>
          <Text className="text-[11px] font-bold text-slate-700 dark:text-slate-200 text-right" style={{ flex: 1.2 }}>Total (USD)</Text>
        </View>

        {/* Items List */}
        <View className="mb-3">
          {items.map((item, index) => (
            <View key={index} className="flex-row py-1">
              <Text className="text-[11px] text-slate-800 dark:text-slate-100" style={{ flex: 2 }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text className="text-[11px] text-slate-800 dark:text-slate-100 text-center" style={{ flex: 1 }}>
                {item.quantity}
              </Text>
              <Text className="text-[11px] text-slate-800 dark:text-slate-100 text-right" style={{ flex: 1.2 }}>
                ${item.totalPrice.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>

        {/* Receipt Totals (USD & ZiG side-by-side) */}
        <View className="border-t border-dashed border-slate-300 pt-2 mb-3">
          <View className="flex-row justify-between py-0.5">
            <Text className="text-[10px] text-slate-500">Subtotal:</Text>
            <Text className="text-[10px] text-slate-800 dark:text-slate-200 font-medium">${subtotal.toFixed(2)}</Text>
          </View>
          {discount > 0 && (
            <View className="flex-row justify-between py-0.5">
              <Text className="text-[10px] text-slate-500">Discount:</Text>
              <Text className="text-[10px] text-red-600 font-medium">-${discount.toFixed(2)}</Text>
            </View>
          )}
          <View className="flex-row justify-between py-0.5">
            <Text className="text-[10px] text-slate-500">VAT (15%):</Text>
            <Text className="text-[10px] text-slate-800 dark:text-slate-200 font-medium">${tax.toFixed(2)}</Text>
          </View>
          
          <View className="flex-row justify-between py-1 border-t border-slate-200 mt-1">
            <Text className="text-xs font-bold text-slate-900 dark:text-white">TOTAL USD:</Text>
            <Text className="text-xs font-bold text-slate-900 dark:text-white">${total.toFixed(2)}</Text>
          </View>
          
          <View className="flex-row justify-between py-1 border-t border-dashed border-slate-200">
            <Text className="text-xs font-bold text-emerald-600">TOTAL ZiG:</Text>
            <Text className="text-xs font-bold text-emerald-600">{totalZiG.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ZiG</Text>
          </View>
        </View>

        {/* Footer message / QR Code Mockup */}
        <View className="items-center mt-2 pt-2 border-t border-slate-100">
          <View className="w-16 h-16 bg-slate-200 dark:bg-slate-800 items-center justify-center rounded mb-1">
            {/* Mock QR Code Pattern */}
            <View className="w-12 h-12 border-2 border-slate-800 dark:border-slate-400 p-0.5 items-center justify-center">
              <View className="w-3 h-3 bg-slate-800 dark:bg-slate-400 self-start mb-0.5" />
              <View className="w-3 h-3 bg-slate-800 dark:bg-slate-400 self-end" />
            </View>
          </View>
          <Text className="text-[9px] text-slate-400 text-center font-medium mt-1">
            Thank you for shopping with us!
          </Text>
          <Text className="text-[8px] text-slate-400 text-center">
            Powered by InkyPOS.co.zw
          </Text>
        </View>
      </View>
    </View>
  );
}
