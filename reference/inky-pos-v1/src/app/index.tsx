// src/app/index.tsx
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";

export default function EntryPoint() {
  const router = useRouter();
  const { isAuthenticated, pinLocked } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated) {
      // User is not logged in: redirect to email/pin form
      router.replace("/(auth)/login");
    } else if (pinLocked) {
      // User is logged in but screen is locked: redirect to PIN unlock
      router.replace("/(auth)/pin");
    } else {
      // User is authenticated and active: redirect to dashboard
      router.replace("/(app)");
    }
  }, [isAuthenticated, pinLocked]);

  return null;
}
