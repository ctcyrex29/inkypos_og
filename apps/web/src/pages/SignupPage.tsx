import type { BusinessType } from '@inkypos/core';
import { AlertCircle, CheckCircle2, Loader2, Store, Utensils, UtensilsCrossed } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/auth-layout';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeError, makeClient } from '@/lib/api';
import { cn } from '@/lib/utils';

const TYPES: { value: BusinessType; label: string; icon: typeof Store }[] = [
  { value: 'retail', label: 'Shop', icon: Store },
  { value: 'restaurant', label: 'Restaurant', icon: UtensilsCrossed },
  { value: 'both', label: 'Both', icon: Utensils },
];

/** A business registers itself; it can be used once Inkgenius Technologies activates it. */
export function SignupPage() {
  const client = useMemo(() => makeClient(), []);
  const [type, setType] = useState<BusinessType>('retail');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ business: string; pending: boolean } | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const value = (k: string) => String(f.get(k) ?? '').trim();
    if (!value('business_name') || !value('name') || !value('email') || !String(f.get('password') ?? '')) {
      setError('Fill in every field.');
      return;
    }
    if (String(f.get('password')).length < 10) {
      setError('Choose a password of at least 10 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const s = await client.signup({
        business_name: value('business_name'),
        name: value('name'),
        email: value('email'),
        password: String(f.get('password')),
        device_name: 'Web sign-up',
        business_type: type,
      });
      setDone({ business: value('business_name'), pending: s.memberships[0]?.tenant_status === 'pending' });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthLayout title="Thank you for registering" subtitle={done.business}>
        <Alert variant="success">
          <CheckCircle2 />
          <AlertTitle>{done.pending ? 'Waiting for activation' : 'Your business is ready'}</AlertTitle>
          <AlertDescription>
            {done.pending
              ? 'Inkgenius Technologies will check your details and activate your business. You can sign in once it is active.'
              : 'You can sign in now.'}
          </AlertDescription>
        </Alert>
        <Button asChild className="w-full">
          <Link to="/login">Go to sign-in</Link>
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Register your business"
      subtitle="You will be the first manager. Inkgenius Technologies activates new businesses."
      footer={
        <p>
          Already registered? <Link to="/login" className="font-medium text-primary hover:underline">Sign in</Link>
        </p>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="business_name">Business name</Label>
          <Input id="business_name" name="business_name" autoComplete="organization" placeholder="e.g. Mbare Hardware" />
        </div>
        <div className="space-y-2">
          <Label>Type of business</Label>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Type of business">
            {TYPES.map((t) => (
              <button
                type="button"
                role="radio"
                aria-checked={type === t.value}
                key={t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-lg border p-3 text-sm transition-colors',
                  type === t.value ? 'border-primary bg-accent text-accent-foreground' : 'hover:bg-muted',
                )}
              >
                <t.icon className="size-5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" name="name" autoComplete="name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" name="password" autoComplete="new-password" />
          <p className="text-xs text-muted-foreground">At least 10 characters.</p>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? 'Registering…' : 'Register business'}
        </Button>
      </form>
    </AuthLayout>
  );
}
