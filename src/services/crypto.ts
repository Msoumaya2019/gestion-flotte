/**
 * Chiffrement local.
 *
 * Ce module est **pur** au sens où il ne dépend d'aucun module natif : il reçoit ses octets
 * aléatoires en paramètre. Il est donc exécutable et vérifiable dans un banc Node — ce qui
 * compte, parce qu'un chiffrement qu'on ne peut pas éprouver est un chiffrement qu'on
 * espère.
 *
 * Deux clés, deux usages, et il ne faut pas les confondre :
 *
 * - **La clé du coffre** protège les fichiers sur l'appareil (documents, factures,
 *   contrats). Elle est tirée au hasard et conservée dans le trousseau du système
 *   (`expo-secure-store`), pas dans la base : une copie de la base ne suffit donc pas à
 *   lire les documents.
 * - **La clé de sauvegarde** dérive d'un mot de passe saisi par l'utilisateur, par PBKDF2.
 *   C'est la seule qui protège une archive sortie de l'appareil, puisque la clé du coffre
 *   n'accompagne jamais la sauvegarde.
 *
 * L'algorithme est AES-256-GCM. Le mode GCM est *authentifié* : une altération d'un seul
 * octet fait échouer le déchiffrement au lieu de rendre un fichier silencieusement
 * corrompu — c'est exactement ce qu'on veut pour une facture ou un permis de conduire.
 */

// `@noble/*` v2 impose l'extension `.js` sur ses sous-chemins, et `sha256` a migré de
// `sha256.js` vers `sha2.js`. Ces trois chemins sont ceux de la version installée — pas
// ceux de la v1, qui ne résoudraient plus rien.
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/** Fabrique d'octets aléatoires. L'application passe `expo-crypto`, les tests une suite fixée. */
export type RandomBytes = (length: number) => Uint8Array;

export const KEY_BYTES = 32; // AES-256
export const NONCE_BYTES = 12; // taille recommandée pour GCM
export const SALT_BYTES = 16;
export const TAG_BYTES = 16;

/**
 * Itérations PBKDF2.
 *
 * 150 000 est un compromis assumé : la dérivation dure environ une seconde sur un iPhone
 * récent en JavaScript pur, ce qui est acceptable pour une ouverture de session ou une
 * sauvegarde, et rend une attaque par dictionnaire hors ligne coûteuse. Monter à 600 000
 * ferait attendre quatre secondes à chaque déverrouillage.
 */
export const PBKDF2_ITERATIONS = 150_000;

