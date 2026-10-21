export type PortalType = "platform" | "company";

export type AppTabName =
  | "index"
  | "pos"
  | "inventory"
  | "hub"
  | "accounting"
  | "reports"
  | "settings"
  | "menu"
  | "users"
  | "companies"
  | "stores"
  | "subscriptions"
  | "devices"
  | "support"
  | "analytics"
  | "sales"
  | "products"
  | "purchases"
  | "customers"
  | "suppliers"
  | "employees"
  | "expenses"
  | "profile"
  | "installations";

export type InkyRole =
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

export interface PortalContext {
  portalType: PortalType;
  title: string;
  subtitle: string;
  badge: string;
  sections: string[];
  permissions: string[];
  canManageCompanies: boolean;
  canManageStores: boolean;
  canAccessPos: boolean;
  allowedAppTabs: AppTabName[];
}

export function getPortalContext(
  role: string | null | undefined,
): PortalContext {
  const normalized = (role ?? "operator").toLowerCase();

  const commonCompanySections = [
    "Dashboard",
    "Point of Sale",
    "Sales",
    "Products",
    "Inventory",
    "Purchases",
    "Customers",
    "Suppliers",
    "Employees",
    "Stores",
    "Accounting",
    "Expenses",
    "Reports",
    "Settings",
    "Subscription",
    "Profile",
  ];

  const platformSections = [
    "Dashboard",
    "Companies",
    "Stores",
    "Users",
    "Subscriptions",
    "Devices",
    "Support",
    "Analytics",
    "Settings",
  ];

  if (normalized === "super_admin") {
    return {
      portalType: "platform",
      title: "InkyPOS Platform",
      subtitle:
        "Manage companies, stores, installations, subscriptions, and support for the entire platform.",
      badge: "InkyPOS Team",
      sections: platformSections,
      permissions: [
        "Manage all companies and stores",
        "Create and delete platform users",
        "Review billing and subscriptions",
        "Access device and support logs",
      ],
      canManageCompanies: true,
      canManageStores: true,
      canAccessPos: false,
      allowedAppTabs: [
        "index",
        "companies",
        "stores",
        "users",
        "subscriptions",
        "devices",
        "support",
        "analytics",
        "settings",
        "menu",
      ],
    };
  }

  if (normalized === "support_admin") {
    return {
      portalType: "platform",
      title: "InkyPOS Support",
      subtitle:
        "Provide fast support, monitor devices, and analyze platform health.",
      badge: "Support Admin",
      sections: [
        "Dashboard",
        "Companies",
        "Stores",
        "Support Tickets",
        "Remote Support",
        "Device Logs",
        "Knowledge Base",
        "Reports",
      ],
      permissions: [
        "Respond to support tickets",
        "Monitor remote sessions and devices",
        "Track platform health and reports",
      ],
      canManageCompanies: false,
      canManageStores: false,
      canAccessPos: false,
      allowedAppTabs: [
        "index",
        "companies",
        "stores",
        "support",
        "devices",
        "analytics",
        "reports",
        "menu",
      ],
    };
  }

  if (normalized === "technician") {
    return {
      portalType: "platform",
      title: "InkyPOS Installations",
      subtitle:
        "Manage hardware setups, company installations, and diagnostics.",
      badge: "Technician",
      sections: [
        "Dashboard",
        "Installations",
        "Devices",
        "Company Installations",
        "Store Setup",
        "Updates",
        "Error Logs",
      ],
      permissions: [
        "Manage installation workflows",
        "Track device activations",
        "Access error and diagnostic logs",
      ],
      canManageCompanies: false,
      canManageStores: false,
      canAccessPos: false,
      allowedAppTabs: [
        "index",
        "installations",
        "devices",
        "support",
        "analytics",
        "menu",
      ],
    };
  }

  const companyAccess = {
    canAccessPos: [
      "cashier",
      "manager",
      "operator",
      "admin",
      "company_owner",
      "general_manager",
      "store_manager",
    ].includes(normalized),
    canAccessInventory: [
      "company_owner",
      "general_manager",
      "store_manager",
      "inventory_clerk",
      "manager",
      "admin",
      "auditor",
    ].includes(normalized),
    canAccessReports: [
      "company_owner",
      "general_manager",
      "store_manager",
      "accountant",
      "auditor",
      "manager",
      "admin",
      "finance",
    ].includes(normalized),
    canAccessAccounting: [
      "company_owner",
      "general_manager",
      "accountant",
      "auditor",
      "manager",
      "admin",
      "finance",
    ].includes(normalized),
    canAccessPurchases: [
      "company_owner",
      "general_manager",
      "inventory_clerk",
      "accountant",
      "manager",
      "admin",
      "finance",
    ].includes(normalized),
    canAccessEmployees: [
      "company_owner",
      "general_manager",
      "store_manager",
      "admin",
      "manager",
    ].includes(normalized),
    canAccessCustomers: [
      "company_owner",
      "general_manager",
      "store_manager",
      "cashier",
      "admin",
      "manager",
    ].includes(normalized),
    canAccessSuppliers: [
      "company_owner",
      "general_manager",
      "inventory_clerk",
      "accountant",
      "admin",
      "manager",
      "finance",
    ].includes(normalized),
  };

  const companyAllowedTabs: AppTabName[] = [
    "index",
    companyAccess.canAccessPos ? "pos" : null,
    normalized !== "auditor" ? "sales" : "sales",
    companyAccess.canAccessInventory ? "inventory" : null,
    companyAccess.canAccessPurchases ? "purchases" : null,
    companyAccess.canAccessCustomers ? "customers" : null,
    companyAccess.canAccessSuppliers ? "suppliers" : null,
    companyAccess.canAccessEmployees ? "employees" : null,
    normalized === "company_owner" ? "stores" : null,
    companyAccess.canAccessAccounting ? "accounting" : null,
    companyAccess.canAccessAccounting ? "expenses" : null,
    companyAccess.canAccessReports ? "reports" : null,
    normalized === "company_owner" ? "subscriptions" : null,
    normalized !== "cashier" ? "products" : "products",
    normalized !== "cashier" ? "profile" : "profile",
    "menu",
  ].filter(Boolean) as AppTabName[];

  return {
    portalType: "company",
    title: "Company Portal",
    subtitle:
      "Every company only sees its own stores, employees, products, and sales data.",
    badge: "Company Workspace",
    sections: commonCompanySections,
    permissions: [
      "See only your company's data",
      "Manage assigned stores and staff",
      "Run POS, inventory, and reporting work",
      "Track subscriptions and company settings",
    ],
    canManageCompanies: false,
    canManageStores: [
      "company_owner",
      "general_manager",
      "store_manager",
    ].includes(normalized),
    canAccessPos: companyAccess.canAccessPos,
    allowedAppTabs: companyAllowedTabs,
  };
}
