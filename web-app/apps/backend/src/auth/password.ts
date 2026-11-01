/**
 * Password hashing with argon2id (OWASP recommendation: 19 MiB of memory,
 * 2 passes, 1 lane). The hash string carries its own salt and settings, so
 * these numbers can be raised later without breaking existing passwords.
 */
import { hash, verify } from '@node-rs/argon2';

/** Algorithm.Argon2id. The library exports it as a const enum, which strict ES-module
 *  builds cannot import, so its value is written here (checked in password.test.ts). */
const ARGON2ID = 2;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** False for a wrong password and for a malformed hash; never throws. */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

/**
 * A real hash of a random password, compared against when the email is
 * unknown, so a login takes the same time whether or not the account exists.
 */
let dummyHash: Promise<string> | undefined;
export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomUUID());
  return dummyHash;
}
