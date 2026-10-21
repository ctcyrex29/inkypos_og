// src/db/sqlite.ts
import * as SQLite from "expo-sqlite";
import { Platform } from "react-native";
import { createPinHash } from "../utils/security";
import { INIT_DATABASE_SQL } from "./schema";

// Standard UUID v4 Generator for offline-first primary keys
export function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const isWeb = Platform.OS === "web";

function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function interpolateSql(sql: string, params: any[]): string {
  let index = 0;
  return sql.replace(/\?/g, () => {
    if (index >= params.length) {
      return "?";
    }
    return escapeSqlValue(params[index++]);
  });
}

let dbInstance: SQLite.SQLiteDatabase | null = null;

// Opens the SQLite database asynchronously
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await SQLite.openDatabaseAsync("inkypos.db");
  return dbInstance;
}

// Runs the initialization scripts
export async function initDatabase(): Promise<void> {
  try {
    const db = await getDatabase();

    // Execute initialization queries sequentially
    for (const sql of INIT_DATABASE_SQL) {
      await db.execAsync(sql);
    }

    await migrateLegacyUserRoleConstraint(db);

    console.log("SQLite Database Initialized Successfully.");
    await seedDemoData();
  } catch (error) {
    console.error("Failed to initialize local SQLite database:", error);
  }
}

