import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "crypto";

function scryptAsync(
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/**
 * Format: scrypt$N$r$p$salt$hash (base64url). Every field in the header is a
 * decimal number; salt and hash are base64url. Storing the parameters allows
 * future cost increases without breaking existing hashes.
 */
export interface PasswordHashParams {
  N: number;
  r: number;
  p: number;
}

export const DEFAULT_PARAMS: PasswordHashParams = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

function encode(buf: Buffer): string {
  return buf.toString("base64url");
}

function decode(str: string): Buffer {
  return Buffer.from(str, "base64url");
}

export async function hashPassword(
  password: string,
  params: PasswordHashParams = DEFAULT_PARAMS,
): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(
    password,
    salt,
    KEY_LEN,
    { N: params.N, r: params.r, p: params.p },
  )) as Buffer;
  return [
    "scrypt",
    params.N,
    params.r,
    params.p,
    encode(salt),
    encode(hash),
  ].join("$");
}

export function parseHash(
  stored: string,
): { params: PasswordHashParams; salt: Buffer; hash: Buffer } {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    throw new Error("Unsupported password hash format");
  }
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    throw new Error("Invalid password hash parameters");
  }
  return { params: { N, r, p }, salt: decode(parts[4]), hash: decode(parts[5]) };
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  let parsed;
  try {
    parsed = parseHash(stored);
  } catch {
    return false;
  }
  const { params, salt, hash } = parsed;
  const candidate = (await scryptAsync(
    password,
    salt,
    KEY_LEN,
    { N: params.N, r: params.r, p: params.p },
  )) as Buffer;
  if (candidate.length !== hash.length) return false;
  return timingSafeEqual(candidate, hash);
}
