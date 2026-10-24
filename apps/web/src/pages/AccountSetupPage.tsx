import { KeyRound, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/session';
import { ChangePasswordForm, TwoFactorSetupForm } from '@/components/account-security';
import { AuthLayout } from '@/components/auth-layout';

/**
 * Shown instead of the back office or the portal until the account is safe to
 * use: a temporary password replaced, and (Inkgenius staff) an authenticator app
 * set up. The server refuses everything else until then, so this is not a formality.
 */
export function AccountSetupPage({ step }: { step: 'business_password' | 'platform_password' | 'two_factor' }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const platform = step !== 'business_password';
  const leave = (
    <button
      type="button"
      className="hover:underline"
      onClick={() => {
        signOut();
        navigate(platform ? '/inkgenius/login' : '/login', { replace: true });
      }}
    >
      Sign out
    </button>
  );

  if (step === 'two_factor') {
    return (
      <AuthLayout title="Set up authenticator codes" subtitle="Inkgenius staff accounts can reach every business, so they need a code from your phone as well as a password." footer={leave}>
        <div className="flex items-center gap-2 rounded-lg border bg-accent/60 px-3 py-2 text-sm text-accent-foreground">
          <ShieldCheck className="size-4" /> You will enter a new code each time you sign in.
        </div>
        <TwoFactorSetupForm />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title="Choose your own password"
      subtitle="You signed in with a temporary password. Replace it to continue; it stops working once you do."
      footer={leave}
    >
      <div className="flex items-center gap-2 rounded-lg border bg-accent/60 px-3 py-2 text-sm text-accent-foreground">
        <KeyRound className="size-4" /> Only you should know your password. Inkgenius staff will never ask for it.
      </div>
      <ChangePasswordForm kind={platform ? 'platform' : 'business'} />
    </AuthLayout>
  );
}
