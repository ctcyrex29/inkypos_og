import type { Session } from '@inkypos/core';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/session';
import { AuthLayout } from '@/components/auth-layout';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeError } from '@/lib/api';

/**
 * Business back-office sign-in for managers. Values are read from the form on
 * submit (not from React state), so browser autofill can never leave the
 * button looking dead; problems are always shown, never swallowed.
 */
export function LoginPage() {
  const { signInBusiness, chooseBusiness } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Session | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signInBusiness(email, password);
      if (result.kind === 'signed_in') navigate('/app', { replace: true });
      else if (result.kind === 'choose') setChoice(result.session);
      else setError(result.message);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (choice) {
    return (
      <AuthLayout title="Choose a business" subtitle="Your account manages more than one business.">
        <div className="space-y-2">
          {choice.memberships.map((m) => (
            <Button
              key={m.tenant_id}
              variant="outline"
              className="h-auto w-full justify-start py-3"
              onClick={() => {
                chooseBusiness(choice, m.tenant_id);
                navigate('/app', { replace: true });
              }}
            >
              {m.tenant_name}
            </Button>
          ))}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Sign in to your business"
      subtitle="Managers manage products, staff, tills and reports here."
      footer={
        <div className="space-y-2">
          <p>
            New to InkyPOS? <Link to="/signup" className="font-medium text-primary hover:underline">Register your business</Link>
          </p>
          <p>
            <Link to="/inkgenius/login" className="hover:underline">Inkgenius Technologies staff sign-in</Link>
          </p>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" placeholder="you@business.co.zw" autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" name="password" autoComplete="current-password" />
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
        <p className="text-xs text-muted-foreground">Cashiers don’t sign in here: they use their PIN on the till.</p>
      </form>
    </AuthLayout>
  );
}
