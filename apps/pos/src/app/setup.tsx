import { Redirect, useRouter } from 'expo-router';
import { SetupScreen } from '@/features/setup/SetupScreen';
import { useSession } from '@/services/session-context';

export default function Setup() {
  const { session, status, reload } = useSession();
  const router = useRouter();

  // An enrolled till never shows setup again; re-enrolment needs an explicit reset (later phase).
  if (status && status.phase !== 'unenrolled') return <Redirect href="/" />;

  return (
    <SetupScreen
      session={session}
      onEnrolled={() => {
        void reload().then(() => router.replace('/'));
      }}
    />
  );
}
