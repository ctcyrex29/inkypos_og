import { ShieldCheck, Store, UtensilsCrossed, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';

/** Two-panel layout for sign-in and sign-up: the brand on the left, the form on the right. */
export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,oklch(0.511_0.262_276.966/0.45),transparent_55%)]" />
        <div className="relative flex items-center gap-4">
          <img src="/inkypos-logo.png" alt="InkyPOS" className="size-14 rounded-lg shadow-lg" />
          <div>
            <div className="text-xl font-bold tracking-tight">InkyPOS</div>
            <div className="text-xs text-sidebar-muted">by Inkgenius Technologies</div>
          </div>
        </div>
        <div className="relative space-y-6">
          <h2 className="max-w-md text-3xl font-semibold leading-tight">Sell anywhere. Even when the internet does not.</h2>
          <ul className="space-y-3 text-sm text-sidebar-muted">
            <li className="flex items-center gap-3"><WifiOff className="size-4 text-primary" /> Tills keep selling offline and sync when the connection is back</li>
            <li className="flex items-center gap-3"><Store className="size-4 text-primary" /> Shops: barcodes, stock, customers and suppliers</li>
            <li className="flex items-center gap-3"><UtensilsCrossed className="size-4 text-primary" /> Restaurants: tables, kitchen tickets and split bills</li>
            <li className="flex items-center gap-3"><ShieldCheck className="size-4 text-primary" /> Every business kept strictly separate and secure</li>
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-muted">© {new Date().getFullYear()} Inkgenius Technologies</p>
      </aside>
      <main className="relative flex items-center justify-center p-6 sm:p-10">
        <div className="absolute right-6 top-6 sm:right-10 sm:top-10">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-3 lg:hidden">
            <img src="/inkypos-logo.png" alt="InkyPOS" className="size-11 rounded-lg shadow-md" />
            <div>
              <div className="font-bold">InkyPOS</div>
              <div className="text-xs text-muted-foreground">by Inkgenius Technologies</div>
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {children}
          {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
