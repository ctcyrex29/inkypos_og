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
      await signInPlatform(email, password);
      navigate('/inkgenius', { replace: true });
    } catch (err) {
      setError(describeError(err));
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
