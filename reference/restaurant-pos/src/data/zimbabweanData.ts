import { BaseStaple, RelishOption, VegetableSide, DrinkOption, InventoryIngredient, RestaurantSettings, Order } from '../types';

export const DEFAULT_SETTINGS: RestaurantSettings = {
  restaurantName: "Gava's Traditional Kitchen & Grill",
  tagline: "Authentic Sadza, Nyama, Maguru, Mazondo & Braai",
  address: "Belgravia Sports Club, Samora Machel Ave, Harare",
  phone: "+263 77 212 3456",
  ecocashMerchantCode: "294810 (*151*2*2*294810#)",
  innbucksCode: "INNB-88219",
  zigExchangeRate: 27.50, // 1 USD = 27.50 ZiG
  taxRate: 0.15,
  taxEnabled: false, // In many casual dining spots in Zim, tax is either flat or 0
  voiceCallerEnabled: true,
  speechRate: 0.95,
  defaultServiceType: 'sit_in',
  autoPrintOnPayment: true,
  paperWidth: '58mm',
  receiptCopies: 1,
  receiptLogo: '/src/assets/images/zim_restaurant_pot_logo_1789642944741.jpg',
  receiptLogoTitle: 'Traditional Pot & Firewood',
  showLogoOnReceipt: true,
};

export const BASE_STAPLES: BaseStaple[] = [
  {
    id: 'staple-sadza',
    name: 'Sadza (White Maize)',
    shonaName: 'Sadza reMupfu Muchena',
    description: 'Freshly stirred steaming white cornmeal sadza, the heart of Zimbabwean dining',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-maize-meal', amount: 0.25 }, // 250g maize meal per portion
      { ingredientId: 'ing-cooking-oil', amount: 0.01 }
    ]
  },
  {
    id: 'staple-rezviyo',
    name: 'Sadza Rezviyo (Brown Millet)',
    shonaName: 'Sadza reMhunga / Rezviyo',
    description: 'Traditional wholesome brown finger millet sadza, rich earthy aroma',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-millet-meal', amount: 0.25 }
    ]
  },
  {
    id: 'staple-rice',
    name: 'Rice (White Long Grain)',
    shonaName: 'Mupunga Muchena',
    description: 'Fluffy steamed long grain white rice',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-rice', amount: 0.20 }
    ]
  },
  {
    id: 'staple-ricedovi',
    name: 'Rice neDovi (Peanut Butter Rice)',
    shonaName: 'Mupunga une Dovi',
    description: 'Rich traditional rice cooked with smooth roasted peanut butter',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-rice', amount: 0.20 },
      { ingredientId: 'ing-dovi', amount: 0.06 } // 60g peanut butter
    ]
  },
  {
    id: 'staple-spaghetti',
    name: 'Spaghetti (Savory)',
    shonaName: 'Spaghetti rekuKanga',
    description: 'Al dente spaghetti tossed in seasoned onion-tomato pan gravy',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-spaghetti', amount: 0.18 },
      { ingredientId: 'ing-cooking-oil', amount: 0.02 }
    ]
  }
];

