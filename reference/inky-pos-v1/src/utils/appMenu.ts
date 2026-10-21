import {
    Activity,
    Bag,
    BarChart3,
    Briefcase,
    Building2,
    CircleDollarSign,
    Clipboard,
    CreditCard,
    FileText,
    Home,
    LayoutDashboard,
    ListChecks,
    Package,
    ServerCog,
    Settings,
    ShieldCheck,
    Store,
    User,
    Users,
    Zap,
} from "lucide-react-native";
import type { AppTabName, InkyRole, PortalType } from "./tenant";

export interface AppMenuItem {
  label: string;
  route: string;
  icon: typeof Home;
  portalTypes: PortalType[];
  roles?: InkyRole[];
  excludedRoles?: InkyRole[];
  requiredTab?: AppTabName;
}

export const appMenuItems: AppMenuItem[] = [
  {
    label: "Dashboard",
    route: "/",
    icon: LayoutDashboard,
    portalTypes: ["platform", "company"],
  },
  {
    label: "Companies",
    route: "/companies",
    icon: Building2,
    portalTypes: ["platform"],
    roles: ["super_admin", "support_admin"],
    requiredTab: "companies",
  },
  {
    label: "Stores",
    route: "/stores",
    icon: Store,
    portalTypes: ["platform", "company"],
    roles: [
      "super_admin",
      "support_admin",
      "company_owner",
      "general_manager",
      "store_manager",
    ],
    requiredTab: "stores",
  },
  {
    label: "Users",
    route: "/users",
    icon: Users,
    portalTypes: ["platform"],
    roles: ["super_admin"],
    requiredTab: "users",
  },
  {
    label: "Subscriptions",
    route: "/subscriptions",
    icon: CircleDollarSign,
    portalTypes: ["platform", "company"],
    roles: ["super_admin", "company_owner"],
    requiredTab: "subscriptions",
  },
  {
    label: "Devices",
    route: "/devices",
    icon: ServerCog,
    portalTypes: ["platform"],
    roles: ["super_admin", "support_admin", "technician"],
    requiredTab: "devices",
  },
  {
    label: "Support",
    route: "/support",
    icon: ShieldCheck,
    portalTypes: ["platform"],
    roles: ["super_admin", "support_admin", "technician"],
    requiredTab: "support",
  },
  {
    label: "Analytics",
    route: "/analytics",
    icon: BarChart3,
    portalTypes: ["platform"],
    roles: ["super_admin", "support_admin", "technician"],
    requiredTab: "analytics",
  },
  {
    label: "Installations",
    route: "/installations",
    icon: Zap,
    portalTypes: ["platform"],
    roles: ["super_admin", "technician"],
    requiredTab: "installations",
  },
  {
    label: "Point of Sale",
    route: "/pos",
    icon: CreditCard,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "store_manager",
      "cashier",
      "manager",
      "admin",
      "operator",
    ],
    requiredTab: "pos",
  },
  {
    label: "Sales",
    route: "/sales",
    icon: Bag,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "store_manager",
      "cashier",
      "accountant",
      "manager",
      "admin",
      "finance",
      "auditor",
    ],
    requiredTab: "sales",
  },
  {
    label: "Products",
    route: "/products",
    icon: Package,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "store_manager",
      "inventory_clerk",
      "manager",
      "admin",
    ],
    requiredTab: "products",
  },
  {
    label: "Inventory",
    route: "/inventory",
    icon: ListChecks,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "store_manager",
      "inventory_clerk",
      "manager",
      "admin",
      "auditor",
    ],
    requiredTab: "inventory",
  },
  {
    label: "Purchases",
    route: "/purchases",
    icon: Briefcase,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "inventory_clerk",
      "accountant",
      "manager",
      "admin",
      "finance",
    ],
    requiredTab: "purchases",
  },
  {
    label: "Customers",
    route: "/customers",
    icon: User,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "store_manager",
      "cashier",
      "admin",
      "manager",
    ],
    requiredTab: "customers",
  },
  {
    label: "Suppliers",
    route: "/suppliers",
    icon: Clipboard,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "inventory_clerk",
      "accountant",
      "admin",
      "manager",
      "finance",
    ],
    requiredTab: "suppliers",
  },
  {
    label: "Employees",
    route: "/employees",
    icon: Users,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "store_manager",
      "admin",
      "manager",
    ],
    requiredTab: "employees",
  },
  {
    label: "Accounting",
    route: "/accounting",
    icon: Activity,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "accountant",
      "auditor",
      "manager",
      "admin",
      "finance",
    ],
    requiredTab: "accounting",
  },
  {
    label: "Expenses",
    route: "/expenses",
    icon: CircleDollarSign,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "store_manager",
      "accountant",
      "manager",
      "admin",
      "finance",
    ],
    requiredTab: "expenses",
  },
  {
    label: "Reports",
    route: "/reports",
    icon: FileText,
    portalTypes: ["platform", "company"],
    roles: [
      "support_admin",
      "super_admin",
      "technician",
      "company_owner",
      "general_manager",
      "store_manager",
      "accountant",
      "auditor",
      "manager",
      "admin",
      "finance",
    ],
    requiredTab: "reports",
  },
  {
    label: "Settings",
    route: "/settings",
    icon: Settings,
    portalTypes: ["platform", "company"],
    roles: [
      "super_admin",
      "support_admin",
      "company_owner",
      "general_manager",
      "store_manager",
      "admin",
      "manager",
    ],
    excludedRoles: ["cashier", "inventory_clerk", "auditor"],
    requiredTab: "settings",
  },
  {
    label: "Profile",
    route: "/profile",
    icon: User,
    portalTypes: ["company"],
    roles: [
      "company_owner",
      "general_manager",
      "store_manager",
      "cashier",
      "inventory_clerk",
      "accountant",
      "auditor",
      "manager",
      "admin",
      "operator",
      "finance",
    ],
    requiredTab: "profile",
  },
];

export function canShowMenuItem(
  item: AppMenuItem,
  portalType: PortalType,
  role: string | undefined,
  allowedTabs: AppTabName[],
) {
  if (!item.portalTypes.includes(portalType)) {
    return false;
  }

  const normalizedRole = (role ?? "").toLowerCase() as InkyRole;

  if (item.roles && !item.roles.includes(normalizedRole)) {
    return false;
  }

  if (item.excludedRoles && item.excludedRoles.includes(normalizedRole)) {
    return false;
  }

  if (item.requiredTab && !allowedTabs.includes(item.requiredTab)) {
    return false;
  }

  return true;
}
