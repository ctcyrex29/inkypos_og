// src/store/useAuthStore.ts
import { create } from "zustand";
import { User } from "../db/schema";
import { getDatabase } from "../db/sqlite";
import { createPinHash, verifyPin } from "../utils/security";
import { getPortalContext } from "../utils/tenant";

interface AuthState {
  user: User | null;
  portalContext: ReturnType<typeof getPortalContext> | null;
  isAuthenticated: boolean;
  pinLocked: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  loginWithEmailAndPin: (email: string, pin: string) => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  logout: () => void;
  lockScreen: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  portalContext: null,
  isAuthenticated: false,
  pinLocked: false,
  isLoading: false,
  error: null,

  loginWithEmailAndPin: async (email: string, pin: string) => {
    set({ isLoading: true, error: null });
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const normalizedPin = pin.trim();

      if (!normalizedEmail || normalizedPin.length < 4) {
        set({ error: "Enter a valid email and 4-digit PIN", isLoading: false });
        return false;
      }

      const db = await getDatabase();
      const results = await db.getAllAsync<User>(
        "SELECT * FROM users WHERE email = ? LIMIT 1;",
        [normalizedEmail],
      );

      if (results.length > 0) {
        const loggedUser = results[0];
        const isValidPin = await verifyPin(normalizedPin, loggedUser.pin_code);

        if (isValidPin) {
          if (!loggedUser.pin_code.includes("$")) {
            const upgradedPinHash = await createPinHash(normalizedPin);
            await db.runAsync("UPDATE users SET pin_code = ? WHERE id = ?;", [
              upgradedPinHash,
              loggedUser.id,
            ]);
          }

          set({
            user: loggedUser,
            portalContext: getPortalContext(loggedUser.role),
            isAuthenticated: true,
            pinLocked: false,
            isLoading: false,
          });
          return true;
        }
      }

      set({ error: "Invalid Email or PIN code", isLoading: false });
      return false;
    } catch (err: any) {
      set({
        error: err.message || "Database error occurred",
        isLoading: false,
      });
      return false;
    }
  },

  unlockWithPin: async (pin: string) => {
    const currentUser = get().user;
    if (!currentUser) return false;

    try {
      const normalizedPin = pin.trim();
      const db = await getDatabase();
      const results = await db.getAllAsync<User>(
        "SELECT * FROM users WHERE email = ? LIMIT 1;",
        [currentUser.email],
      );

      if (results.length > 0) {
        const isValidPin = await verifyPin(normalizedPin, results[0].pin_code);
        if (isValidPin) {
          set({ pinLocked: false });
          return true;
        }
      }
      return false;
    } catch (err) {
      return false;
    }
  },

  logout: () => {
    set({
      user: null,
      portalContext: null,
      isAuthenticated: false,
      pinLocked: false,
      error: null,
    });
  },

  lockScreen: () => {
    if (get().isAuthenticated) {
      set({ pinLocked: true });
    }
  },

  clearError: () => set({ error: null }),
}));
