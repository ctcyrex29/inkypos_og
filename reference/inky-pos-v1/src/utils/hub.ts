export interface HubCard {
  title: string;
  description: string;
  badge: string;
}

export interface HubMetric {
  label: string;
  value: string;
  accent: string;
}

export const hubOverviewMetrics: HubMetric[] = [
  { label: "Companies", value: "24", accent: "bg-blue-500/10" },
  { label: "Stores", value: "68", accent: "bg-emerald-500/10" },
  { label: "Active Licenses", value: "132", accent: "bg-amber-500/10" },
  { label: "Online Devices", value: "91%", accent: "bg-purple-500/10" },
];

export const platformHubCards: HubCard[] = [
  {
    title: "Companies",
    description:
      "View, create, suspend, and manage company subscriptions from one control center.",
    badge: "Company Ops",
  },
  {
    title: "Stores",
    description:
      "Track every store, move locations, and keep device rollouts visible at a glance.",
    badge: "Store Rollout",
  },
  {
    title: "Installations",
    description:
      "Monitor registered devices, activation status, offline equipment, and last sync windows.",
    badge: "Installations",
  },
  {
    title: "Billing",
    description:
      "Manage plans, payments, invoices, and renewals for every client company.",
    badge: "Revenue",
  },
  {
    title: "Support",
    description:
      "Route tickets, remote support, logs, and update requests from one operations queue.",
    badge: "Support",
  },
  {
    title: "Analytics",
    description:
      "Review system health, client usage, error reports, and platform-wide trends.",
    badge: "Insights",
  },
];

export const companyPortalCards: HubCard[] = [
  {
    title: "Dashboard",
    description:
      "Company-wide performance overview for the owner and managers.",
    badge: "Core",
  },
  {
    title: "Stores",
    description: "See all stores in the company and their assigned teams.",
    badge: "Hierarchy",
  },
  {
    title: "Employees",
    description: "Manage company roles, permissions, and store assignments.",
    badge: "People",
  },
  {
    title: "Products",
    description:
      "Centralized catalog management for every outlet within the company.",
    badge: "Catalog",
  },
  {
    title: "Inventory",
    description: "Track stock movement and low-stock alerts by store.",
    badge: "Stock",
  },
  {
    title: "Customers",
    description:
      "Maintain customer records and balance exposure per business unit.",
    badge: "CRM",
  },
  {
    title: "Suppliers",
    description:
      "Support purchasing and creditor visibility across the organization.",
    badge: "Purchasing",
  },
  {
    title: "Sales",
    description: "Consolidate POS activity, orders, and store performance.",
    badge: "Revenue",
  },
  {
    title: "Accounting",
    description: "Financial ledgers, expenses, cash books, and reporting.",
    badge: "Finance",
  },
  {
    title: "Settings",
    description:
      "Configure company rules, tax settings, and subscription preferences.",
    badge: "Control",
  },
];

export const storeHierarchyRows = [
  {
    title: "Head Office",
    subtitle: "Shared leadership, finance, and installation oversight",
  },
  {
    title: "Store 1",
    subtitle: "Manager, cashier team, inventory clerk, and supervisor",
  },
  {
    title: "Store 2",
    subtitle: "Dedicated store manager and frontline operations team",
  },
  {
    title: "Store 3",
    subtitle: "Additional rollout location ready for activation",
  },
];

export const permissionMatrix = [
  { role: "Super Admin", capability: "Everything" },
  { role: "Support Admin", capability: "Companies and support" },
  { role: "Technician", capability: "Devices and installations" },
  { role: "Company Owner", capability: "All stores in their company" },
  { role: "Store Manager", capability: "Only their assigned store" },
  { role: "Cashier", capability: "POS only" },
  { role: "Inventory Clerk", capability: "Inventory only" },
  { role: "Accountant", capability: "Financial modules" },
  { role: "Auditor", capability: "Read-only reports" },
];

export const dataPrincipleItems = [
  "Every business record should carry both a CompanyId and, where applicable, a StoreId.",
  "Company-level data remains isolated so one client cannot see another company’s records.",
  "Store-level operations stay scoped to the correct store or branch team.",
];