export const RELISH_OPTIONS: RelishOption[] = [
  {
    id: 'rel-tbone',
    name: 'T-Bone Steak',
    shonaName: 'T-Bone yeMombe',
    category: 'beef',
    price: 6.50,
    description: 'Tender prime-cut Zimbabwean T-Bone char-grilled or pan-seared with savory muto',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-tbone', amount: 1 }, // 1 cut
      { ingredientId: 'ing-cooking-oil', amount: 0.03 }
    ]
  },
  {
    id: 'rel-porkchop',
    name: 'Pork Chop',
    shonaName: 'Pork Chop yekuKanga',
    category: 'pork',
    price: 5.50,
    description: 'Crisp seasoned pork chop seared golden with juicy center and crackling edge',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-porkchop', amount: 1 },
      { ingredientId: 'ing-cooking-oil', amount: 0.03 }
    ]
  },
  {
    id: 'rel-beef',
    name: 'Beef Stew',
    shonaName: 'Nyama yeMombe ine Muto',
    category: 'beef',
    price: 5.00,
    description: 'Slow-simmered beef chuck in deep tomato, garlic, and sweet onion gravy',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-beef', amount: 0.30 }, // 300g stewing beef
      { ingredientId: 'ing-cooking-oil', amount: 0.02 }
    ]
  },
  {
    id: 'rel-maguru',
    name: 'Maguru & Matumbu (Offals)',
    shonaName: 'Maguru neMatumbu eMombe',
    category: 'offals',
    price: 4.50,
    description: 'Classic beef tripe and intestines simmered in thick savory pepper gravy',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-maguru', amount: 0.30 },
      { ingredientId: 'ing-cooking-oil', amount: 0.02 }
    ]
  },
  {
    id: 'rel-roadrunner',
    name: 'Roadrunner Chicken',
    shonaName: 'Huku yeChibhoyi',
    category: 'chicken',
    price: 6.50,
    description: 'Free-range indigenous chicken braised tender with intense traditional flavor',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-roadrunner', amount: 1 },
      { ingredientId: 'ing-cooking-oil', amount: 0.02 }
    ]
  },
  {
    id: 'rel-mazondo',
    name: 'Mazondo (Cow Trotters)',
    shonaName: 'Mazondo eMombe',
    category: 'offals',
    price: 5.50,
    description: 'Slow-braised cow heels in rich, sticky, nutrient-packed savory broth',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-mazondo', amount: 0.40 } // 400g mazondo
    ]
  },
  {
    id: 'rel-fish',
    name: 'Fried Kariba Bream / Fish',
    shonaName: 'Hove yeBream',
    category: 'fish',
    price: 6.00,
    description: 'Crispy fried fresh Kariba bream with lemon pepper crust and onion relish',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-fish', amount: 1 },
      { ingredientId: 'ing-cooking-oil', amount: 0.04 }
    ]
  },
  {
    id: 'rel-oxtail',
    name: 'Braised Oxtail',
    shonaName: 'Oxtail ine Muto Mukobvu',
    category: 'beef',
    price: 8.00,
    description: 'Melt-in-your-mouth slow braised oxtail in red wine and herb reduction',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-oxtail', amount: 0.35 }
    ]
  },
  {
    id: 'rel-beans',
    name: 'Sugar Beans Stew (Vegetarian)',
    shonaName: 'Mabhinzi ane Muto',
    category: 'vegetarian',
    price: 3.50,
    description: 'Rich spiced red speckled sugar beans simmered with carrots and tomato gravy',
    isAvailable: true,
    ingredients: [
      { ingredientId: 'ing-beans', amount: 0.25 },
      { ingredientId: 'ing-cooking-oil', amount: 0.02 }
    ]
  }
];

export const VEGETABLE_SIDES: VegetableSide[] = [
  {
    id: 'veg-covo-dovi',
    name: 'Covo neDovi (Greens in Peanut Butter)',
    shonaName: 'Muriwo weCovo une Dovi',
    price: 0, // included
    ingredients: [
      { ingredientId: 'ing-covo', amount: 0.15 },
      { ingredientId: 'ing-dovi', amount: 0.04 }
    ]
  },
  {
    id: 'veg-rape',
    name: 'Fried Rape / Tsunga Greens',
    shonaName: 'Muriwo weRape wakakangwa',
    price: 0,
    ingredients: [
      { ingredientId: 'ing-covo', amount: 0.15 },
      { ingredientId: 'ing-cooking-oil', amount: 0.01 }
    ]
  },
  {
    id: 'veg-chakalaka',
    name: 'Spicy Chakalaka Relish',
    shonaName: 'Chakalaka ine Mhiripiri',
    price: 0,
    ingredients: [
      { ingredientId: 'ing-covo', amount: 0.10 }
    ]
  }
];

