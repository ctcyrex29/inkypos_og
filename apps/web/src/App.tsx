import { BarChart3, Boxes, Building2, Contact, Gauge, Layers, LayoutDashboard, MonitorSmartphone, Package, Settings, Tags, Truck, Users, Wallet } from 'lucide-react';
import { lazy, Suspense, type ComponentType, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/session';
import { AppShell, type NavItem } from '@/components/app-shell';
import { PageLoading } from '@/components/page-loading';

/** Each page is its own chunk, downloaded the first time it is opened. */
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));

const InkgeniusLoginPage = page(() => import('@/pages/InkgeniusLoginPage'), 'InkgeniusLoginPage');
const LoginPage = page(() => import('@/pages/LoginPage'), 'LoginPage');
const SignupPage = page(() => import('@/pages/SignupPage'), 'SignupPage');
const CategoriesPage = page(() => import('@/pages/business/CategoriesPage'), 'CategoriesPage');
const CustomersPage = page(() => import('@/pages/business/CustomersPage'), 'CustomersPage');
const DashboardPage = page(() => import('@/pages/business/DashboardPage'), 'DashboardPage');
const MoneyPage = page(() => import('@/pages/business/MoneyPage'), 'MoneyPage');
const ProductsPage = page(() => import('@/pages/business/ProductsPage'), 'ProductsPage');
const PurchasesPage = page(() => import('@/pages/business/PurchasesPage'), 'PurchasesPage');
const ReportsPage = page(() => import('@/pages/business/ReportsPage'), 'ReportsPage');
const SettingsPage = page(() => import('@/pages/business/SettingsPage'), 'SettingsPage');
const StaffPage = page(() => import('@/pages/business/StaffPage'), 'StaffPage');
const StockPage = page(() => import('@/pages/business/StockPage'), 'StockPage');
const TillsPage = page(() => import('@/pages/business/TillsPage'), 'TillsPage');
const BusinessDetailPage = page(() => import('@/pages/inkgenius/BusinessDetailPage'), 'BusinessDetailPage');
const BusinessesPage = page(() => import('@/pages/inkgenius/BusinessesPage'), 'BusinessesPage');
const OverviewPage = page(() => import('@/pages/inkgenius/OverviewPage'), 'OverviewPage');
const PlansPage = page(() => import('@/pages/inkgenius/PlansPage'), 'PlansPage');
const TeamPage = page(() => import('@/pages/inkgenius/TeamPage'), 'TeamPage');

const BUSINESS_NAV: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/reports', label: 'Reports', icon: BarChart3 },
  { to: '/app/products', label: 'Products', icon: Package },
  { to: '/app/categories', label: 'Categories', icon: Tags },
  { to: '/app/stock', label: 'Stock', icon: Boxes },
  { to: '/app/purchases', label: 'Goods received', icon: Truck },
  { to: '/app/customers', label: 'Customers', icon: Contact },
  { to: '/app/money', label: 'Money', icon: Wallet },
  { to: '/app/staff', label: 'Staff', icon: Users },
  { to: '/app/tills', label: 'Tills', icon: MonitorSmartphone },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

function BusinessArea() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  if (session?.kind !== 'business') return <Navigate to="/login" replace />;
  return (
    <AppShell
      area={session.businessName}
      nav={BUSINESS_NAV}
      userName={session.userName}
      userDetail={`Manager · ${session.businessName}`}
      onSignOut={() => {
        signOut();
        navigate('/login', { replace: true });
      }}
    />
  );
}

function PlatformArea() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  if (session?.kind !== 'platform') return <Navigate to="/inkgenius/login" replace />;
  const can = (p: string) => session.user.permissions.includes(p as never);
  const nav: NavItem[] = [
    { to: '/inkgenius', label: 'Overview', icon: Gauge, end: true },
    { to: '/inkgenius/businesses', label: 'Businesses', icon: Building2 },
    { to: '/inkgenius/plans', label: 'Plans', icon: Layers },
    ...(can('platform_users.manage') ? [{ to: '/inkgenius/team', label: 'Inkgenius team', icon: Users }] : []),
  ];
  return (
    <AppShell
      area="Inkgenius Technologies"
      nav={nav}
      userName={session.user.name}
      userDetail={`${session.user.role_label} · Inkgenius Technologies`}
      onSignOut={() => {
        signOut();
        navigate('/inkgenius/login', { replace: true });
      }}
    />
  );
}

/** Pages only an Inkgenius role with this permission may open. */
function RequirePermission({ permission, children }: { permission: string; children: ReactNode }) {
  const { session } = useAuth();
  if (session?.kind !== 'platform' || !session.user.permissions.includes(permission as never)) return <Navigate to="/inkgenius" replace />;
  return children;
}

function Home() {
  const { session } = useAuth();
  if (session?.kind === 'business') return <Navigate to="/app" replace />;
  if (session?.kind === 'platform') return <Navigate to="/inkgenius" replace />;
  return <Navigate to="/login" replace />;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoading fullScreen />}>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/inkgenius/login" element={<InkgeniusLoginPage />} />
      <Route path="/app" element={<BusinessArea />}>
        <Route index element={<DashboardPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="categories" element={<CategoriesPage />} />
        <Route path="stock" element={<StockPage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="money" element={<MoneyPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="tills" element={<TillsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="/inkgenius" element={<PlatformArea />}>
        <Route index element={<OverviewPage />} />
        <Route path="businesses" element={<BusinessesPage />} />
        <Route path="businesses/:tenantId" element={<BusinessDetailPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route
          path="team"
          element={
            <RequirePermission permission="platform_users.manage">
              <TeamPage />
            </RequirePermission>
          }
        />
      </Route>
      <Route path="*" element={<Home />} />
    </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
