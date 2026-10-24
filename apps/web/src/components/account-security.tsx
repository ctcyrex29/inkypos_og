import type { TwoFactorSetup } from '@inkypos/core';
import { AlertCircle, Copy, Loader2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/session';
import { FormDialog } from '@/components/form-dialog';
import { PasswordInput } from '@/components/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { describeError } from '@/lib/api';

/** Business passwords need 10 characters; Inkgenius staff, who can reach every business, need 12. */
export const minPasswordLength = (kind: 'business' | 'platform') => (kind === 'platform' ? 12 : 10);

/** The checks the server makes too, said in words a person can act on. */
function newPasswordProblem(current: string, next: string, again: string, min: number): string | null {
  if (!current) return 'Enter your current password.';
  if (next.length < min) return `Choose a new password of at least ${min} characters.`;
  if (next === current) return 'The new password must be different from the current one.';
  if (next !== again) return 'The two new passwords do not match.';
  return null;
}

function PasswordFields({ min, currentLabel }: { min: number; currentLabel: string }) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="current_password">{currentLabel}</Label>
        <PasswordInput id="current_password" name="current_password" autoComplete="current-password" autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new_password">New password</Label>
        <PasswordInput id="new_password" name="new_password" autoComplete="new-password" aria-describedby="new_password_hint" />
        <p id="new_password_hint" className="text-xs text-muted-foreground">
          At least {min} characters. A short sentence is easy to remember and hard to guess.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="new_password_again">New password again</Label>
        <PasswordInput id="new_password_again" name="new_password_again" autoComplete="new-password" />
      </div>
    </>
  );
}

const read = (f: FormData) => [String(f.get('current_password') ?? ''), String(f.get('new_password') ?? ''), String(f.get('new_password_again') ?? '')] as const;

/** Full-page step: replace a temporary password before anything else opens. */
export function ChangePasswordForm({ kind, onDone }: { kind: 'business' | 'platform'; onDone?: () => void }) {
  const { changePassword } = useAuth();
  const min = minPasswordLength(kind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const [current, next, again] = read(new FormData(e.currentTarget));
    const problem = newPasswordProblem(current, next, again, min);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      onDone?.();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <PasswordFields min={min} currentLabel="Temporary password" />
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : null}
        {busy ? 'Saving…' : 'Save my new password'}
      </Button>
    </form>
  );
}

/** From the account menu: any time, with the current password. */
export function ChangePasswordDialog({ kind, onClose }: { kind: 'business' | 'platform'; onClose: () => void }) {
  const { changePassword } = useAuth();
  const min = minPasswordLength(kind);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <FormDialog title="Password changed" submitLabel="Done" onClose={onClose} onSubmit={async () => onClose()}>
        <p className="text-sm text-muted-foreground">Your new password is saved. You were signed out everywhere else; this browser stays signed in.</p>
      </FormDialog>
    );
  }
  return (
    <FormDialog
      title="Change your password"
      description="Every other place you are signed in will be signed out."
      submitLabel="Change password"
      onClose={onClose}
      onSubmit={async (f) => {
        const [current, next, again] = read(f);
        const problem = newPasswordProblem(current, next, again, min);
        if (problem) throw new Error(problem);
        await changePassword(current, next);
        setDone(true);
      }}
    >
      <PasswordFields min={min} currentLabel="Current password" />
    </FormDialog>
  );
}

/**
 * Turning on authenticator codes for Inkgenius staff: scan the QR code (or type
 * the key) into Google Authenticator, Microsoft Authenticator or Authy, then
 * enter the code it shows.
 */
export function TwoFactorSetupForm() {
  const { client, setPlatformUser } = useAuth();
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    client.platform
      .setupTwoFactor()
      .then(async (s) => {
        if (!live) return;
        setSetup(s);
        // The QR code library is only downloaded for this screen. Without a QR code the key below still works.
        try {
          const { toDataURL } = await import('qrcode');
          const url = await toDataURL(s.otpauth_url, { margin: 1, width: 200 });
          if (live) setQr(url);
        } catch {
          if (live) setQr('');
        }
      })
      .catch((err) => live && setError(describeError(err)));
    return () => {
      live = false;
    };
  }, [client]);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') ?? '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the 6-digit code your authenticator app shows.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setPlatformUser(await client.platform.confirmTwoFactor(code));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  const key = setup?.secret.replace(/(.{4})/g, '$1 ').trim();

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Authy).</li>
        <li>Add an account and scan this QR code, or type the key below.</li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-col items-center gap-3 rounded-lg border p-4">
        {qr ? (
          <img src={qr} alt="QR code for your authenticator app" className="size-48" />
        ) : qr === '' ? (
          <p className="text-sm text-muted-foreground">Type this key into your authenticator app:</p>
        ) : (
          <div className="flex size-48 items-center justify-center text-muted-foreground" role="status">
            <Loader2 className="animate-spin" />
            <span className="sr-only">Loading</span>
          </div>
        )}
        {key ? (
          <div className="flex items-center gap-2">
            <code className="rounded bg-muted px-2 py-1 font-mono text-sm" aria-label="Set-up key">
              {key}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Copy the set-up key"
              onClick={() => {
                void navigator.clipboard?.writeText(setup!.secret).then(() => setCopied(true));
              }}
            >
              <Copy />
            </Button>
          </div>
        ) : null}
        {copied ? <p className="text-xs text-muted-foreground">Copied.</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">Code from the app</Label>
        <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy || !setup}>
        {busy ? <Loader2 className="animate-spin" /> : null}
        {busy ? 'Checking…' : 'Turn on authenticator codes'}
      </Button>
    </form>
  );
}
