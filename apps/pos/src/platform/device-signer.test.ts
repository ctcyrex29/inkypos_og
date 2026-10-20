import 'fake-indexeddb/auto';
import { base64UrlDecode, deviceAuthMessage, verify, type SecretKey, type SecureStore } from '@inkypos/core';
import { SeedSigner, WebCryptoSigner } from './device-signer';
import { IndexedDbSecureStore, openDeviceDb } from './indexeddb';

class MemoryVault implements SecureStore {
  readonly hardwareBacked = false;
  private readonly data = new Map<SecretKey, string>();
  async get(k: SecretKey) {
    return this.data.get(k) ?? null;
  }
  async set(k: SecretKey, v: string) {
    this.data.set(k, v);
  }
  async delete(k: SecretKey) {
    this.data.delete(k);
  }
}

const message = deviceAuthMessage('019a0000-0000-7000-8000-00000000d001', 'challenge');

describe('SeedSigner (native)', () => {
  it('creates a key whose signatures verify, and persists it', async () => {
    const vault = new MemoryVault();
    const signer = new SeedSigner(vault, (n) => new Uint8Array(n).fill(5));

    const publicKey = await signer.create();
    expect(await signer.publicKey()).toBe(publicKey);
    expect(verify(base64UrlDecode(await signer.sign(message)), message, base64UrlDecode(publicKey))).toBe(true);

    // A new instance over the same storage (an app restart) signs with the same key.
    const restarted = new SeedSigner(vault, () => new Uint8Array(32));
    expect(await restarted.publicKey()).toBe(publicKey);
  });

  it('refuses to sign without a key', async () => {
    await expect(new SeedSigner(new MemoryVault(), (n) => new Uint8Array(n)).sign(message)).rejects.toThrow(/register/);
  });
});

describe('WebCryptoSigner (web)', () => {
  const hasEd25519 = async () => {
    try {
      await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign']);
      return true;
    } catch {
      return false;
    }
  };

  // fake-indexeddb cannot structured-clone a real CryptoKey, so key persistence in
  // IndexedDB is verified in a real browser; here the store keeps the live objects.
  it('signs with a non-extractable key', async () => {
    if (!(await hasEd25519())) return; // runtime without WebCrypto Ed25519
    let stored: CryptoKeyPair | null = null;
    const keys = {
      getKeyPair: async () => stored,
      setKeyPair: async (p: CryptoKeyPair) => void (stored = p),
      deleteKeyPair: async () => void (stored = null),
    };
    const signer = new WebCryptoSigner(keys);

    const publicKey = await signer.create();
    const pair = await keys.getKeyPair();
    expect(pair?.privateKey.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('pkcs8', pair!.privateKey)).rejects.toThrow();

    // Server-side compatible: verifies with the same Ed25519 routine the core uses.
    expect(verify(base64UrlDecode(await signer.sign(message)), message, base64UrlDecode(publicKey))).toBe(true);
  });

  it('persists device state in IndexedDB', async () => {
    const store = new IndexedDbSecureStore(openDeviceDb());
    await store.set('device.record', '{"device_id":"x"}');
    expect(await new IndexedDbSecureStore(openDeviceDb()).get('device.record')).toBe('{"device_id":"x"}');
    await store.delete('device.record');
    expect(await store.get('device.record')).toBeNull();
    expect(store.hardwareBacked).toBe(false);
  });
});
