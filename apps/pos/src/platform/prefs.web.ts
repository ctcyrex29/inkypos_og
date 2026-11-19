export const prefs = {
  get: async (key: string) => {
    try {
      return globalThis.localStorage?.getItem(`inkypos.pref.${key}`) ?? null;
    } catch {
      return null;
    }
  },
  set: async (key: string, value: string | null) => {
    try {
      if (value === null) globalThis.localStorage?.removeItem(`inkypos.pref.${key}`);
      else globalThis.localStorage?.setItem(`inkypos.pref.${key}`, value);
    } catch {
      // Private browsing: nothing is remembered.
    }
  },
};
