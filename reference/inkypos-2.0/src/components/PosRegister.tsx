/**
 * InkyPOS 2.0 — POS Checkout Terminal Component
 * Handles product catalogue, barcode scanning, cart management,
 * split payment modal, and atomic receipt generation.
 */

import React, { useState } from 'react';
import { usePos } from '../context/PosContext.tsx';
import { PaymentMethod, PaymentRecord, Product, SaleTransaction } from '../core/types.ts';
import { formatCurrency, roundToDecimals, usdToZig } from '../core/currency.ts';
import {
  Search,
  Barcode,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  DollarSign,
  Smartphone,
  Coins,
  CheckCircle2,
  Printer,
  X,
  AlertCircle,
} from 'lucide-react';

export const PosRegister: React.FC = () => {
  const {
    products,
    cart,
    addToCart,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    checkout,
    currency,
    exchangeRate,
    graceStatus,
    lastCompletedSale,
    setLastCompletedSale,
  } = usePos();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'catalogue' | 'cart'>('catalogue');

  // Payment Modal State
  const [tenderMethod, setTenderMethod] = useState<PaymentMethod>('CASH_USD');
  const [tenderAmount, setTenderAmount] = useState<string>('');
  const [paymentsList, setPaymentsList] = useState<PaymentRecord[]>([]);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Categories
  const categories = ['ALL', ...Array.from(new Set(products.map((p) => p.category)))];

  // Filtered Products
  const filteredProducts = products.filter((p) => {
    const matchesCat = selectedCategory === 'ALL' || p.category === selectedCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Cart totals
  const subtotalUSD = roundToDecimals(cart.reduce((acc, i) => acc + i.totalUSD, 0), 2);
  const totalTaxUSD = roundToDecimals(cart.reduce((acc, i) => acc + i.taxAmountUSD, 0), 2);
  const totalUSD = subtotalUSD;
  const totalZiG = usdToZig(totalUSD, exchangeRate);

  // Barcode handler
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput.trim()) return;
    const match = products.find((p) => p.barcode === barcodeInput.trim());
    if (match) {
      addToCart(match);
      setBarcodeInput('');
    } else {
      alert(`No product found with barcode ${barcodeInput}`);
    }
  };

  // Open Payment Modal
  const openCheckout = () => {
    if (cart.length === 0) return;
    setPaymentsList([]);
    setTenderMethod(currency === 'ZIG' ? 'CASH_ZIG' : 'CASH_USD');
    setTenderAmount(currency === 'ZIG' ? totalZiG.toString() : totalUSD.toString());
    setPaymentError(null);
    setIsPaymentModalOpen(true);
  };

  // Add Tender to Split Payment
  const addPayment = () => {
    const amt = parseFloat(tenderAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError('Please enter a valid payment amount');
      return;
    }

    const isZig = tenderMethod === 'CASH_ZIG' || tenderMethod === 'CARD_ZIG';
    const amountInUSD = isZig ? roundToDecimals(amt / exchangeRate, 2) : amt;

    const newPayment: PaymentRecord = {
      id: `pay-${Date.now().toString(36)}`,
      paymentMethod: tenderMethod,
      currency: isZig ? 'ZIG' : 'USD',
      amount: amt,
      amountInUSD,
      exchangeRate,
      status: 'SETTLED_OFFLINE',
      tenderedAt: new Date().toISOString(),
    };

    const updated = [...paymentsList, newPayment];
    setPaymentsList(updated);
    setPaymentError(null);

    // Calculate remaining
    const totalPaidUSD = roundToDecimals(
      updated.reduce((acc, p) => acc + p.amountInUSD, 0),
      2
    );
    const remainingUSD = Math.max(0, roundToDecimals(totalUSD - totalPaidUSD, 2));

    if (remainingUSD > 0) {
      setTenderAmount(
        currency === 'ZIG'
          ? usdToZig(remainingUSD, exchangeRate).toString()
          : remainingUSD.toString()
      );
    } else {
      setTenderAmount('0');
    }
  };

  // Remove Payment
  const removePayment = (index: number) => {
    const updated = paymentsList.filter((_, i) => i !== index);
    setPaymentsList(updated);
  };

  // Complete Checkout
  const handleCompleteSale = async () => {
    const totalPaidUSD = roundToDecimals(
      paymentsList.reduce((acc, p) => acc + p.amountInUSD, 0),
      2
    );

    if (totalPaidUSD < totalUSD) {
      setPaymentError(
        `Insufficient payment. Total due is $${totalUSD}, but only $${totalPaidUSD} has been tendered.`
      );
      return;
    }

    try {
      const sale = await checkout(paymentsList);
      setIsPaymentModalOpen(false);
      setIsReceiptModalOpen(true);
    } catch (err: unknown) {
      setPaymentError(err instanceof Error ? err.message : String(err));
    }
  };

  const totalPaidUSD = roundToDecimals(
    paymentsList.reduce((acc, p) => acc + p.amountInUSD, 0),
    2
  );
  const remainingUSD = Math.max(0, roundToDecimals(totalUSD - totalPaidUSD, 2));
  const changeDueUSD = Math.max(0, roundToDecimals(totalPaidUSD - totalUSD, 2));
  const changeDueZiG = usdToZig(changeDueUSD, exchangeRate);

  return (
    <div className="flex-1 flex flex-col lg:flex-row h-[calc(100vh-100px)] overflow-hidden bg-slate-100 relative">
      {/* Mobile Sub-Navigation Bar (Only visible on screens below lg) */}
      <div className="lg:hidden flex bg-white border-b border-slate-200 px-3 py-1.5 text-xs font-semibold gap-2 shrink-0">
        <button
          onClick={() => setMobileTab('catalogue')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
            mobileTab === 'catalogue'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          <span>Products</span>
          <span className="text-[10px] bg-indigo-500/30 px-1.5 rounded">
            {filteredProducts.length}
          </span>
        </button>
        <button
          onClick={() => setMobileTab('cart')}
          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-1.5 transition-colors ${
            mobileTab === 'cart'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5" />
          <span>Cart</span>
          <span className="text-[10px] bg-slate-800 text-white px-1.5 rounded font-bold">
            {cart.reduce((a, b) => a + b.quantity, 0)}
          </span>
        </button>
      </div>

      {/* Left: Product Catalogue & Barcode Scanner */}
      <div
        className={`flex-1 flex-col border-r border-slate-300 min-w-0 overflow-hidden ${
          mobileTab === 'catalogue' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* Search & Barcode Bar */}
        <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center gap-2">
          {/* Text Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search product by name, SKU, or category..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Barcode Simulator */}
          <form onSubmit={handleBarcodeSubmit} className="flex items-center gap-1">
            <div className="relative">
              <Barcode className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Scan / Type Barcode..."
                className="pl-8 pr-2 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-lg w-40 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="px-2.5 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-lg hover:bg-slate-700 transition-colors"
            >
              Scan
            </button>
          </form>
        </div>

        {/* Category Pills */}
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto text-xs">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1 rounded-full whitespace-nowrap transition-colors font-medium ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-100'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Products Grid */}
        <div className="flex-1 p-3 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {filteredProducts.map((p) => {
            const priceDisplay =
              currency === 'ZIG'
                ? formatCurrency(usdToZig(p.priceUSD, exchangeRate), 'ZIG')
                : formatCurrency(p.priceUSD, 'USD');

            const altPrice =
              currency === 'ZIG'
                ? formatCurrency(p.priceUSD, 'USD')
                : formatCurrency(usdToZig(p.priceUSD, exchangeRate), 'ZIG');

            return (
              <div
                key={p.id}
                onClick={() => addToCart(p)}
                className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col justify-between hover:shadow-md hover:border-indigo-400 transition-all cursor-pointer group select-none text-left"
              >
                <div>
                  <div className="flex items-start justify-between gap-1 mb-1">
                    <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-1.5 py-0.5 rounded">
                      {p.category}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        p.stockQuantity > 20
                          ? 'bg-emerald-50 text-emerald-700'
                          : p.stockQuantity > 0
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      Stock: {p.stockQuantity}
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-slate-800 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                    {p.name}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.barcode}</p>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-100 flex items-baseline justify-between">
                  <div>
                    <span className="text-sm font-black text-slate-900">{priceDisplay}</span>
                    <span className="text-[10px] text-slate-400 block -mt-0.5">({altPrice})</span>
                  </div>
                  <button
                    aria-label={`Add ${p.name} to cart`}
                    className="w-7 h-7 bg-indigo-50 group-hover:bg-indigo-600 group-hover:text-white text-indigo-600 rounded-lg flex items-center justify-center transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating View Cart Button on Mobile when in Catalogue mode */}
      {mobileTab === 'catalogue' && cart.length > 0 && (
        <button
          onClick={() => setMobileTab('cart')}
          className="lg:hidden absolute bottom-4 right-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-3 rounded-full shadow-xl flex items-center gap-2 z-20 animate-bounce"
        >
          <ShoppingCart className="w-4 h-4" />
          <span>View Cart ({cart.reduce((a, b) => a + b.quantity, 0)})</span>
          <span>•</span>
          <span>${totalUSD.toFixed(2)}</span>
        </button>
      )}

      {/* Right: Cart & Tender Panel */}
      <div
        className={`w-full lg:w-96 bg-white flex-col h-full shadow-lg ${
          mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {/* Cart Header */}
        <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-indigo-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider">Current Cart</h2>
            <span className="text-xs bg-slate-800 text-indigo-300 px-2 py-0.5 rounded-full font-bold">
              {cart.reduce((a, b) => a + b.quantity, 0)} items
            </span>
          </div>
          {cart.length > 0 && (
            <button
              onClick={clearCart}
              className="text-[11px] text-rose-300 hover:text-white flex items-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* Cart Line Items */}
        <div className="flex-1 p-3 overflow-y-auto space-y-2">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-6">
              <ShoppingCart className="w-10 h-10 stroke-1 text-slate-300 mb-2" />
              <p className="text-xs font-medium">Cart is currently empty</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Scan a barcode or tap products from catalogue to add them to this sale.
              </p>
            </div>
          ) : (
            cart.map((item) => (
              <div
                key={item.product.id}
                className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-semibold text-slate-800 truncate">
                    {item.product.name}
                  </h4>
                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                    <span>
                      {currency === 'ZIG'
                        ? formatCurrency(usdToZig(item.unitPriceUSD, exchangeRate), 'ZIG')
                        : formatCurrency(item.unitPriceUSD, 'USD')}
                    </span>
                    <span>x</span>
                    <span className="font-bold text-slate-700">{item.quantity}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                    className="w-6 h-6 bg-white border border-slate-300 rounded flex items-center justify-center hover:bg-slate-100 text-slate-600"
                    aria-label={`Decrease quantity of ${item.product.name}`}
                  >
                    <Minus className="w-3 h-3" />
                  </button>
                  <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                  <button
                    onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                    className="w-6 h-6 bg-white border border-slate-300 rounded flex items-center justify-center hover:bg-slate-100 text-slate-600"
                    aria-label={`Increase quantity of ${item.product.name}`}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => removeFromCart(item.product.id)}
                    className="w-6 h-6 text-rose-500 hover:text-rose-700 ml-1 flex items-center justify-center"
                    aria-label={`Remove ${item.product.name} from cart`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-right pl-2 font-bold text-xs text-slate-900">
                  {currency === 'ZIG'
                    ? formatCurrency(usdToZig(item.totalUSD, exchangeRate), 'ZIG')
                    : formatCurrency(item.totalUSD, 'USD')}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Summary & Checkout Trigger */}
        <div className="p-3 bg-slate-50 border-t border-slate-200">
          <div className="space-y-1.5 text-xs text-slate-600 mb-3">
            <div className="flex justify-between">
              <span>Subtotal:</span>
              <span className="font-semibold text-slate-800">${subtotalUSD.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Standard 15% VAT (Included):</span>
              <span>${totalTaxUSD.toFixed(2)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex justify-between items-baseline">
              <span className="text-sm font-bold text-slate-900">Total Payable:</span>
              <div className="text-right">
                <span className="text-base font-black text-indigo-700">
                  {currency === 'ZIG'
                    ? formatCurrency(totalZiG, 'ZIG')
                    : formatCurrency(totalUSD, 'USD')}
                </span>
                <span className="text-[10px] text-slate-400 block">
                  {currency === 'ZIG'
                    ? formatCurrency(totalUSD, 'USD')
                    : formatCurrency(totalZiG, 'ZIG')}
                </span>
              </div>
            </div>
          </div>

          {graceStatus.status === 'LOCKED' ? (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Checkout locked: Offline grace period has expired. Re-sync required.</span>
            </div>
          ) : (
            <button
              onClick={openCheckout}
              disabled={cart.length === 0}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              <span>Charge & Tender Payment</span>
            </button>
          )}
        </div>
      </div>

      {/* Split Payment Modal */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Tender Split Payment</h3>
                <p className="text-[11px] text-slate-400">
                  Total Due: ${totalUSD.toFixed(2)} USD (ZiG {totalZiG.toFixed(2)})
                </p>
              </div>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4 max-h-[75vh] overflow-y-auto">
              {paymentError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              {/* Tender Methods Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Select Tender Method:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { method: 'CASH_USD', label: 'Cash USD', icon: DollarSign },
                    { method: 'CASH_ZIG', label: 'Cash ZiG', icon: Coins },
                    { method: 'ECOCASH', label: 'EcoCash USD', icon: Smartphone },
                    { method: 'INNBUCKS', label: 'InnBucks', icon: Smartphone },
                    { method: 'CARD_USD', label: 'Card USD', icon: CreditCard },
                    { method: 'SWIPE', label: 'Swipe / ZimSwitch', icon: CreditCard },
                  ].map(({ method, label, icon: Icon }) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => {
                        setTenderMethod(method as PaymentMethod);
                        const isZig = method === 'CASH_ZIG' || method === 'CARD_ZIG';
                        setTenderAmount(
                          isZig ? usdToZig(remainingUSD, exchangeRate).toString() : remainingUSD.toString()
                        );
                      }}
                      className={`p-2 rounded-lg border text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                        tenderMethod === method
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Amount to Tender ({tenderMethod.includes('ZIG') ? 'ZiG' : 'USD'}):
                  </label>
                  <span className="text-[11px] text-slate-500 font-mono">
                    Rate: 1 USD = {exchangeRate} ZiG
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    className="flex-1 px-3 py-2 text-sm font-bold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={tenderAmount}
                    onChange={(e) => setTenderAmount(e.target.value)}
                  />
                  <button
                    type="button"
                    aria-label="Add Tender Amount"
                    onClick={addPayment}
                    className="px-4 py-2 bg-slate-800 text-white font-bold text-xs rounded-lg hover:bg-slate-700 transition-colors"
                  >
                    + Add Tender
                  </button>
                </div>
              </div>

              {/* Applied Tenders List */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Applied Tenders:
                </label>
                {paymentsList.length === 0 ? (
                  <p className="text-xs text-slate-400 italic bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    No tenders added yet. Select method, enter amount, and click Add Tender.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {paymentsList.map((p, idx) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{p.paymentMethod}</span>
                          <span className="text-slate-500 font-mono">
                            {p.currency === 'ZIG' ? `ZiG ${p.amount}` : `$${p.amount}`}
                          </span>
                          {p.currency === 'ZIG' && (
                            <span className="text-[10px] text-slate-400">
                              (≈ ${p.amountInUSD.toFixed(2)} USD)
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removePayment(idx)}
                          className="text-rose-500 hover:text-rose-700 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment Balance Sheet */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Total Due:</span>
                  <span className="font-semibold">${totalUSD.toFixed(2)} USD</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Tendered:</span>
                  <span className="font-bold text-slate-900">${totalPaidUSD.toFixed(2)} USD</span>
                </div>
                {remainingUSD > 0 && (
                  <div className="flex justify-between text-amber-600 font-bold">
                    <span>Remaining Balance:</span>
                    <span>${remainingUSD.toFixed(2)} USD</span>
                  </div>
                )}
                {changeDueUSD > 0 && (
                  <div className="flex justify-between text-emerald-600 font-bold border-t border-slate-200 pt-1.5">
                    <span>Change Due to Customer:</span>
                    <div className="text-right">
                      <span>${changeDueUSD.toFixed(2)} USD</span>
                      <span className="text-[10px] block text-emerald-500">
                        (or ZiG {changeDueZiG.toFixed(2)})
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteSale}
                disabled={totalPaidUSD < totalUSD}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow transition-all flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Complete & Commit Offline</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Receipt Modal */}
      {isReceiptModalOpen && lastCompletedSale && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-slate-200">
            <div className="p-3 bg-slate-900 text-white flex items-center justify-between">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Sale Completed & Stored</span>
              </span>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Thermal Receipt Preview */}
            <div className="p-5 font-mono text-[11px] leading-tight text-slate-800 bg-white border-b border-dashed border-slate-300">
              <div className="text-center space-y-1 mb-4">
                <h4 className="font-bold text-sm tracking-widest uppercase">INKYPOS STORE</h4>
                <p className="text-[10px] text-slate-500">TIN: 200194857-ZW | VAT: 8849201</p>
                <p className="text-[10px] text-slate-500">1st St & Nelson Mandela, Harare</p>
                <p className="text-[10px] font-semibold text-indigo-700 mt-1">
                  *** TAX INVOICE ***
                </p>
              </div>

              <div className="border-t border-b border-slate-300 py-1.5 mb-2 text-[10px] space-y-0.5">
                <div>Receipt: {lastCompletedSale.localReceiptNumber}</div>
                <div>Date: {new Date(lastCompletedSale.createdAt).toLocaleString()}</div>
                <div>Register: {lastCompletedSale.registerId}</div>
                <div>Cashier: {lastCompletedSale.cashierName}</div>
              </div>

              {/* Items */}
              <div className="space-y-1 mb-3">
                {lastCompletedSale.items.map((i) => (
                  <div key={i.product.id} className="flex justify-between">
                    <span>
                      {i.quantity}x {i.product.name.slice(0, 16)}
                    </span>
                    <span>${i.totalUSD.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-300 pt-2 space-y-1 text-xs">
                <div className="flex justify-between font-bold">
                  <span>TOTAL USD:</span>
                  <span>${lastCompletedSale.totalUSD.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-indigo-600">
                  <span>TOTAL ZiG (1:{lastCompletedSale.exchangeRateUsed}):</span>
                  <span>ZiG {lastCompletedSale.totalInDisplayCurrency.toFixed(2)}</span>
                </div>
              </div>

              {/* Payments breakdown */}
              <div className="border-t border-slate-200 mt-2 pt-1 text-[10px] space-y-0.5">
                <div className="font-semibold text-slate-600">Tendered:</div>
                {lastCompletedSale.payments.map((p) => (
                  <div key={p.id} className="flex justify-between text-slate-500">
                    <span>{p.paymentMethod}</span>
                    <span>
                      {p.currency === 'ZIG' ? `ZiG ${p.amount}` : `$${p.amount}`}
                    </span>
                  </div>
                ))}
                {lastCompletedSale.changeDueUSD > 0 && (
                  <div className="flex justify-between font-bold text-emerald-600 pt-1">
                    <span>Change:</span>
                    <span>
                      ${lastCompletedSale.changeDueUSD.toFixed(2)} (ZiG {lastCompletedSale.changeDueZIG.toFixed(2)})
                    </span>
                  </div>
                )}
              </div>

              {/* Fiscal Notice */}
              <div className="mt-4 pt-3 border-t border-dashed border-slate-300 text-center text-[9px] text-slate-500 space-y-1">
                <div className="font-bold text-slate-700">FISCALISATION STATUS:</div>
                <div className="bg-slate-100 p-1 rounded font-mono text-slate-600">
                  PENDING REGULATORY VERIFICATION (ZIMRA FDMS ADAPTER INACTIVE)
                </div>
                <p>Thank you for shopping with us!</p>
              </div>
            </div>

            {/* Receipt Modal Footer */}
            <div className="p-3 bg-slate-50 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  window.print();
                }}
                className="px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Receipt</span>
              </button>
              <button
                onClick={() => setIsReceiptModalOpen(false)}
                className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700"
              >
                New Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