async function migrateLegacyUserRoleConstraint(
  db: SQLite.SQLiteDatabase,
): Promise<void> {
  const usersTable = await db.getAllAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='users';",
  );
  const createSql = usersTable[0]?.sql ?? "";
  const expectedRoles = [
    "super_admin",
    "support_admin",
    "billing_admin",
    "technician",
    "company_owner",
    "general_manager",
    "store_manager",
    "cashier",
    "inventory_clerk",
    "accountant",
    "auditor",
    "admin",
    "manager",
    "operator",
    "finance",
  ];

  const match = createSql.match(/CHECK\s*\(\s*role\s+IN\s*\(([^)]*)\)/i);
  const existingRoles = match
    ? match[1].split(",").map((value) => value.trim().replace(/'/g, ""))
    : [];
  const needsMigration = expectedRoles.some(
    (role) => !existingRoles.includes(role),
  );

  if (!needsMigration) {
    return;
  }

  const usersTableSql = INIT_DATABASE_SQL.find((sql) =>
    sql.includes("CREATE TABLE IF NOT EXISTS users"),
  );
  if (!usersTableSql) {
    console.warn("Unable to locate users table schema for migration.");
    return;
  }

  console.log("Migrating legacy users role constraint to the latest schema...");
  await db.execAsync("PRAGMA foreign_keys = OFF;");
  await db.execAsync("BEGIN TRANSACTION;");
  await db.execAsync("ALTER TABLE users RENAME TO users_old;");
  await db.execAsync(usersTableSql);
  await db.execAsync(
    `INSERT INTO users (id, business_id, email, password_hash, pin_code, role, full_name, created_at, updated_at)
     SELECT id, business_id, email, password_hash, pin_code, role, full_name, created_at, updated_at FROM users_old;`,
  );
  await db.execAsync("DROP TABLE users_old;");
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync("COMMIT;");
}

// Seeds default demo data if the users table is empty
export async function seedDemoData(): Promise<void> {
  try {
    const db = await getDatabase();

    const run = async (sql: string, params: any[] = []) => {
      try {
        if (isWeb) {
          await db.execAsync(interpolateSql(sql, params));
        } else {
          await db.runAsync(sql, params);
        }
      } catch (err) {
        console.error("Seed statement failed:", { sql, params, error: err });
        throw err;
      }
    };

    const getAll = async <T>(sql: string, params: any[] = []) => {
      if (isWeb) {
        return await db.getAllAsync<T>(interpolateSql(sql, params));
      }
      return await db.getAllAsync<T>(sql, params);
    };

    const existingUsers = await getAll<{ id: string }>(
      "SELECT id FROM users LIMIT 1;",
    );
    if (existingUsers.length > 0) {
      const existingBusiness = await db.getAllAsync<{ id: string }>(
        "SELECT id FROM businesses ORDER BY created_at LIMIT 1;",
      );
      if (existingBusiness.length > 0) {
        const demoUsers = [
          {
            email: "platform@inkypos.co.zw",
            pin: "0000",
            role: "super_admin",
            name: "Tinashe Platform",
          },
          {
            email: "owner@inkypos.co.zw",
            pin: "1111",
            role: "company_owner",
            name: "Chipo Owner",
          },
        ];

        for (const user of demoUsers) {
          const existingUser = await db.getAllAsync<{ id: string }>(
            "SELECT id FROM users WHERE email = ? LIMIT 1;",
            [user.email],
          );
          if (existingUser.length === 0) {
            const pinHash = await createPinHash(user.pin);
            const id = generateUUID();
            await run(
              `INSERT INTO users (id, business_id, email, password_hash, pin_code, role, full_name, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                id,
                existingBusiness[0].id,
                user.email,
                "hashed_password_placeholder",
                pinHash,
                user.role,
                user.name,
                new Date().toISOString(),
                new Date().toISOString(),
              ],
            );
            await run(
              `INSERT INTO employees (id, business_id, user_id, first_name, last_name, status, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                generateUUID(),
                existingBusiness[0].id,
                id,
                user.name.split(" ")[0],
                user.name.split(" ")[1] || "",
                "active",
                new Date().toISOString(),
                new Date().toISOString(),
              ],
            );
          }
        }
      }
      console.log(
        "Database already has seeded data. Ensured demo portal accounts are present.",
      );
      return;
    }

    console.log("Seeding demo data for Zimbabwe InkyPOS...");
    const now = new Date().toISOString();

    // 1. Business Seed
    const businessId = generateUUID();
    await run(
      `INSERT INTO businesses (id, name, logo_url, address, tax_number, vat_number, currency, tax_rate, zig_exchange_rate, subscription_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        businessId,
        "Harare Mega Mart",
        "https://via.placeholder.com/150",
        "101 Leopold Takawira St, Harare, Zimbabwe",
        "BP70012345",
        "VAT80098765",
        "USD",
        15.0,
        25.5, // 1 USD = 25.5 ZiG
        "active",
        now,
        now,
      ],
    );

    // 2. Users Seed (Platform Admin, Company Owner, Manager, Operator, Finance)
    const users = [
      {
        id: generateUUID(),
        email: "platform@inkypos.co.zw",
        pin: "0000",
        role: "super_admin",
        name: "Tinashe Platform",
      },
      {
        id: generateUUID(),
        email: "owner@inkypos.co.zw",
        pin: "1111",
        role: "company_owner",
        name: "Chipo Owner",
      },
      {
        id: generateUUID(),
        email: "manager@inkypos.co.zw",
        pin: "2222",
        role: "manager",
        name: "Chipo Manager",
      },
      {
        id: generateUUID(),
        email: "cashier@inkypos.co.zw",
        pin: "3333",
        role: "operator",
        name: "Rufaro Cashier",
      },
      {
        id: generateUUID(),
        email: "finance@inkypos.co.zw",
        pin: "4444",
        role: "finance",
        name: "Farai Finance",
      },
    ];

    for (const u of users) {
      const pinHash = await createPinHash(u.pin);
      await run(
        `INSERT INTO users (id, business_id, email, password_hash, pin_code, role, full_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          u.id,
          businessId,
          u.email,
          "hashed_password_placeholder",
          pinHash,
          u.role,
          u.name,
          now,
          now,
        ],
      );

      // Create matching employee records
      const employeeId = generateUUID();
      await run(
        `INSERT INTO employees (id, business_id, user_id, first_name, last_name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          employeeId,
          businessId,
          u.id,
          u.name.split(" ")[0],
          u.name.split(" ")[1] || "",
          "active",
          now,
          now,
        ],
      );
    }

    // 3. Categories Seed
    const catRetailId = generateUUID();
    const catGroceriesId = generateUUID();

    await run(
      `INSERT INTO categories (id, business_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);`,
      [
        catRetailId,
        businessId,
        "Retail Goods",
        "Standard retail items and apparel",
        now,
        now,
      ],
    );
    await run(
      `INSERT INTO categories (id, business_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?);`,
      [
        catGroceriesId,
        businessId,
        "Groceries",
        "Foodstuffs and beverage stocks",
        now,
        now,
      ],
    );

    // 4. Products Seed
    const products = [
      {
        id: generateUUID(),
        cat: catGroceriesId,
        name: "Mazoe Orange Crush 2L",
        sku: "MAZ-2L",
        bar: "6001234567890",
        cost: 2.8,
        sell: 3.5,
        qty: 50,
      },
      {
        id: generateUUID(),
        cat: catGroceriesId,
        name: "Red Seal Roller Meal 10kg",
        sku: "RSR-10K",
        bar: "6001234567891",
        cost: 5.2,
        sell: 6.8,
        qty: 30,
      },
      {
        id: generateUUID(),
        cat: catGroceriesId,
        name: "Gloria Self Raising Flour 2kg",
        sku: "GLO-2K",
        bar: "6001234567892",
        cost: 1.8,
        sell: 2.3,
        qty: 45,
      },
      {
        id: generateUUID(),
        cat: catRetailId,
        name: "Colgate Toothpaste 100ml",
        sku: "COL-100",
        bar: "6001234567893",
        cost: 1.1,
        sell: 1.6,
        qty: 8,
      }, // low stock
      {
        id: generateUUID(),
        cat: catRetailId,
        name: "Geisha Soap Green 250g",
        sku: "GEI-250",
        bar: "6001234567894",
        cost: 0.7,
        sell: 1.1,
        qty: 4,
      }, // low stock
      {
        id: generateUUID(),
        cat: catGroceriesId,
        name: "Chibuku Super 1.25L",
        sku: "CHI-SUP",
        bar: "6001234567895",
        cost: 1.2,
        sell: 1.7,
        qty: 120,
      },
    ];

    for (const p of products) {
      await run(
        `INSERT INTO products (id, business_id, category_id, name, sku, barcode, cost_price, selling_price, selling_price_zig, stock_quantity, min_stock_level, sync_status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          p.id,
          businessId,
          p.cat,
          p.name,
          p.sku,
          p.bar,
          p.cost,
          p.sell,
          p.sell * 25.5,
          p.qty,
          5.0,
          "synced",
          now,
          now,
        ],
      );

      // Record initial stock movement
      await run(
        `INSERT INTO stock_movements (id, product_id, quantity, type, reason, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          generateUUID(),
          p.id,
          p.qty,
          "IN",
          "Initial Seed Stock",
          users[0].id,
          now,
        ],
      );
    }

    // 5. Customers Seed
    await run(
      `INSERT INTO customers (id, business_id, name, phone, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [generateUUID(), businessId, "John Moyo", "+263771234567", 0.0, now, now],
    );
    await run(
      `INSERT INTO customers (id, business_id, name, phone, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        generateUUID(),
        businessId,
        "Sally Mutasa (Credit)",
        "+263782998877",
        45.5,
        now,
        now,
      ], // debtor
    );

    // 6. Suppliers Seed
    await run(
      `INSERT INTO suppliers (id, business_id, name, phone, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        generateUUID(),
        businessId,
        "Delta Beverages",
        "+263242700000",
        120.0,
        now,
        now,
      ], // creditor
    );
    await run(
      `INSERT INTO suppliers (id, business_id, name, phone, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        generateUUID(),
        businessId,
        "National Foods",
        "+263242750000",
        0.0,
        now,
        now,
      ],
    );

    // 7. Chart of Accounts Seed (Zimbabwe default bookkeeping)
    const accounts = [
      { code: "1000", name: "Cash Drawer USD", type: "ASSET" },
      { code: "1010", name: "Cash Drawer ZiG", type: "ASSET" },
      { code: "1020", name: "EcoCash Trust Account", type: "ASSET" },
      { code: "1030", name: "ZIPIT/Swipe Bank Account", type: "ASSET" },
      { code: "1100", name: "Accounts Receivable (Debtors)", type: "ASSET" },
      { code: "1200", name: "Stock Inventory Asset", type: "ASSET" },
      { code: "2000", name: "Accounts Payable (Creditors)", type: "LIABILITY" },
      { code: "2100", name: "ZIMRA VAT Liability", type: "LIABILITY" },
      { code: "3000", name: "Business Owner Equity", type: "EQUITY" },
      { code: "4000", name: "Sales Revenue", type: "REVENUE" },
      { code: "5000", name: "Cost of Goods Sold (COGS)", type: "EXPENSE" },
      { code: "5100", name: "Rent Expense", type: "EXPENSE" },
      { code: "5200", name: "Electricity & Utilities", type: "EXPENSE" },
      { code: "5300", name: "Salaries Expense", type: "EXPENSE" },
      { code: "5400", name: "ZIMRA 2% IMT Tax Expense", type: "EXPENSE" },
    ];

    for (const acc of accounts) {
      await run(
        `INSERT INTO chart_of_accounts (id, business_id, code, name, type, balance, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          generateUUID(),
          businessId,
          acc.code,
          acc.name,
          acc.type,
          0.0,
          now,
          now,
        ],
      );
    }

    console.log("Demo data seeded successfully.");
  } catch (error) {
    console.error("Failed to seed demo data:", error);
  }
}
