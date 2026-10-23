import { BarChart3, Building2, Gauge, Layers, LayoutDashboard, MonitorSmartphone, Package, Settings, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/auth/session';
import { AppShell, type NavItem } from '@/components/app-shell';
import { InkgeniusLoginPage } from '@/pages/InkgeniusLoginPage';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { DashboardPage } from '@/pages/business/DashboardPage';
import { ProductsPage } from '@/pages/business/ProductsPage';
import { ReportsPage } from '@/pages/business/ReportsPage';
import { SettingsPage } from '@/pages/business/SettingsPage';
import { StaffPage } from '@/pages/business/StaffPage';
import { TillsPage } from '@/pages/business/TillsPage';
import { BusinessDetailPage } from '@/pages/inkgenius/BusinessDetailPage';
import { BusinessesPage } from '@/pages/inkgenius/BusinessesPage';
import { OverviewPage } from '@/pages/inkgenius/OverviewPage';
import { PlansPage } from '@/pages/inkgenius/PlansPage';
import { TeamPage } from '@/pages/inkgenius/TeamPage';

const BUSINESS_NAV: NavItem[] = [
  { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/app/reports', label: 'Reports', icon: BarChart3 },
  { to: '/app/products', label: 'Products', icon: Package },
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
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/inkgenius/login" element={<InkgeniusLoginPage />} />
      <Route path="/app" element={<BusinessArea />}>
        <Route index element={<DashboardPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="products" element={<ProductsPage />} />
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
