import * as Crypto from "expo-crypto";

const HASH_PREFIX = "pbkdf2-sha256";
const HASH_ITERATIONS = 3;
const HASH_SALT_LENGTH = 16;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.length % 2 === 1 ? `0${hex}` : hex;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

async function hashPin(secret: string, salt: Uint8Array): Promise<string> {
  let digest = `${bytesToHex(salt)}:${secret}`;

  for (let index = 0; index < HASH_ITERATIONS; index += 1) {
    digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${index}:${digest}`,
    );
  }

  return digest.toLowerCase();
}

export async function createPinHash(pin: string): Promise<string> {
  const salt = Crypto.getRandomValues(new Uint8Array(HASH_SALT_LENGTH));
  const hash = await hashPin(pin, salt);
  return `${HASH_PREFIX}$${bytesToHex(salt)}$${hash}`;
}

export async function verifyPin(
  pin: string,
  storedHash: string,
): Promise<boolean> {
  if (!storedHash) {
    return false;
  }

  if (!storedHash.includes("$")) {
    return storedHash === pin;
  }

  const [prefix, saltHex, hash] = storedHash.split("$");
  if (prefix !== HASH_PREFIX || !saltHex || !hash) {
    return false;
  }

  const salt = hexToBytes(saltHex);
  const expected = await hashPin(pin, salt);
  return expected === hash;
}
