import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuthStore } from "../store/useAuthStore";
import type { AppTabName, PortalType } from "./tenant";

export function usePortalRouteGuard(allowedAppTabs: AppTabName[]) {
  const router = useRouter();
  const { portalContext } = useAuthStore();

  useEffect(() => {
    if (!portalContext) {
      return;
    }

    const isAllowed = allowedAppTabs.some((tab) =>
      portalContext.allowedAppTabs.includes(tab),
    );

    if (!isAllowed) {
      router.replace("/(app)");
    }
  }, [portalContext, router, allowedAppTabs]);
}

export function usePortalTypeGuard(allowedPortalTypes: PortalType[]) {
  const router = useRouter();
  const { portalContext } = useAuthStore();

  useEffect(() => {
    if (!portalContext) {
      return;
    }

    if (!allowedPortalTypes.includes(portalContext.portalType)) {
      router.replace("/(app)");
    }
  }, [portalContext, router, allowedPortalTypes]);
}
