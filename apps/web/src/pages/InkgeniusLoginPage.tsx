import { ApiError } from '@inkypos/core';
import { AlertCircle, Loader2, ShieldCheck } from 'lucide-react';
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

/** Sign-in for Inkgenius Technologies staff (Administrator, Support, Technician, Accounts Department). */
export function InkgeniusLoginPage() {
  const { signInPlatform } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After the password is accepted, accounts with authenticator codes are asked for one.
  const [needCode, setNeedCode] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const code = String(form.get('code') ?? '').replace(/\s+/g, '');
    if (!email || !password) {
      setError('Enter your email and password.');
      return;
    }
    if (needCode && !/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInPlatform(email, password, needCode ? code : undefined);
      navigate('/inkgenius', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'two_factor_required') {
        setNeedCode(true);
        setError(null);
      } else {
        setError(describeError(err));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Inkgenius staff sign-in"
      subtitle="For Inkgenius Technologies: Support, Administrators, Technicians and Accounts."
      footer={<Link to="/login" className="hover:underline">Business sign-in</Link>}
    >
      <div className="flex items-center gap-2 rounded-lg border bg-accent/60 px-3 py-2 text-sm text-accent-foreground">
        <ShieldCheck className="size-4" /> Staff accounts are created by an Inkgenius administrator.
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" autoComplete="username" placeholder="name@inkgenius.co.zw" autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" name="password" autoComplete="current-password" />
        </div>
        {needCode ? (
          <div className="space-y-2">
            <Label htmlFor="code">Code from your authenticator app</Label>
            <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" autoFocus />
            <p className="text-xs text-muted-foreground">Lost your phone? Ask an Inkgenius administrator to reset your authenticator.</p>
          </div>
        ) : null}
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
      </form>
    </AuthLayout>
  );
}
