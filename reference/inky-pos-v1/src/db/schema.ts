// src/db/schema.ts

// SQL schema to initialize the local SQLite database
export const INIT_DATABASE_SQL = [
  // 1. Businesses
  `CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo_url TEXT,
    address TEXT,
    tax_number TEXT,
    vat_number TEXT,
    currency TEXT DEFAULT 'USD',
    tax_rate REAL DEFAULT 15.0,
    zig_exchange_rate REAL DEFAULT 25.0,
    subscription_status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 2. Users
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    pin_code TEXT NOT NULL,
    role TEXT CHECK(role IN ('super_admin', 'support_admin', 'billing_admin', 'technician', 'company_owner', 'general_manager', 'store_manager', 'cashier', 'inventory_clerk', 'accountant', 'auditor', 'admin', 'manager', 'operator', 'finance')) NOT NULL,
    full_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 3. Employees
  `CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    user_id TEXT REFERENCES users(id),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 4. Employee Shifts
  `CREATE TABLE IF NOT EXISTS employee_shifts (
    id TEXT PRIMARY KEY,
    employee_id TEXT REFERENCES employees(id),
    start_time TEXT NOT NULL,
    end_time TEXT,
    status TEXT DEFAULT 'open',
    cash_float_start REAL DEFAULT 0.0,
    cash_float_end REAL DEFAULT 0.0,
    actual_cash_collected REAL DEFAULT 0.0,
    notes TEXT,
    created_at TEXT NOT NULL
  );`,

  // 5. Categories
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    name TEXT NOT NULL,
    description TEXT,
    sync_status TEXT DEFAULT 'pending_insert',
    deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 6. Products
  `CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    category_id TEXT REFERENCES categories(id),
    name TEXT NOT NULL,
    sku TEXT,
    barcode TEXT,
    cost_price REAL NOT NULL,
    selling_price REAL NOT NULL,
    selling_price_zig REAL,
    stock_quantity REAL DEFAULT 0.0,
    min_stock_level REAL DEFAULT 5.0,
    image_url TEXT,
    is_variant INTEGER DEFAULT 0,
    parent_id TEXT,
    status TEXT DEFAULT 'active',
    sync_status TEXT DEFAULT 'pending_insert',
    deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 7. Stock Movements
  `CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY,
    product_id TEXT REFERENCES products(id),
    quantity REAL NOT NULL,
    type TEXT CHECK(type IN ('IN', 'OUT', 'ADJUSTMENT', 'DAMAGE', 'TRANSFER')) NOT NULL,
    reason TEXT,
    reference_id TEXT,
    user_id TEXT REFERENCES users(id),
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL
  );`,

  // 8. Suppliers
  `CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    name TEXT NOT NULL,
    contact_person TEXT,
    email TEXT,
    phone TEXT,
    address TEXT,
    balance REAL DEFAULT 0.0,
    sync_status TEXT DEFAULT 'pending_insert',
    deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 9. Customers
  `CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    credit_limit REAL DEFAULT 0.0,
    balance REAL DEFAULT 0.0,
    loyalty_points INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'pending_insert',
    deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 10. Sales
  `CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    customer_id TEXT REFERENCES customers(id),
    sales_number TEXT NOT NULL UNIQUE,
    status TEXT CHECK(status IN ('completed', 'held', 'cancelled', 'refunded')) NOT NULL,
    subtotal REAL NOT NULL,
    tax_amount REAL NOT NULL,
    discount_amount REAL DEFAULT 0.0,
    total_amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    user_id TEXT REFERENCES users(id),
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 11. Sale Items
  `CREATE TABLE IF NOT EXISTS sale_items (
    id TEXT PRIMARY KEY,
    sale_id TEXT REFERENCES sales(id),
    product_id TEXT REFERENCES products(id),
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    cost_price REAL NOT NULL,
    total_price REAL NOT NULL,
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL
  );`,

  // 12. Quotations
  `CREATE TABLE IF NOT EXISTS quotations (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    customer_id TEXT REFERENCES customers(id),
    quotation_number TEXT NOT NULL UNIQUE,
    status TEXT CHECK(status IN ('draft', 'sent', 'approved', 'rejected', 'expired')) DEFAULT 'draft',
    total_amount REAL NOT NULL,
    validity_date TEXT NOT NULL,
    sync_status TEXT DEFAULT 'pending_insert',
    deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 13. Quotation Items
  `CREATE TABLE IF NOT EXISTS quotation_items (
    id TEXT PRIMARY KEY,
    quotation_id TEXT REFERENCES quotations(id),
    product_id TEXT REFERENCES products(id),
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    discount REAL DEFAULT 0.0,
    total_price REAL NOT NULL,
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL
  );`,

  // 14. Invoices
  `CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    customer_id TEXT REFERENCES customers(id),
    invoice_number TEXT NOT NULL UNIQUE,
    status TEXT CHECK(status IN ('draft', 'pending', 'partially_paid', 'paid', 'overdue')) DEFAULT 'draft',
    total_amount REAL NOT NULL,
    amount_paid REAL DEFAULT 0.0,
    due_date TEXT NOT NULL,
    sync_status TEXT DEFAULT 'pending_insert',
    deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 15. Invoice Items
  `CREATE TABLE IF NOT EXISTS invoice_items (
    id TEXT PRIMARY KEY,
    invoice_id TEXT REFERENCES invoices(id),
    product_id TEXT REFERENCES products(id),
    quantity REAL NOT NULL,
    unit_price REAL NOT NULL,
    discount REAL DEFAULT 0.0,
    total_price REAL NOT NULL,
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL
  );`,

  // 16. Receipts
  `CREATE TABLE IF NOT EXISTS receipts (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    invoice_id TEXT REFERENCES invoices(id),
    sale_id TEXT REFERENCES sales(id),
    receipt_number TEXT NOT NULL UNIQUE,
    total_amount REAL NOT NULL,
    payment_method TEXT NOT NULL,
    details TEXT,
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL
  );`,

  // 17. Payments
  `CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    sale_id TEXT REFERENCES sales(id),
    invoice_id TEXT REFERENCES invoices(id),
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    exchange_rate REAL DEFAULT 1.0,
    payment_method TEXT CHECK(payment_method IN ('CASH', 'ECOCASH', 'CARD', 'ZIPIT', 'BANK_TRANSFER')) NOT NULL,
    type TEXT CHECK(type IN ('SALE', 'DEBT_REPAYMENT', 'SUPPLIER_PAYMENT')) NOT NULL,
    status TEXT DEFAULT 'completed',
    reference_number TEXT,
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL
  );`,

  // 18. Expenses
  `CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    exchange_rate REAL DEFAULT 1.0,
    category TEXT CHECK(category IN ('RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'FUEL', 'SALARIES', 'AIRTIME', 'MISCELLANEOUS')) NOT NULL,
    description TEXT,
    payment_method TEXT NOT NULL,
    user_id TEXT REFERENCES users(id),
    sync_status TEXT DEFAULT 'pending_insert',
    deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 19. Chart of Accounts
  `CREATE TABLE IF NOT EXISTS chart_of_accounts (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT CHECK(type IN ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')) NOT NULL,
    balance REAL DEFAULT 0.0,
    sync_status TEXT DEFAULT 'pending_insert',
    deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 20. Journal Entries
  `CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    description TEXT,
    reference TEXT,
    date TEXT NOT NULL,
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 21. Journal Items
  `CREATE TABLE IF NOT EXISTS journal_items (
    id TEXT PRIMARY KEY,
    journal_entry_id TEXT REFERENCES journal_entries(id),
    account_id TEXT REFERENCES chart_of_accounts(id),
    debit REAL DEFAULT 0.0,
    credit REAL DEFAULT 0.0,
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL
  );`,

  // 22. Audit Logs
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    user_id TEXT REFERENCES users(id),
    action TEXT NOT NULL,
    description TEXT,
    details TEXT,
    created_at TEXT NOT NULL
  );`,

  // 23. Settings
  `CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // 24. Inky Finder Listings (discovery channel)
  `CREATE TABLE IF NOT EXISTS inky_finder_listings (
    id TEXT PRIMARY KEY,
    business_id TEXT REFERENCES businesses(id),
    name TEXT NOT NULL,
    category TEXT CHECK(category IN ('retail', 'bar', 'restaurant', 'pharmacy', 'hardware', 'salon', 'grocery', 'other')) NOT NULL,
    latitude REAL,
    longitude REAL,
    address TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    opening_hours TEXT,
    logo_url TEXT,
    description TEXT,
    is_public INTEGER DEFAULT 0,
    rating REAL DEFAULT 0.0,
    ratings_count INTEGER DEFAULT 0,
    sync_status TEXT DEFAULT 'pending_insert',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,

  // Indexes for high-performance offline scans
  `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);`,
  `CREATE INDEX IF NOT EXISTS idx_products_business ON products(business_id);`,
  `CREATE INDEX IF NOT EXISTS idx_sales_business ON sales(business_id);`,
  `CREATE INDEX IF NOT EXISTS idx_customers_business ON customers(business_id);`,
  `CREATE INDEX IF NOT EXISTS idx_journal_items_entry ON journal_items(journal_entry_id);`,
  `CREATE INDEX IF NOT EXISTS idx_journal_items_account ON journal_items(account_id);`,
];

// Core System Interfaces
export interface Business {
  id: string;
  name: string;
  logo_url?: string;
  address?: string;
  tax_number?: string;
  vat_number?: string;
  currency: "USD" | "ZiG";
  tax_rate: number;
  zig_exchange_rate: number;
  subscription_status: "active" | "expired" | "trial";
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  business_id: string;
  email: string;
  password_hash: string;
  pin_code: string;
  role:
    | "super_admin"
    | "support_admin"
    | "billing_admin"
    | "technician"
    | "company_owner"
    | "general_manager"
    | "store_manager"
    | "cashier"
    | "inventory_clerk"
    | "accountant"
    | "auditor"
    | "admin"
    | "manager"
    | "operator"
    | "finance";
  full_name: string;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  business_id: string;
  category_id?: string;
  name: string;
  sku?: string;
  barcode?: string;
  cost_price: number;
  selling_price: number;
  selling_price_zig?: number;
  stock_quantity: number;
  min_stock_level: number;
  image_url?: string;
  is_variant: number; // 0 or 1
  parent_id?: string;
  status: "active" | "inactive";
  sync_status:
    | "synced"
    | "pending_insert"
    | "pending_update"
    | "pending_delete";
  deleted: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  business_id: string;
  name: string;
  description?: string;
  sync_status:
    | "synced"
    | "pending_insert"
    | "pending_update"
    | "pending_delete";
  deleted: number;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  credit_limit: number;
  balance: number;
  loyalty_points: number;
  sync_status:
    | "synced"
    | "pending_insert"
    | "pending_update"
    | "pending_delete";
  deleted: number;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  business_id: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  balance: number;
  sync_status:
    | "synced"
    | "pending_insert"
    | "pending_update"
    | "pending_delete";
  deleted: number;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  business_id: string;
  customer_id?: string;
  sales_number: string;
  status: "completed" | "held" | "cancelled" | "refunded";
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_method: string;
  user_id: string;
  sync_status:
    | "synced"
    | "pending_insert"
    | "pending_update"
    | "pending_delete";
  created_at: string;
  updated_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  total_price: number;
  sync_status:
    | "synced"
    | "pending_insert"
    | "pending_update"
    | "pending_delete";
  created_at: string;
}

export interface Expense {
  id: string;
  business_id: string;
  amount: number;
  currency: string;
  exchange_rate: number;
  category:
    | "RENT"
    | "ELECTRICITY"
    | "WATER"
    | "INTERNET"
    | "FUEL"
    | "SALARIES"
    | "AIRTIME"
    | "MISCELLANEOUS";
  description?: string;
  payment_method: string;
  user_id: string;
  sync_status:
    | "synced"
    | "pending_insert"
    | "pending_update"
    | "pending_delete";
  deleted: number;
  created_at: string;
  updated_at: string;
}

export interface ChartOfAccount {
  id: string;
  business_id: string;
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  balance: number;
  sync_status:
    | "synced"
    | "pending_insert"
    | "pending_update"
    | "pending_delete";
  deleted: number;
  created_at: string;
  updated_at: string;
}