export const DRINK_OPTIONS: DrinkOption[] = [
  {
    id: 'drk-mazoe-glass',
    name: 'Mazoe Orange Crush (Glass)',
    category: 'cordial',
    price: 1.00,
    description: 'Cold chilled Zimbabwe national favorite',
    ingredientId: 'ing-mazoe',
    isAvailable: true
  },
  {
    id: 'drk-mazoe-bottle',
    name: 'Mazoe Orange (500ml RTD)',
    category: 'cordial',
    price: 1.50,
    ingredientId: 'ing-mazoe',
    isAvailable: true
  },
  {
    id: 'drk-chibuku',
    name: 'Chibuku Super (1.25L Scud)',
    category: 'traditional',
    price: 1.50,
    description: 'Traditional sorghum craft brew',
    ingredientId: 'ing-chibuku',
    isAvailable: true
  },
  {
    id: 'drk-zambezi',
    name: 'Zambezi Lager (330ml Can)',
    category: 'beer',
    price: 2.00,
    description: "Zimbabwe's own lager beer",
    ingredientId: 'ing-zambezi',
    isAvailable: true
  },
  {
    id: 'drk-castle',
    name: 'Castle Lite (330ml Can)',
    category: 'beer',
    price: 2.00,
    description: 'Extra cold refreshing lager',
    ingredientId: 'ing-castle',
    isAvailable: true
  },
  {
    id: 'drk-stoney',
    name: 'Stoney Ginger Beer (330ml)',
    category: 'soft_drink',
    price: 1.00,
    description: 'Fiery ginger kick',
    ingredientId: 'ing-stoney',
    isAvailable: true
  },
  {
    id: 'drk-coke',
    name: 'Coca-Cola (330ml Can)',
    category: 'soft_drink',
    price: 1.00,
    ingredientId: 'ing-coke',
    isAvailable: true
  },
  {
    id: 'drk-water',
    name: 'Mineral Water (500ml)',
    category: 'water',
    price: 1.00,
    ingredientId: 'ing-water',
    isAvailable: true
  }
];

