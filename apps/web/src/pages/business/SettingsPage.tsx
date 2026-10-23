import type { BusinessType } from '@inkypos/core';
import { Loader2, Store, Utensils, UtensilsCrossed } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/session';
import { PageHeader } from '@/components/app-shell';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeError } from '@/lib/api';
import { useLoad } from '@/lib/use-load';
import { cn } from '@/lib/utils';

const TYPES: { value: BusinessType; label: string; detail: string; icon: typeof Store }[] = [
  { value: 'retail', label: 'Shop', detail: 'Tills ring up sales straight away.', icon: Store },
  { value: 'restaurant', label: 'Restaurant', detail: 'Tables, takeaway orders and a kitchen screen.', icon: UtensilsCrossed },
  { value: 'both', label: 'Shop and restaurant', detail: 'Restaurant orders plus quick shop sales.', icon: Utensils },
];

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Changes reach every till on its next sync." />
      <BusinessCard />
      <div className="grid gap-4 lg:grid-cols-2">
        <PaymentTypesCard />
        <RateCard />
      </div>
    </>
  );
}

function BusinessCard() {
  const { client } = useAuth();
  const business = useLoad(useCallback(() => client.getBusiness(), [client]));
  const [type, setType] = useState<BusinessType | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const current = type ?? business.data?.business_type ?? 'retail';

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const timezone = String(new FormData(e.currentTarget).get('timezone') ?? '').trim();
    setBusy(true);
    setMessage(null);
    try {
      business.setData(await client.updateBusiness({ business_type: current, timezone }));
      setMessage({ ok: true, text: 'Saved. Tills pick this up on their next sync.' });
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business</CardTitle>
        <CardDescription>{business.data?.name}</CardDescription>
      </CardHeader>
      <CardContent>
        {business.data ? (
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Type of business">
              {TYPES.map((t) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={current === t.value}
                  key={t.value}
                  onClick={() => setType(t.value)}
                  className={cn('rounded-lg border p-4 text-left transition-colors', current === t.value ? 'border-primary bg-accent' : 'hover:bg-muted')}
                >
                  <t.icon className="mb-2 size-5 text-primary" />
                  <div className="font-medium">{t.label}</div>
                  <div className="text-xs text-muted-foreground">{t.detail}</div>
                </button>
              ))}
            </div>
            <div className="max-w-xs space-y-2">
              <Label htmlFor="timezone">Time zone</Label>
              <Input id="timezone" name="timezone" defaultValue={business.data.timezone} placeholder="Africa/Harare" />
              <p className="text-xs text-muted-foreground">Reports count a day from midnight in this time zone.</p>
            </div>
            {message ? (
              <Alert variant={message.ok ? 'success' : 'destructive'}>
                <AlertDescription>{message.text}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </form>
        ) : (
          <p className="text-sm text-muted-foreground">{business.error ?? 'Loading…'}</p>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentTypesCard() {
  const { client } = useAuth();
  const methods = useLoad(useCallback(() => client.listPaymentMethods(), [client]));
  const [error, setError] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment types</CardTitle>
        <CardDescription>Switch off what you don't accept.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {methods.data?.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
            <div>
              <div className="font-medium">{m.name}</div>
              <div className="text-xs text-muted-foreground">
                {m.currencies.join(' / ')}
                {m.initial_status === 'pending_confirmation' ? ' · recorded as awaiting confirmation' : ''}
              </div>
            </div>
            <Button
              variant={m.active ? 'default' : 'outline'}
              size="sm"
              aria-label={`${m.name}: ${m.active ? 'on' : 'off'}`}
              onClick={async () => {
                setError(null);
                try {
                  const updated = await client.updatePaymentMethod(m.id, { active: !m.active });
                  methods.setData((methods.data ?? []).map((x) => (x.id === m.id ? updated : x)));
                } catch (err) {
                  setError(describeError(err));
                }
              }}
            >
              {m.active ? 'On' : 'Off'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RateCard() {
  const { client } = useAuth();
  const rates = useLoad(useCallback(() => client.listExchangeRates(), [client]));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const current = rates.data?.find((r) => r.quote_currency === 'ZWG');

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const perUsd = Number(String(new FormData(form).get('per_usd') ?? '').replace(',', '.'));
    if (!Number.isFinite(perUsd) || perUsd <= 0) {
      setMessage({ ok: false, text: 'Enter how many ZWG one USD buys, e.g. 27.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const created = await client.setExchangeRate('ZWG', (1 / perUsd).toFixed(8));
      rates.setData([created, ...(rates.data ?? [])]);
      setMessage({ ok: true, text: `Saved: 1 USD = ${perUsd} ZWG (version ${created.version}).` });
      form.reset();
    } catch (err) {
      setMessage({ ok: false, text: describeError(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>ZWG exchange rate</CardTitle>
        <CardDescription>
          {current ? (
            <>
              Now 1 USD = {(1 / Number(current.rate)).toFixed(2)} ZWG <Badge variant="outline">v{current.version}</Badge>
            </>
          ) : (
            'No rate set: tills cannot take ZWG yet.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="per_usd">ZWG per 1 USD</Label>
            <Input id="per_usd" name="per_usd" inputMode="decimal" placeholder="e.g. 27" />
          </div>
          {message ? (
            <Alert variant={message.ok ? 'success' : 'destructive'}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null} Set new rate
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