/** En-tête binaire des fichiers chiffrés. */
const MAGIC = new Uint8Array([0x46, 0x4c, 0x54, 0x31]); // « FLT1 »
const FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------
// Base64 — écrit à la main
// ---------------------------------------------------------------------------

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const BASE64_LOOKUP: Record<string, number> = (() => {
  const table: Record<string, number> = {};
  for (let index = 0; index < BASE64_ALPHABET.length; index += 1) {
    table[BASE64_ALPHABET[index] as string] = index;
  }
  return table;
})();

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index] ?? 0;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    out += BASE64_ALPHABET[a >> 2];
    out += BASE64_ALPHABET[((a & 0x03) << 4) | ((b ?? 0) >> 4)];
    out += b === undefined ? '=' : (BASE64_ALPHABET[((b & 0x0f) << 2) | ((c ?? 0) >> 6)] as string);
    out += c === undefined ? '=' : (BASE64_ALPHABET[c & 0x3f] as string);
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(length);
  let outIndex = 0;
  for (let index = 0; index < clean.length; index += 4) {
    const c0 = BASE64_LOOKUP[clean[index] as string] ?? 0;
    const c1 = BASE64_LOOKUP[clean[index + 1] as string] ?? 0;
    const c2 = BASE64_LOOKUP[clean[index + 2] as string] ?? 0;
    const c3 = BASE64_LOOKUP[clean[index + 3] as string] ?? 0;
    if (outIndex < length) out[outIndex++] = (c0 << 2) | (c1 >> 4);
    if (outIndex < length) out[outIndex++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    if (outIndex < length) out[outIndex++] = ((c2 & 0x03) << 6) | c3;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Utilitaires binaires
// ---------------------------------------------------------------------------

export function concatBytes(...arrays: readonly Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, array) => sum + array.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  // Comparaison à temps constant : une sortie anticipée laisserait fuir la position du
  // premier octet différent.
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return difference === 0;
}

export function utf8Bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

export function sha256Hex(bytes: Uint8Array): string {
  const digest = sha256(bytes);
  let out = '';
  for (const byte of digest) out += byte.toString(16).padStart(2, '0');
  return out;
}

// ---------------------------------------------------------------------------
// Dérivation de clé
// ---------------------------------------------------------------------------

export async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<Uint8Array> {
  return pbkdf2Async(sha256, password, salt, { c: iterations, dkLen: KEY_BYTES });
}

/** Dérive une clé et rend la dérivation reproductible en conservant le sel. */
export async function deriveKeyWithSalt(
  password: string,
  random: RandomBytes,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<{ key: Uint8Array; salt: Uint8Array; iterations: number }> {
  const salt = random(SALT_BYTES);
  return { key: await deriveKey(password, salt, iterations), salt, iterations };
}

// ---------------------------------------------------------------------------
// Chiffrement authentifié
// ---------------------------------------------------------------------------

function assertKey(key: Uint8Array): void {
  if (key.length !== KEY_BYTES) {
    throw new Error(`Clé de ${key.length} octets : ${KEY_BYTES} attendus (AES-256).`);
  }
}

/** Chiffre des octets et rend un conteneur autonome : en-tête, nonce, puis cryptogramme. */
export function seal(key: Uint8Array, plain: Uint8Array, random: RandomBytes): Uint8Array {
  assertKey(key);
  const nonce = random(NONCE_BYTES);
  const ciphertext = gcm(key, nonce).encrypt(plain);
  return concatBytes(MAGIC, new Uint8Array([FORMAT_VERSION]), nonce, ciphertext);
}

/** Ouvre un conteneur produit par `seal`. Lève si l'authentification échoue. */
export function open(key: Uint8Array, container: Uint8Array): Uint8Array {
  assertKey(key);
  const headerLength = MAGIC.length + 1;
  if (container.length < headerLength + NONCE_BYTES + TAG_BYTES) {
    throw new Error('Conteneur chiffré trop court pour être valide.');
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (container[index] !== MAGIC[index]) {
      throw new Error("Ce fichier n'est pas un conteneur chiffré reconnu.");
    }
  }
  const version = container[MAGIC.length];
  if (version !== FORMAT_VERSION) {
    throw new Error(`Version de conteneur ${String(version)} non prise en charge.`);
  }
  const nonce = container.subarray(headerLength, headerLength + NONCE_BYTES);
  const ciphertext = container.subarray(headerLength + NONCE_BYTES);
  return gcm(key, nonce).decrypt(ciphertext);
}

/** Vrai si les octets commencent par l'en-tête du format. Ne déchiffre rien. */
export function looksSealed(container: Uint8Array): boolean {
  if (container.length < MAGIC.length + 1) return false;
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (container[index] !== MAGIC[index]) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Code de déverrouillage
// ---------------------------------------------------------------------------

export interface PinRecord {
  algorithm: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  hash: string;
}

export async function hashPin(
  pin: string,
  random: RandomBytes,
  iterations: number = PBKDF2_ITERATIONS,
): Promise<PinRecord> {
  const salt = random(SALT_BYTES);
  const key = await deriveKey(pin, salt, iterations);
  return {
    algorithm: 'pbkdf2-sha256',
    iterations,
    salt: toBase64(salt),
    hash: toBase64(key),
  };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const salt = fromBase64(record.salt);
  const key = await deriveKey(pin, salt, record.iterations);
  return bytesEqual(key, fromBase64(record.hash));
}

/** Un code court reste devinable hors ligne : on impose une longueur minimale. */
export function pinIsAcceptable(pin: string): boolean {
  return /^\d{6,}$/.test(pin);
}

// ---------------------------------------------------------------------------
// Clé du coffre
// ---------------------------------------------------------------------------

/** Clé tirée au hasard, à conserver dans le trousseau du système. */
export function createVaultKey(random: RandomBytes): Uint8Array {
  return random(KEY_BYTES);
}

export function encodeVaultKey(key: Uint8Array): string {
  assertKey(key);
  return toBase64(key);
}

export function decodeVaultKey(encoded: string): Uint8Array {
  const key = fromBase64(encoded);
  assertKey(key);
  return key;
}