export const INITIAL_INGREDIENTS: InventoryIngredient[] = [
  // Staples
  {
    id: 'ing-maize-meal',
    name: 'Maize Meal (Mealie-Meal / Roller Meal)',
    category: 'staples',
    currentStock: 45.0, // 45 kg
    unit: 'kg',
    lowStockThreshold: 10.0,
    costPerUnit: 0.85,
    supplier: 'National Foods Zimbabwe',
    lastRestocked: new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-millet-meal',
    name: 'Millet Meal (Upfu hweZviyo)',
    category: 'staples',
    currentStock: 12.5,
    unit: 'kg',
    lowStockThreshold: 4.0,
    costPerUnit: 1.40,
    supplier: 'Mbare Musika Grains',
    lastRestocked: new Date(Date.now() - 72 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-rice',
    name: 'Long Grain White Rice',
    category: 'staples',
    currentStock: 22.0,
    unit: 'kg',
    lowStockThreshold: 5.0,
    costPerUnit: 1.20,
    supplier: 'Mega Market Harare',
    lastRestocked: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-spaghetti',
    name: 'Spaghetti Pasta',
    category: 'staples',
    currentStock: 8.5,
    unit: 'kg',
    lowStockThreshold: 3.0,
    costPerUnit: 1.50,
    supplier: 'Gloria Pasta Distributors',
    lastRestocked: new Date(Date.now() - 96 * 3600 * 1000).toISOString()
  },

  // Meats & Relish
  {
    id: 'ing-tbone',
    name: 'T-Bone Steaks (Portions)',
    category: 'meat',
    currentStock: 28, // 28 cuts
    unit: 'portions',
    lowStockThreshold: 6,
    costPerUnit: 3.50,
    supplier: 'Koala Park Butchery',
    lastRestocked: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-porkchop',
    name: 'Pork Chops (Portions)',
    category: 'meat',
    currentStock: 20,
    unit: 'portions',
    lowStockThreshold: 5,
    costPerUnit: 2.80,
    supplier: 'Colcom Foods',
    lastRestocked: new Date(Date.now() - 20 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-beef',
    name: 'Stewing Beef Chuck',
    category: 'meat',
    currentStock: 16.5,
    unit: 'kg',
    lowStockThreshold: 4.0,
    costPerUnit: 4.20,
    supplier: 'Montana Meats',
    lastRestocked: new Date(Date.now() - 18 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-maguru',
    name: 'Maguru & Matumbu (Offals / Tripe)',
    category: 'meat',
    currentStock: 14.0,
    unit: 'kg',
    lowStockThreshold: 4.0,
    costPerUnit: 2.60,
    supplier: 'Surrey Meats',
    lastRestocked: new Date(Date.now() - 14 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-roadrunner',
    name: 'Roadrunner Chicken (Huku yeChibhoyi)',
    category: 'meat',
    currentStock: 18,
    unit: 'portions',
    lowStockThreshold: 5,
    costPerUnit: 3.80,
    supplier: 'Mashonaland Free-range Farms',
    lastRestocked: new Date(Date.now() - 22 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-mazondo',
    name: 'Mazondo (Cow Trotters)',
    category: 'meat',
    currentStock: 12.0,
    unit: 'kg',
    lowStockThreshold: 3.0,
    costPerUnit: 2.90,
    supplier: 'Mbare Abattoir',
    lastRestocked: new Date(Date.now() - 36 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-fish',
    name: 'Kariba Bream Fish Portions',
    category: 'meat',
    currentStock: 15,
    unit: 'portions',
    lowStockThreshold: 4,
    costPerUnit: 3.20,
    supplier: 'Lake Harvest Kariba',
    lastRestocked: new Date(Date.now() - 30 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-oxtail',
    name: 'Oxtail Meat',
    category: 'meat',
    currentStock: 8.5,
    unit: 'kg',
    lowStockThreshold: 2.5,
    costPerUnit: 5.50,
    supplier: 'Koala Park Butchery',
    lastRestocked: new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-beans',
    name: 'Sugar Beans (Red Speckled)',
    category: 'staples',
    currentStock: 12.0,
    unit: 'kg',
    lowStockThreshold: 3.0,
    costPerUnit: 1.60,
    supplier: 'Cairns Foods',
    lastRestocked: new Date(Date.now() - 72 * 3600 * 1000).toISOString()
  },

  // Vegetables & Pantry
  {
    id: 'ing-covo',
    name: 'Covo / Rape Greens (Muriwo)',
    category: 'vegetables',
    currentStock: 18,
    unit: 'bundles',
    lowStockThreshold: 5,
    costPerUnit: 0.50,
    supplier: 'Mbare Musika Market',
    lastRestocked: new Date(Date.now() - 8 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-dovi',
    name: 'Peanut Butter (Dovi / Groundnut Paste)',
    category: 'pantry',
    currentStock: 6.5,
    unit: 'kg',
    lowStockThreshold: 2.0,
    costPerUnit: 2.50,
    supplier: 'Local Artisanal Peanut Mills',
    lastRestocked: new Date(Date.now() - 48 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-cooking-oil',
    name: 'Pure Vegetable Cooking Oil',
    category: 'pantry',
    currentStock: 16.0,
    unit: 'liters',
    lowStockThreshold: 4.0,
    costPerUnit: 1.80,
    supplier: 'Olivine Industries',
    lastRestocked: new Date(Date.now() - 60 * 3600 * 1000).toISOString()
  },

  // Beverages
  {
    id: 'ing-mazoe',
    name: 'Mazoe Orange Crush Bottles',
    category: 'beverages',
    currentStock: 24,
    unit: 'bottles',
    lowStockThreshold: 6,
    costPerUnit: 0.90,
    supplier: 'Schweppes Zimbabwe',
    lastRestocked: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-chibuku',
    name: 'Chibuku Super Scuds',
    category: 'beverages',
    currentStock: 28,
    unit: 'bottles',
    lowStockThreshold: 8,
    costPerUnit: 1.00,
    supplier: 'Delta Beverages Harare',
    lastRestocked: new Date(Date.now() - 16 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-zambezi',
    name: 'Zambezi Lager (Cans)',
    category: 'beverages',
    currentStock: 36,
    unit: 'bottles',
    lowStockThreshold: 10,
    costPerUnit: 1.30,
    supplier: 'Delta Beverages',
    lastRestocked: new Date(Date.now() - 28 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-castle',
    name: 'Castle Lite (Cans)',
    category: 'beverages',
    currentStock: 32,
    unit: 'bottles',
    lowStockThreshold: 10,
    costPerUnit: 1.30,
    supplier: 'Delta Beverages',
    lastRestocked: new Date(Date.now() - 28 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-stoney',
    name: 'Stoney Ginger Beer (Cans)',
    category: 'beverages',
    currentStock: 30,
    unit: 'bottles',
    lowStockThreshold: 8,
    costPerUnit: 0.65,
    supplier: 'Delta Beverages',
    lastRestocked: new Date(Date.now() - 40 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-coke',
    name: 'Coca-Cola (Cans)',
    category: 'beverages',
    currentStock: 35,
    unit: 'bottles',
    lowStockThreshold: 8,
    costPerUnit: 0.65,
    supplier: 'Delta Beverages',
    lastRestocked: new Date(Date.now() - 40 * 3600 * 1000).toISOString()
  },
  {
    id: 'ing-water',
    name: 'Bottled Pure Mineral Water (500ml)',
    category: 'beverages',
    currentStock: 48,
    unit: 'bottles',
    lowStockThreshold: 12,
    costPerUnit: 0.40,
    supplier: 'Dairibord / Tanganda',
    lastRestocked: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
  }
];

export const INITIAL_ORDERS: Order[] = [
  // 6 Days Ago
  {
    id: 'ord-018',
    orderNumber: 18,
    serviceType: 'sit_in',
    customerName: 'Blessing T.',
    tableNumber: 'Table 2',
    cashierName: 'Farai Chitiyo',
    status: 'served',
    createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000 + 12 * 3600 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 6 * 24 * 3600 * 1000 + 12 * 3600 * 1000 + 60000).toISOString(),
    subtotal: 38.50,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 38.50,
    payments: [
      {
        id: 'pay-018',
        orderId: 'ord-018',
        amount: 38.50,
        total: 38.50,
        method: 'usd_cash',
        currency: 'USD',
        timestamp: new Date(Date.now() - 6 * 24 * 3600 * 1000 + 12 * 3600 * 1000 + 60000).toISOString()
      }
    ],
    items: [
      { uid: 'm-18-1', name: 'Sadza with Roadrunner Chicken & Covo neDovi', price: 6.00, quantity: 4 },
      { uid: 'd-18-1', name: 'Zambezi Lager (330ml Can)', price: 2.00, quantity: 4 },
      { uid: 'd-18-2', name: 'Mazoe Orange (500ml RTD)', price: 1.50, quantity: 3 },
      { uid: 'm-18-2', name: 'Fried Rape Greens Extra', price: 2.00, quantity: 1 }
    ]
  },
  {
    id: 'ord-019',
    orderNumber: 19,
    serviceType: 'takeaway',
    customerName: 'Tendai M.',
    cashierName: 'Farai Chitiyo',
    status: 'served',
    createdAt: new Date(Date.now() - 6 * 24 * 3600 * 1000 + 15 * 3600 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 6 * 24 * 3600 * 1000 + 15 * 3600 * 1000 + 120000).toISOString(),
    subtotal: 42.00,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 42.00,
    payments: [
      {
        id: 'pay-019',
        orderId: 'ord-019',
        amount: 42.00,
        total: 42.00,
        method: 'ecocash',
        currency: 'USD',
        ecocashRef: 'MP240911.1512.B102',
        timestamp: new Date(Date.now() - 6 * 24 * 3600 * 1000 + 15 * 3600 * 1000 + 120000).toISOString()
      }
    ],
    items: [
      { uid: 'm-19-1', name: 'Sadza with T-Bone Steak & Covo neDovi', price: 6.50, quantity: 4 },
      { uid: 'm-19-2', name: 'Rice with Beef Stew', price: 5.00, quantity: 2 },
      { uid: 'd-19-1', name: 'Castle Lite (330ml Can)', price: 2.00, quantity: 3 }
    ]
  },

  // 5 Days Ago
  {
    id: 'ord-022',
    orderNumber: 22,
    serviceType: 'sit_in',
    customerName: 'Simba K.',
    tableNumber: 'Table 5',
    cashierName: 'Farai Chitiyo',
    status: 'served',
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000 + 13 * 3600 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 5 * 24 * 3600 * 1000 + 13 * 3600 * 1000 + 60000).toISOString(),
    subtotal: 96.00,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 96.00,
    payments: [
      {
        id: 'pay-022',
        orderId: 'ord-022',
        amount: 96.00,
        total: 96.00,
        method: 'card',
        currency: 'USD',
        timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000 + 13 * 3600 * 1000 + 60000).toISOString()
      }
    ],
    items: [
      { uid: 'm-22-1', name: 'Sadza Rezviyo with Oxtail Stew & Covo', price: 8.00, quantity: 8 },
      { uid: 'd-22-1', name: 'Zambezi Lager (330ml Can)', price: 2.00, quantity: 12 },
      { uid: 'd-22-2', name: 'Chibuku Super (1.25L Scud)', price: 1.50, quantity: 4 },
      { uid: 'd-22-3', name: 'Mineral Water (500ml)', price: 1.00, quantity: 2 }
    ]
  },

  // 4 Days Ago
  {
    id: 'ord-025',
    orderNumber: 25,
    serviceType: 'sit_in',
    customerName: 'Nyasha Z.',
    tableNumber: 'Table 1',
    cashierName: 'Farai Chitiyo',
    status: 'served',
    createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000 + 12 * 3600 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 4 * 24 * 3600 * 1000 + 12 * 3600 * 1000 + 60000).toISOString(),
    subtotal: 112.50,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 112.50,
    payments: [
      {
        id: 'pay-025',
        orderId: 'ord-025',
        amount: 112.50,
        total: 112.50,
        method: 'usd_cash',
        currency: 'USD',
        timestamp: new Date(Date.now() - 4 * 24 * 3600 * 1000 + 12 * 3600 * 1000 + 60000).toISOString()
      }
    ],
    items: [
      { uid: 'm-25-1', name: 'Sadza with Maguru & Matumbu & Dovi', price: 4.50, quantity: 10 },
      { uid: 'm-25-2', name: 'Sadza with T-Bone Steak', price: 6.50, quantity: 6 },
      { uid: 'd-25-1', name: 'Mazoe Orange (500ml RTD)', price: 1.50, quantity: 10 },
      { uid: 'd-25-2', name: 'Zambezi Lager (330ml Can)', price: 2.00, quantity: 6 },
      { uid: 'd-25-3', name: 'Mineral Water', price: 1.00, quantity: 1.5 }
    ]
  },

  // 3 Days Ago (Friday Night Rush)
  {
    id: 'ord-029',
    orderNumber: 29,
    serviceType: 'sit_in',
    customerName: 'Gava Braai Party',
    tableNumber: 'Table 8',
    cashierName: 'Farai Chitiyo',
    status: 'served',
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 18 * 3600 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 18 * 3600 * 1000 + 60000).toISOString(),
    subtotal: 164.00,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 164.00,
    payments: [
      {
        id: 'pay-029',
        orderId: 'ord-029',
        amount: 164.00,
        total: 164.00,
        method: 'usd_cash',
        currency: 'USD',
        timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000 + 18 * 3600 * 1000 + 60000).toISOString()
      }
    ],
    items: [
      { uid: 'm-29-1', name: 'Sadza with T-Bone Steak & Chakalaka', price: 6.50, quantity: 12 },
      { uid: 'm-29-2', name: 'Sadza Rezviyo with Pork Chop & Covo', price: 5.50, quantity: 6 },
      { uid: 'd-29-1', name: 'Zambezi Lager (330ml Can)', price: 2.00, quantity: 20 },
      { uid: 'd-29-2', name: 'Castle Lite (330ml Can)', price: 2.00, quantity: 6 },
      { uid: 'd-29-3', name: 'Stoney Ginger Beer (330ml)', price: 1.00, quantity: 1 }
    ]
  },

  // 2 Days Ago (Saturday Family Feasts)
  {
    id: 'ord-032',
    orderNumber: 32,
    serviceType: 'sit_in',
    customerName: 'Munyaradzi D.',
    tableNumber: 'Table 3',
    cashierName: 'Farai Chitiyo',
    status: 'served',
    createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 14 * 3600 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 14 * 3600 * 1000 + 60000).toISOString(),
    subtotal: 148.00,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 148.00,
    payments: [
      {
        id: 'pay-032',
        orderId: 'ord-032',
        amount: 148.00,
        total: 148.00,
        method: 'ecocash',
        currency: 'USD',
        ecocashRef: 'MP240915.1420.C301',
        timestamp: new Date(Date.now() - 2 * 24 * 3600 * 1000 + 14 * 3600 * 1000 + 60000).toISOString()
      }
    ],
    items: [
      { uid: 'm-32-1', name: 'Sadza with Roadrunner Chicken in Dovi', price: 6.00, quantity: 10 },
      { uid: 'm-32-2', name: 'Sadza with Beef Stew & Rape', price: 5.00, quantity: 8 },
      { uid: 'd-32-1', name: 'Mazoe Orange (500ml RTD)', price: 1.50, quantity: 16 },
      { uid: 'd-32-2', name: 'Zambezi Lager (330ml Can)', price: 2.00, quantity: 12 }
    ]
  },

  // 1 Day Ago (Yesterday)
  {
    id: 'ord-035',
    orderNumber: 35,
    serviceType: 'takeaway',
    customerName: 'Ruvimbo C.',
    cashierName: 'Farai Chitiyo',
    status: 'served',
    createdAt: new Date(Date.now() - 1 * 24 * 3600 * 1000 + 13 * 3600 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 1 * 24 * 3600 * 1000 + 13 * 3600 * 1000 + 60000).toISOString(),
    subtotal: 84.50,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 84.50,
    payments: [
      {
        id: 'pay-035',
        orderId: 'ord-035',
        amount: 84.50,
        total: 84.50,
        method: 'usd_cash',
        currency: 'USD',
        timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000 + 13 * 3600 * 1000 + 60000).toISOString()
      }
    ],
    items: [
      { uid: 'm-35-1', name: 'Sadza with Oxtail Stew & Covo neDovi', price: 8.00, quantity: 6 },
      { uid: 'm-35-2', name: 'Rice with Beef Stew', price: 5.00, quantity: 4 },
      { uid: 'd-35-1', name: 'Mazoe Orange (Glass)', price: 1.00, quantity: 8 },
      { uid: 'd-35-2', name: 'Chibuku Super (1.25L Scud)', price: 1.50, quantity: 4 },
      { uid: 'd-35-3', name: 'Mineral Water (500ml)', price: 1.00, quantity: 2.5 }
    ]
  },

  // Today Orders
  {
    id: 'ord-038',
    orderNumber: 38,
    serviceType: 'sit_in',
    customerName: 'Tinashe M.',
    tableNumber: 'Table 4',
    cashierName: 'Farai Chitiyo',
    status: 'ready',
    createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 24 * 60 * 1000).toISOString(),
    readyAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    subtotal: 13.00,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 13.00,
    payments: [
      {
        id: 'pay-038',
        orderId: 'ord-038',
        amount: 13.00,
        total: 13.00,
        method: 'usd_cash',
        currency: 'USD',
        tenderedCash: 20.00,
        changeGiven: 7.00,
        timestamp: new Date(Date.now() - 24 * 60 * 1000).toISOString()
      }
    ],
    meals: [
      {
        uid: 'm-38-1',
        baseStapleId: 'staple-sadza',
        baseStapleName: 'Sadza (White Maize)',
        relishId: 'rel-tbone',
        relishName: 'T-Bone Steak',
        relishPrice: 6.50,
        vegetableId: 'veg-covo-dovi',
        vegetableName: 'Covo neDovi',
        notes: 'Sadza rakaoma (firm)',
        quantity: 1,
        totalPrice: 6.50
      },
      {
        uid: 'm-38-2',
        baseStapleId: 'staple-rezviyo',
        baseStapleName: 'Sadza Rezviyo (Brown Millet)',
        relishId: 'rel-maguru',
        relishName: 'Maguru & Matumbu',
        relishPrice: 4.50,
        vegetableId: 'veg-covo-dovi',
        vegetableName: 'Covo neDovi',
        quantity: 1,
        totalPrice: 4.50
      }
    ],
    drinks: [
      {
        uid: 'd-38-1',
        drinkId: 'drk-zambezi',
        name: 'Zambezi Lager (330ml Can)',
        price: 2.00,
        quantity: 1,
        totalPrice: 2.00
      }
    ],
    items: [
      {
        uid: 'm-38-1',
        name: 'Sadza with T-Bone Steak & Covo neDovi',
        price: 6.50,
        quantity: 1,
        specialInstructions: 'Sadza rakaoma (firm)'
      },
      {
        uid: 'm-38-2',
        name: 'Sadza Rezviyo with Maguru & Matumbu & Covo neDovi',
        price: 4.50,
        quantity: 1
      },
      {
        uid: 'd-38-1',
        name: 'Zambezi Lager (330ml Can)',
        price: 2.00,
        quantity: 1
      }
    ]
  },
  {
    id: 'ord-039',
    orderNumber: 39,
    serviceType: 'takeaway',
    customerName: 'Chipo R.',
    cashierName: 'Farai Chitiyo',
    status: 'in_prep',
    createdAt: new Date(Date.now() - 14 * 60 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 13 * 60 * 1000).toISOString(),
    subtotal: 12.00,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 12.00,
    payments: [
      {
        id: 'pay-039',
        orderId: 'ord-039',
        amount: 12.00,
        total: 12.00,
        method: 'ecocash',
        currency: 'USD',
        ecocashRef: 'MP240917.1042.A912',
        timestamp: new Date(Date.now() - 13 * 60 * 1000).toISOString()
      }
    ],
    meals: [
      {
        uid: 'm-39-1',
        baseStapleId: 'staple-rice',
        baseStapleName: 'Rice (White Long Grain)',
        relishId: 'rel-beef',
        relishName: 'Beef Stew',
        relishPrice: 5.00,
        vegetableId: 'veg-rape',
        vegetableName: 'Fried Rape Greens',
        notes: 'Pack muto in separate foil container',
        quantity: 2,
        totalPrice: 10.00
      }
    ],
    drinks: [
      {
        uid: 'd-39-1',
        drinkId: 'drk-mazoe-bottle',
        name: 'Mazoe Orange (500ml RTD)',
        price: 1.50,
        quantity: 1,
        totalPrice: 1.50
      },
      {
        uid: 'd-39-2',
        drinkId: 'drk-water',
        name: 'Mineral Water (500ml)',
        price: 1.00,
        quantity: 1,
        totalPrice: 1.00
      }
    ],
    items: [
      {
        uid: 'm-39-1',
        name: 'Rice with Beef Stew & Fried Rape',
        price: 5.00,
        quantity: 2,
        specialInstructions: 'Pack muto in separate foil container'
      },
      {
        uid: 'd-39-1',
        name: 'Mazoe Orange (500ml RTD)',
        price: 1.50,
        quantity: 1
      },
      {
        uid: 'd-39-2',
        name: 'Mineral Water (500ml)',
        price: 1.00,
        quantity: 1
      }
    ]
  },
  {
    id: 'ord-040',
    orderNumber: 40,
    serviceType: 'sit_in',
    customerName: 'Kudzi B.',
    tableNumber: 'Table 7',
    cashierName: 'Farai Chitiyo',
    status: 'in_prep',
    createdAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
    paidAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    subtotal: 7.50,
    taxRate: 0,
    taxAmount: 0,
    totalAmount: 7.50,
    payments: [
      {
        id: 'pay-040',
        orderId: 'ord-040',
        amount: 7.50,
        total: 7.50,
        method: 'zig_cash',
        currency: 'ZiG',
        zigAmount: 206.25,
        zigRateUsed: 27.50,
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString()
      }
    ],
    meals: [
      {
        uid: 'm-40-1',
        baseStapleId: 'staple-spaghetti',
        baseStapleName: 'Spaghetti (Savory)',
        relishId: 'rel-porkchop',
        relishName: 'Pork Chop',
        relishPrice: 5.50,
        vegetableId: 'veg-chakalaka',
        vegetableName: 'Spicy Chakalaka',
        quantity: 1,
        totalPrice: 5.50
      }
    ],
    drinks: [
      {
        uid: 'd-40-1',
        drinkId: 'drk-stoney',
        name: 'Stoney Ginger Beer (330ml)',
        price: 1.00,
        quantity: 2,
        totalPrice: 2.00
      }
    ],
    items: [
      {
        uid: 'm-40-1',
        name: 'Spaghetti with Pork Chop & Chakalaka',
        price: 5.50,
        quantity: 1
      },
      {
        uid: 'd-40-1',
        name: 'Stoney Ginger Beer (330ml)',
        price: 1.00,
        quantity: 2
      }
    ]
  }
];

export const DEFAULT_RESTAURANT_SETTINGS = DEFAULT_SETTINGS;
export const INITIAL_INVENTORY_INGREDIENTS = INITIAL_INGREDIENTS;
export const INITIAL_ZIMBABWEAN_ORDERS = INITIAL_ORDERS;
