import * as ExpoSecureStore from 'expo-secure-store';

// SecureStore keys allow only [A-Za-z0-9._-].
export const prefs = {
  get: (key: string) => ExpoSecureStore.getItemAsync(`pref.${key}`).catch(() => null),
  set: async (key: string, value: string | null) => {
    try {
      if (value === null) await ExpoSecureStore.deleteItemAsync(`pref.${key}`);
      else await ExpoSecureStore.setItemAsync(`pref.${key}`, value);
    } catch {
      // A preference that cannot be saved only costs a tap next time.
    }
  },
};
