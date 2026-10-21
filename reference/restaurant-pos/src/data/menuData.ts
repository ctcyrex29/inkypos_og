import { MenuItem, Table, Order } from '../types';

export const INITIAL_MENU_ITEMS: MenuItem[] = [
  // Starters
  {
    id: 'str-1',
    name: 'Truffle Parmesan Fries',
    category: 'starters',
    price: 9.50,
    description: 'Hand-cut fries, white truffle oil, grated parmesan, fresh rosemary, garlic aioli',
    isVegetarian: true,
    prepTimeMinutes: 8,
    availableModifiers: [
      { id: 'm-aioli', name: 'Extra Aioli', price: 1.50 },
      { id: 'm-crispy', name: 'Extra Crispy', price: 0 }
    ]
  },
  {
    id: 'str-2',
    name: 'Crispy Calamari Fritti',
    category: 'starters',
    price: 15.00,
    description: 'Point Judith squid, cherry peppers, lemon zest, house marinara dip',
    prepTimeMinutes: 10,
    availableModifiers: [
      { id: 'm-spicy', name: 'Extra Spicy Peppers', price: 1.00 }
    ]
  },
  {
    id: 'str-3',
    name: 'Burrata & Heirloom Tomato',
    category: 'starters',
    price: 16.50,
    description: 'Creamy Puglia burrata, balsamic reduction, basil oil, toasted sourdough crisps',
    isVegetarian: true,
    prepTimeMinutes: 6
  },
  {
    id: 'str-4',
    name: 'Smoked Sticky Pork Ribs (4pc)',
    category: 'starters',
    price: 14.00,
    description: 'Slow-cooked St. Louis ribs, bourbon glaze, scallions, toasted sesame',
    prepTimeMinutes: 12
  },

  // Mains
  {
    id: 'main-1',
    name: 'Wagyu Smash Burger',
    category: 'mains',
    price: 18.50,
    description: 'Double 4oz American Wagyu patties, aged cheddar, caramelized onion, brioche bun',
    prepTimeMinutes: 12,
    availableModifiers: [
      { id: 'm-bacon', name: 'Add Applewood Bacon', price: 2.50 },
      { id: 'm-egg', name: 'Add Fried Egg', price: 2.00 },
      { id: 'm-glutenfree', name: 'Gluten-Free Bun', price: 2.00 }
    ]
  },
  {
    id: 'main-2',
    name: 'Pan-Seared Scottish Salmon',
    category: 'mains',
    price: 27.00,
    description: 'Crispy skin salmon, wild mushroom risotto, charred asparagus, lemon butter glaze',
    isGlutenFree: true,
    prepTimeMinutes: 16
  },
  {
    id: 'main-3',
    name: 'Prime Ribeye Steak 12oz',
    category: 'mains',
    price: 38.00,
    description: 'USDA Prime, roasted garlic herb butter, grilled broccolini, mashed Yukon golds',
    isGlutenFree: true,
    prepTimeMinutes: 18,
    availableModifiers: [
      { id: 'm-rare', name: 'Rare', price: 0 },
      { id: 'm-medrare', name: 'Medium Rare', price: 0 },
      { id: 'm-medium', name: 'Medium', price: 0 },
      { id: 'm-welldone', name: 'Well Done', price: 0 },
      { id: 'm-chimichurri', name: 'Add Chimichurri', price: 2.00 }
    ]
  },
  {
    id: 'main-4',
    name: 'Wild Mushroom Pappardelle',
    category: 'mains',
    price: 22.00,
    description: 'Handmade fresh pasta, cremini, chanterelles, white wine cream, shaved pecorino',
    isVegetarian: true,
    prepTimeMinutes: 14
  },

  // Pizzas
  {
    id: 'piz-1',
    name: 'Margherita D.O.P.',
    category: 'pizzas',
    price: 17.00,
    description: 'San Marzano tomatoes, fior di latte mozzarella, fresh basil, extra virgin olive oil',
    isVegetarian: true,
    prepTimeMinutes: 10,
    availableModifiers: [
      { id: 'm-buff', name: 'Upgrade Buffalo Mozzarella', price: 3.00 }
    ]
  },
  {
    id: 'piz-2',
    name: 'Spicy Diavola & Hot Honey',
    category: 'pizzas',
    price: 20.00,
    description: 'Calabrese soppressata, chili oil, organic hot honey drizzle, smoked provolone',
    prepTimeMinutes: 11
  },
  {
    id: 'piz-3',
    name: 'Tartufo & Wild Mushroom',
    category: 'pizzas',
    price: 21.50,
    description: 'Truffle ricotta base, roasted oyster mushrooms, thyme, taleggio cheese',
    isVegetarian: true,
    prepTimeMinutes: 12
  },

  // Drinks
  {
    id: 'drk-1',
    name: 'Signature Smoked Old Fashioned',
    category: 'drinks',
    price: 15.00,
    description: 'Small batch bourbon, demerara, angostura bitters, smoked cedar plank aroma',
    prepTimeMinutes: 3
  },
  {
    id: 'drk-2',
    name: 'Spicy Mezcalita',
    category: 'drinks',
    price: 14.50,
    description: 'Artisanal mezcal, fresh lime juice, jalapeño agave, black volcanic salt rim',
    prepTimeMinutes: 3
  },
  {
    id: 'drk-3',
    name: 'Draft Hazy IPA (Pint)',
    category: 'drinks',
    price: 8.00,
    description: 'Local craft brewery, 6.8% ABV, juicy tropical citrus notes',
    prepTimeMinutes: 1
  },
  {
    id: 'drk-4',
    name: 'Italian San Pellegrino (750ml)',
    category: 'drinks',
    price: 6.00,
    description: 'Sparkling mineral water served with fresh lemon or lime slice',
    prepTimeMinutes: 1
  },

  // Desserts
  {
    id: 'des-1',
    name: 'Classic Espresso Tiramisu',
    category: 'desserts',
    price: 10.00,
    description: 'Espresso-soaked savoiardi, mascarpone cream, Dutch cocoa powder',
    isVegetarian: true,
    prepTimeMinutes: 4
  },
  {
    id: 'des-2',
    name: 'Warm Lava Molten Chocolate Cake',
    category: 'desserts',
    price: 11.50,
    description: '70% Valrhona dark chocolate center, Madagascar vanilla bean gelato',
    isVegetarian: true,
    prepTimeMinutes: 8
  }
];

