import { base64UrlDecode, base64UrlEncode, deviceKeyPairFromSeed, sign, type SecureStore } from '@inkypos/core';

/** Holds the till's Ed25519 key and signs sign-in challenges. The private key never leaves this object. */
export interface DeviceSigner {
  /** Creates (or replaces) the key pair; returns the base64url public key. */
  create(): Promise<string>;
  publicKey(): Promise<string | null>;
  sign(message: Uint8Array): Promise<string>;
  destroy(): Promise<void>;
}

/**
 * Native signer: a 32-byte seed in the Keychain / Android Keystore-backed
 * SecureStore, signing with @noble/ed25519.
 */
export class SeedSigner implements DeviceSigner {
  constructor(
    private readonly vault: SecureStore,
    private readonly randomBytes: (n: number) => Uint8Array,
  ) {}

  async create(): Promise<string> {
    const keys = deviceKeyPairFromSeed(this.randomBytes(32));
    await this.vault.set('device.signing_key', base64UrlEncode(keys.secretKey));
    return base64UrlEncode(keys.publicKey);
  }

  async publicKey(): Promise<string | null> {
    const seed = await this.vault.get('device.signing_key');
    return seed ? base64UrlEncode(deviceKeyPairFromSeed(base64UrlDecode(seed)).publicKey) : null;
  }

  async sign(message: Uint8Array): Promise<string> {
    const seed = await this.vault.get('device.signing_key');
    if (!seed) throw new Error('This device has no signing key; register it first.');
    return base64UrlEncode(sign(message, base64UrlDecode(seed)));
  }

  destroy(): Promise<void> {
    return this.vault.delete('device.signing_key');
  }
}

export interface CryptoKeyStore {
  getKeyPair(): Promise<CryptoKeyPair | null>;
  setKeyPair(pair: CryptoKeyPair): Promise<void>;
  deleteKeyPair(): Promise<void>;
}

/**
 * Web signer: a non-extractable WebCrypto Ed25519 key kept in IndexedDB.
 * Script on the page can ask it to sign but can never read the private key out.
 */
export class WebCryptoSigner implements DeviceSigner {
  constructor(
    private readonly keys: CryptoKeyStore,
    private readonly subtle: SubtleCrypto = globalThis.crypto.subtle,
  ) {}

  async create(): Promise<string> {
    const pair = (await this.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])) as CryptoKeyPair;
    await this.keys.setKeyPair(pair);
    return this.exportPublic(pair);
  }

  async publicKey(): Promise<string | null> {
    const pair = await this.keys.getKeyPair();
    return pair ? this.exportPublic(pair) : null;
  }

  async sign(message: Uint8Array): Promise<string> {
    const pair = await this.keys.getKeyPair();
    if (!pair) throw new Error('This device has no signing key; register it first.');
    const signature = await this.subtle.sign({ name: 'Ed25519' }, pair.privateKey, message as BufferSource);
    return base64UrlEncode(new Uint8Array(signature));
  }

  destroy(): Promise<void> {
    return this.keys.deleteKeyPair();
  }

  private async exportPublic(pair: CryptoKeyPair): Promise<string> {
    return base64UrlEncode(new Uint8Array(await this.subtle.exportKey('raw', pair.publicKey)));
  }
}
