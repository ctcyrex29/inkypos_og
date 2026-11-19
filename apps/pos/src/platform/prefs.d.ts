// Type declaration for prefs.native.ts / prefs.web.ts; Metro picks the platform file at bundle time.

/** Small, non-secret settings kept on this device across restarts. */
export declare const prefs: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null): Promise<void>;
};