export const INITIAL_TABLES: Table[] = [
  { id: 'tbl-1', number: 1, name: 'Table 1', zone: 'Main Dining', capacity: 2, status: 'occupied' as any },
  { id: 'tbl-2', number: 2, name: 'Table 2', zone: 'Main Dining', capacity: 4, status: 'billing' },
  { id: 'tbl-3', number: 3, name: 'Table 3', zone: 'Main Dining', capacity: 4, status: 'available' },
  { id: 'tbl-4', number: 4, name: 'Table 4', zone: 'Main Dining', capacity: 6, status: 'seated' },
  { id: 'tbl-5', number: 5, name: 'Booth 5', zone: 'Main Dining', capacity: 6, status: 'available' },
  { id: 'pat-1', number: 11, name: 'Patio 11', zone: 'Patio', capacity: 4, status: 'available' },
  { id: 'pat-2', number: 12, name: 'Patio 12', zone: 'Patio', capacity: 4, status: 'served' },
  { id: 'bar-1', number: 21, name: 'Bar Seat 1', zone: 'Bar', capacity: 1, status: 'available' },
  { id: 'bar-2', number: 22, name: 'Bar Seat 2', zone: 'Bar', capacity: 1, status: 'available' },
  { id: 'bar-3', number: 23, name: 'Bar Table 23', zone: 'Bar', capacity: 4, status: 'available' }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-101',
    orderNumber: 101,
    tableId: 'tbl-2',
    tableName: 'Table 2',
    serverName: 'Marcus T.',
    guestCount: 3,
    status: 'ready',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    sentToKitchenAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    taxRate: 0.08875,
    payments: [],
    items: [
      {
        uid: 'item-101-1',
        menuItemId: 'str-1',
        name: 'Truffle Parmesan Fries',
        price: 9.50,
        quantity: 1,
        seatNumber: 1,
        modifiers: [{ id: 'm-aioli', name: 'Extra Aioli', price: 1.50 }],
        status: 'ready'
      },
      {
        uid: 'item-101-2',
        menuItemId: 'main-1',
        name: 'Wagyu Smash Burger',
        price: 18.50,
        quantity: 1,
        seatNumber: 1,
        modifiers: [{ id: 'm-bacon', name: 'Add Applewood Bacon', price: 2.50 }],
        status: 'ready'
      },
      {
        uid: 'item-101-3',
        menuItemId: 'piz-2',
        name: 'Spicy Diavola & Hot Honey',
        price: 20.00,
        quantity: 1,
        seatNumber: 2,
        status: 'ready'
      },
      {
        uid: 'item-101-4',
        menuItemId: 'main-2',
        name: 'Pan-Seared Scottish Salmon',
        price: 27.00,
        quantity: 1,
        seatNumber: 3,
        status: 'ready'
      },
      {
        uid: 'item-101-5',
        menuItemId: 'drk-1',
        name: 'Signature Smoked Old Fashioned',
        price: 15.00,
        quantity: 2,
        seatNumber: 2,
        status: 'ready'
      }
    ]
  },
  {
    id: 'ord-102',
    orderNumber: 102,
    tableId: 'tbl-4',
    tableName: 'Table 4',
    serverName: 'Sarah K.',
    guestCount: 4,
    status: 'in_prep',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    sentToKitchenAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    taxRate: 0.08875,
    payments: [],
    items: [
      {
        uid: 'item-102-1',
        menuItemId: 'str-2',
        name: 'Crispy Calamari Fritti',
        price: 15.00,
        quantity: 1,
        seatNumber: 1,
        status: 'kitchen'
      },
      {
        uid: 'item-102-2',
        menuItemId: 'piz-1',
        name: 'Margherita D.O.P.',
        price: 17.00,
        quantity: 2,
        seatNumber: 2,
        status: 'kitchen'
      },
      {
        uid: 'item-102-3',
        menuItemId: 'drk-3',
        name: 'Draft Hazy IPA (Pint)',
        price: 8.00,
        quantity: 3,
        seatNumber: 3,
        status: 'ready'
      }
    ]
  }
];
