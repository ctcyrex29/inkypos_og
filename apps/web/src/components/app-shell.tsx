import { KeyRound, LogOut, Menu, X, type LucideIcon } from 'lucide-react';
import { Suspense, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { PageLoading } from '@/components/page-loading';
import { CommandPalette } from '@/components/command-palette';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Sidebar layout shared by the business back office and the Inkgenius portal. */
export function AppShell({
  area,
  nav,
  userName,
  userDetail,
  onSignOut,
  onChangePassword,
  banner,
}: {
  area: string;
  nav: NavItem[];
  userName: string;
  userDetail: string;
  onSignOut: () => void;
  onChangePassword?: () => void;
  banner?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const commands = nav.map((item) => ({
    id: item.to,
    label: item.label,
    action: () => navigate(item.to),
  }));

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 bg-sidebar p-3 text-sidebar-foreground">
      <div className="mb-4 flex items-center gap-3 px-2 py-2">
        <img src="/inkypos-logo.png" alt="" className="size-9 rounded-lg" />
        <div className="min-w-0">
          <div className="truncate font-bold leading-tight">InkyPOS</div>
          <div className="truncate text-xs text-sidebar-muted">{area}</div>
        </div>
      </div>
      {nav.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              isActive ? 'bg-primary text-primary-foreground' : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
            )
          }
        >
          <item.icon className="size-4" />
          {item.label}
        </NavLink>
      ))}
      <div className="mt-auto px-2 pt-4 text-xs text-sidebar-muted">InkyPOS · Inkgenius Technologies</div>
    </nav>
  );

  return (
    <>
      <CommandPalette commands={commands} />
      <div className="flex min-h-svh">
        <aside className="sticky top-0 hidden h-svh w-64 shrink-0 lg:block">{sidebar}</aside>
        {open ? (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
              {open ? <X /> : <Menu />}
            </Button>
            <div className="flex-1" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {userName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden text-sm sm:inline">{userName}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="font-medium">{userName}</div>
                  <div className="text-xs font-normal text-muted-foreground">{userDetail}</div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {onChangePassword ? (
                  <DropdownMenuItem onSelect={onChangePassword}>
                    <KeyRound /> Change password
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={onSignOut}>
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>
          {banner}
          <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 p-4 sm:p-6">
            {/* The sidebar stays put while a page's code downloads. */}
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </>
  );
}

/** Page title row with optional actions on the right. */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** A number with a label, for dashboards. */
export function StatCard({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        {label}
        {Icon ? <Icon className="size-4" /> : null}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
