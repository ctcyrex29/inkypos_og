import React, { useState, useRef } from 'react';
import { RestaurantSettings, PrinterDevice } from '../types';
import {
  Settings,
  Building,
  DollarSign,
  Volume2,
  Printer,
  RotateCcw,
  CheckCircle2,
  Save,
  Image as ImageIcon,
  Upload,
  Sparkles,
  Trash2,
  Eye,
  Flame,
  Utensils
} from 'lucide-react';

interface SettingsViewProps {
  settings: RestaurantSettings;
  onUpdateSettings: (newSettings: RestaurantSettings) => void;
  printer: PrinterDevice;
  onOpenPrinterModal: () => void;
  onResetDemoData: () => void;
}

// Predefined authentic Zimbabwean restaurant logo emblems
const PREDEFINED_LOGOS = [
  {
    id: 'zim-pot',
    name: 'Traditional Pot & Firewood',
    tagline: 'Poto neHuni Traditional Kitchen',
    url: '/src/assets/images/zim_restaurant_pot_logo_1789642944741.jpg',
    description: 'Cast iron pot over wood fire with crossed stirring spoons'
  },
  {
    id: 'zim-grill',
    name: 'Harare Flame & Braai Grill',
    tagline: 'Smoke, Embers & Nyama Grill',
    url: '/src/assets/images/zim_grill_flame_logo_1789642959280.jpg',
    description: 'Roaring braai flames with steak fork & carving knife emblem'
  },
  {
    id: 'zim-heritage',
    name: 'Heritage Bull & Braai Emblem',
    tagline: 'Prime Beef & Mazondo Butchery',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="black"><circle cx="50" cy="50" r="46" fill="none" stroke="black" stroke-width="4" stroke-dasharray="3,2"/><circle cx="50" cy="50" r="40" fill="none" stroke="black" stroke-width="2"/><path d="M30,35 Q50,15 70,35 Q60,42 50,38 Q40,42 30,35 Z" fill="black"/><circle cx="43" cy="50" r="3" fill="black"/><circle cx="57" cy="50" r="3" fill="black"/><path d="M42,62 Q50,70 58,62" fill="none" stroke="black" stroke-width="3" stroke-linecap="round"/><path d="M25,76 L75,76" stroke="black" stroke-width="2"/><text x="50" y="85" font-size="8" font-weight="900" text-anchor="middle" font-family="sans-serif">HARARE GRILL</text></svg>',
    description: 'Clean circular vector cattle horn & braai badge'
  },
  {
    id: 'zim-chef',
    name: 'Chef Toque & Mugoti Spoons',
    tagline: 'Authentic Sadza & Relish Chefs',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="black"><circle cx="50" cy="50" r="44" fill="none" stroke="black" stroke-width="3"/><path d="M35,45 C35,32 42,26 50,26 C58,26 65,32 65,45 C68,45 70,48 70,52 C70,56 67,58 64,58 L36,58 C33,58 30,56 30,52 C30,48 32,45 35,45 Z" fill="black"/><rect x="36" y="58" width="28" height="6" rx="2" fill="black"/><line x1="28" y1="78" x2="72" y2="78" stroke="black" stroke-width="2"/><path d="M32,74 L48,88 M68,74 L52,88" stroke="black" stroke-width="3" stroke-linecap="round"/><text x="50" y="94" font-size="7" font-weight="bold" text-anchor="middle" font-family="sans-serif">MAITA BASA</text></svg>',
    description: 'Chef toque with crossed wooden cooking spoons'
  }
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  printer,
  onOpenPrinterModal,
  onResetDemoData,
}) => {
  const [formData, setFormData] = useState<RestaurantSettings>(settings);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [isTestingVoice, setIsTestingVoice] = useState<boolean>(false);
  const [logoTab, setLogoTab] = useState<'predefined' | 'upload' | 'ai'>('predefined');
  const [aiPrompt, setAiPrompt] = useState<string>('Traditional African cast iron pot over firewood with cooking utensils');
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateSettings(formData);
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  const handleSelectPredefined = (logo: typeof PREDEFINED_LOGOS[0]) => {
    setFormData((prev) => ({
      ...prev,
      receiptLogo: logo.url,
      receiptLogoTitle: logo.name,
      showLogoOnReceipt: true
    }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setUploadError('Please select a valid image file (PNG, JPG, or SVG)');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError('Image size is too large (max 2MB for receipt logo)');
      return;
    }

    setUploadError(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData((prev) => ({
        ...prev,
        receiptLogo: base64,
        receiptLogoTitle: file.name.replace(/\.[^/.]+$/, '').toUpperCase(),
        showLogoOnReceipt: true
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setFormData((prev) => ({
      ...prev,
      receiptLogo: undefined,
      receiptLogoTitle: undefined,
      showLogoOnReceipt: false
    }));
  };

  const handleGenerateAiLogo = () => {
    setIsGeneratingAi(true);
    setTimeout(() => {
      // Pick matching high contrast monochrome theme based on prompt
      const lower = aiPrompt.toLowerCase();
      let chosen = PREDEFINED_LOGOS[0];
      if (lower.includes('grill') || lower.includes('braai') || lower.includes('flame') || lower.includes('smoke')) {
        chosen = PREDEFINED_LOGOS[1];
      } else if (lower.includes('bull') || lower.includes('nyama') || lower.includes('meat') || lower.includes('steak')) {
        chosen = PREDEFINED_LOGOS[2];
      } else if (lower.includes('chef') || lower.includes('spoon') || lower.includes('pot') || lower.includes('cook')) {
        chosen = PREDEFINED_LOGOS[3];
      }

      setFormData((prev) => ({
        ...prev,
        receiptLogo: chosen.url,
        receiptLogoTitle: `AI: ${chosen.name}`,
        showLogoOnReceipt: true
      }));
      setIsGeneratingAi(false);
    }, 800);
  };

  const handleTestVoiceCallout = () => {
    if ('speechSynthesis' in window) {
      setIsTestingVoice(true);
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        'Order Number 42! Your Sadza with T-Bone Steak and Covo is ready for collection!'
      );
      utterance.rate = formData.speechRate || 0.95;
      utterance.onend = () => setIsTestingVoice(false);
      utterance.onerror = () => setIsTestingVoice(false);
      window.speechSynthesis.speak(utterance);
    } else {
      alert('Speech synthesis is not supported on this browser.');
    }
  };

  return (
    <div className="pb-32 pt-2 px-3 sm:px-4 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
              System Configuration
            </span>
          </div>
          <h2 className="text-xl font-black text-white tracking-tight">Restaurant & POS Settings</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure receipt logo branding, Zimbabwean currency rates, EcoCash till, and hardware.
          </p>
        </div>

        {savedSuccess && (
          <div className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4" />
            <span>Settings Saved!</span>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        {/* NEW FEATURE: RECEIPT LOGO & THERMAL BRANDING */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Receipt Logo & Thermal Branding
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">Print on Receipt:</span>
              <input
                type="checkbox"
                checked={formData.showLogoOnReceipt !== false && !!formData.receiptLogo}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    showLogoOnReceipt: e.target.checked
                  })
                }
                className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
              />
            </div>
          </div>

          <p className="text-slate-400 text-xs leading-relaxed">
            Upload your restaurant&apos;s custom insignia or choose from Zimbabwean culinary emblems.
            The logo is automatically optimized for high-contrast thermal printing on 58mm / 80mm rolls and plain paper.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Logo Source Selector */}
            <div className="lg:col-span-7 space-y-3">
              {/* Tab Navigation */}
              <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => setLogoTab('predefined')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    logoTab === 'predefined'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Utensils className="w-3.5 h-3.5" />
                  <span>Predefined Gallery</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLogoTab('upload')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    logoTab === 'upload'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Image</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLogoTab('ai')}
                  className={`flex-1 py-1.5 px-2 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    logoTab === 'ai'
                      ? 'bg-amber-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Logo Studio</span>
                </button>
              </div>

              {/* TAB 1: PREDEFINED LOGOS */}
              {logoTab === 'predefined' && (
                <div className="grid grid-cols-2 gap-2.5">
                  {PREDEFINED_LOGOS.map((logo) => {
                    const isSelected = formData.receiptLogo === logo.url;
                    return (
                      <div
                        key={logo.id}
                        onClick={() => handleSelectPredefined(logo)}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col items-center text-center gap-2 ${
                          isSelected
                            ? 'bg-amber-500/15 border-amber-500 ring-1 ring-amber-500'
                            : 'bg-slate-850 hover:bg-slate-800 border-slate-750'
                        }`}
                      >
                        <div className="w-16 h-16 rounded-xl bg-white p-1.5 flex items-center justify-center shadow-md overflow-hidden">
                          <img
                            src={logo.url}
                            alt={logo.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-contain filter grayscale contrast-150"
                          />
                        </div>
                        <div>
                          <p className="font-bold text-white text-xs leading-snug">{logo.name}</p>
                          <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{logo.description}</p>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded-full">
                            Active Logo
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* TAB 2: UPLOAD LOGO */}
              {logoTab === 'upload' && (
                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleFileUpload}
                    className="hidden"
                  />

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-700 hover:border-amber-400 bg-slate-850/50 hover:bg-slate-850 rounded-2xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
                  >
                    <div className="p-3 bg-amber-500/10 text-amber-400 rounded-full border border-amber-500/20">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-white text-xs">
                        Click or drag to upload your restaurant logo
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Supports PNG, JPG, or SVG (Max 2MB). High contrast images print best.
                      </p>
                    </div>
                  </div>

                  {uploadError && (
                    <p className="text-rose-400 text-xs font-semibold">{uploadError}</p>
                  )}
                </div>
              )}

              {/* TAB 3: AI LOGO GENERATION */}
              {logoTab === 'ai' && (
                <div className="bg-slate-850 p-4 rounded-2xl border border-slate-800 space-y-3">
                  <div className="flex items-center gap-2 text-amber-400 font-bold">
                    <Sparkles className="w-4 h-4" />
                    <span>Generate AI Receipt Stamp</span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Describe your Zimbabwean restaurant theme to generate or select a stylized thermal emblem:
                  </p>

                  <input
                    type="text"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="e.g. Flame braai grill with tongs, Traditional clay pot"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-400"
                  />

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Flame braai & smoke',
                      'Rustic clay pot with fire',
                      'Harare butcher & nyama',
                      'Chef toque with sadza spoon'
                    ].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setAiPrompt(preset)}
                        className="text-[10px] bg-slate-800 hover:bg-slate-750 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700 cursor-pointer"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleGenerateAiLogo}
                    disabled={isGeneratingAi}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isGeneratingAi ? 'Synthesizing Thermal Stamp...' : 'Apply AI Logo Stamp'}</span>
                  </button>
                </div>
              )}

              {/* Logo Title Input & Clear */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1">
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Receipt Logo Header Title:
                  </label>
                  <input
                    type="text"
                    value={formData.receiptLogoTitle || ''}
                    placeholder="e.g. GAVA'S GRILL & POT"
                    onChange={(e) =>
                      setFormData({ ...formData, receiptLogoTitle: e.target.value.toUpperCase() })
                    }
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
                  />
                </div>

                {formData.receiptLogo && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="self-end py-2 px-3 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 font-bold rounded-xl border border-rose-800/40 flex items-center gap-1 cursor-pointer"
                    title="Remove Logo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Right: Live Thermal Print Preview */}
            <div className="lg:col-span-5 bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col items-center">
              <div className="flex items-center justify-between w-full pb-2 border-b border-slate-800 mb-3 text-[11px] text-slate-400">
                <span className="flex items-center gap-1 font-bold text-slate-300">
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  Thermal Print Preview
                </span>
                <span className="text-[10px] uppercase font-mono">{formData.paperWidth} Roll</span>
              </div>

              {/* Monochromatic Thermal Receipt Strip */}
              <div className="w-full max-w-[220px] bg-white text-slate-900 p-4 rounded shadow-2xl font-mono text-[9px] leading-tight select-none border-t-4 border-dashed border-slate-300">
                {formData.showLogoOnReceipt !== false && formData.receiptLogo ? (
                  <div className="flex flex-col items-center justify-center pb-2 mb-2 border-b border-dashed border-slate-300 text-center">
                    <img
                      src={formData.receiptLogo}
                      alt="Thermal Receipt Logo"
                      referrerPolicy="no-referrer"
                      className="w-14 h-14 object-contain filter grayscale contrast-200 mb-1 rounded-full border border-slate-300 p-0.5 bg-white shadow-sm"
                    />
                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-900 font-sans">
                      {formData.receiptLogoTitle || formData.restaurantName}
                    </p>
                  </div>
                ) : (
                  <div className="text-center pb-2 mb-2 border-b border-dashed border-slate-300 text-slate-400 italic">
                    [No Logo Attached]
                  </div>
                )}

                <div className="text-center font-bold text-[10px]">
                  *** {formData.restaurantName.toUpperCase()} ***
                </div>
                <div className="text-center text-[8px] text-slate-600">
                  {formData.tagline}
                </div>
                <div className="text-center text-[8px] text-slate-600">
                  Tel: {formData.phone}
                </div>
                <div className="border-t border-dashed border-slate-300 my-1.5" />
                <div className="text-center font-bold text-[11px]">
                  *** ORDER #42 ***
                </div>
                <div className="text-center text-[9px] font-semibold text-slate-700">
                  [ SIT-IN (DINE IN) ]
                </div>
                <div className="border-t border-dashed border-slate-300 my-1.5" />
                <div className="flex justify-between font-semibold">
                  <span>1x Sadza + T-Bone</span>
                  <span>$8.00</span>
                </div>
                <div className="text-[8px] text-slate-600 pl-2">+ Covo neDovi</div>
                <div className="flex justify-between font-semibold">
                  <span>1x Mazoe Orange</span>
                  <span>$1.00</span>
                </div>
                <div className="border-t border-slate-800 my-1.5" />
                <div className="flex justify-between font-black text-[10px]">
                  <span>TOTAL (USD):</span>
                  <span>$9.00</span>
                </div>
                <div className="flex justify-between text-[8px] text-slate-700">
                  <span>TOTAL (ZiG @ {formData.zigExchangeRate.toFixed(2)}):</span>
                  <span>{(9 * formData.zigExchangeRate).toFixed(2)} ZiG</span>
                </div>
                <div className="text-center text-[8px] mt-2 text-slate-500 font-sans">
                  Maita Basa / Siyabonga!
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 1: RESTAURANT IDENTITY */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Building className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">
              Restaurant Details & Contact
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-bold mb-1">Restaurant Name</label>
              <input
                type="text"
                value={formData.restaurantName}
                onChange={(e) => setFormData({ ...formData, restaurantName: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white font-medium focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">Tagline / Slogan</label>
              <input
                type="text"
                value={formData.tagline}
                onChange={(e) => setFormData({ ...formData, tagline: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">Physical Address / City</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-bold mb-1">Phone / WhatsApp Orders</label>
              <input
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* SECTION 2: ZIMBABWEAN CURRENCY & MOBILE MONEY */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <DollarSign className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">
              Currency, Exchange Rate & EcoCash Till
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-850 p-3 rounded-2xl border border-slate-800 space-y-1">
              <label className="block text-slate-300 font-bold mb-1">
                ZiG / ZWG Rate (per 1 USD)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={formData.zigExchangeRate}
                  onChange={(e) =>
                    setFormData({ ...formData, zigExchangeRate: parseFloat(e.target.value) || 27.5 })
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-bold text-sm focus:outline-none focus:border-amber-400"
                />
                <span className="text-xs text-amber-400 font-bold shrink-0">ZiG / $1</span>
              </div>
              <p className="text-[10px] text-slate-500">
                Used to calculate ZiG on orders and thermal receipts
              </p>
            </div>

            <div className="bg-slate-850 p-3 rounded-2xl border border-slate-800 space-y-1">
              <label className="block text-slate-300 font-bold mb-1">EcoCash Merchant Code</label>
              <input
                type="text"
                value={formData.ecocashMerchantCode}
                onChange={(e) => setFormData({ ...formData, ecocashMerchantCode: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-slate-500">Displayed on payment dialog & printed receipt</p>
            </div>

            <div className="bg-slate-850 p-3 rounded-2xl border border-slate-800 space-y-1">
              <label className="block text-slate-300 font-bold mb-1">InnBucks / Other Code</label>
              <input
                type="text"
                value={formData.innbucksCode || ''}
                onChange={(e) => setFormData({ ...formData, innbucksCode: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-400"
              />
              <p className="text-[10px] text-slate-500">Optional mobile money handle</p>
            </div>
          </div>
        </div>

        {/* SECTION 3: KITCHEN VOICE CALLER & SERVICE DEFAULTS */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <Volume2 className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white uppercase tracking-wide">
              Kitchen Order Number Call-Out
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-white block">Voice Order Caller</span>
                  <span className="text-[10px] text-slate-400">
                    Speaks &quot;Order Number 42 is ready&quot; over restaurant speaker
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.voiceCallerEnabled}
                  onChange={(e) => setFormData({ ...formData, voiceCallerEnabled: e.target.checked })}
                  className="w-5 h-5 rounded text-amber-500 focus:ring-amber-400 bg-slate-800 border-slate-700"
                />
              </div>

              <div className="pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleTestVoiceCallout}
                  disabled={isTestingVoice}
                  className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-amber-400 font-bold rounded-xl border border-slate-700 flex items-center gap-2 cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>{isTestingVoice ? 'Speaking...' : 'Test Voice Callout (Audio)'}</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-850 p-3.5 rounded-2xl border border-slate-800 space-y-3">
              <div>
                <label className="block text-xs font-bold text-white mb-1">
                  Default Dining Service Mode
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, defaultServiceType: 'sit_in' })}
                    className={`py-2 px-3 rounded-xl border text-center font-bold cursor-pointer ${
                      formData.defaultServiceType === 'sit_in'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    Sit-In (Dine In)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, defaultServiceType: 'takeaway' })}
                    className={`py-2 px-3 rounded-xl border text-center font-bold cursor-pointer ${
                      formData.defaultServiceType === 'takeaway'
                        ? 'bg-amber-500 text-slate-950 border-amber-500'
                        : 'bg-slate-900 border-slate-700 text-slate-400'
                    }`}
                  >
                    Takeaway (Parcel)
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                <div>
                  <span className="text-xs font-bold text-white block">Auto-Print Thermal Check</span>
                  <span className="text-[10px] text-slate-400">
                    Print receipt immediately on payment confirmation
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.autoPrintOnPayment}
                  onChange={(e) => setFormData({ ...formData, autoPrintOnPayment: e.target.checked })}
                  className="w-5 h-5 rounded text-amber-500 focus:ring-amber-400 bg-slate-800 border-slate-700 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 4: THERMAL PRINTER SETUP & DIAGNOSTIC */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4 shadow-lg">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wide">
                Receipt Printer Hardware
              </h3>
            </div>
            <button
              type="button"
              onClick={onOpenPrinterModal}
              className="py-1.5 px-3 bg-slate-800 hover:bg-slate-750 text-amber-400 font-bold rounded-lg border border-slate-700 cursor-pointer"
            >
              Open Printer Hub
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="block text-slate-300 font-bold mb-1">Receipt Paper Roll Width</label>
              <select
                value={formData.paperWidth}
                onChange={(e) => setFormData({ ...formData, paperWidth: e.target.value as any })}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
              >
                <option value="58mm">58mm (Mobile Belt-Clip Thermal Printer)</option>
                <option value="80mm">80mm (Countertop POS Thermal Printer)</option>
              </select>
            </div>

            <div className="bg-slate-850 p-3 rounded-2xl border border-slate-800">
              <span className="text-[11px] text-slate-400 block font-semibold">Active Printer Status:</span>
              <p className="text-xs font-bold text-white mt-0.5">
                {printer.connected ? `Connected: ${printer.name}` : 'Not Paired (Direct System Print Available)'}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                Tip: If Bluetooth pairing fails in preview, click &quot;Open in New Tab&quot; or use System Print!
              </p>
            </div>
          </div>
        </div>

        {/* Save CTA */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={() => {
              if (confirm('Reset demo orders and reload Zimbabwean traditional meals & ingredients?')) {
                onResetDemoData();
              }
            }}
            className="py-2.5 px-4 bg-slate-850 hover:bg-slate-800 text-slate-400 hover:text-red-400 rounded-xl font-bold flex items-center gap-1.5 border border-slate-800 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Demo Data</span>
          </button>

          <button
            type="submit"
            className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-sm flex items-center gap-2 shadow-xl shadow-amber-500/20 active:scale-95 transition-transform cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save All Settings</span>
          </button>
        </div>
      </form>
    </div>
  );
};
