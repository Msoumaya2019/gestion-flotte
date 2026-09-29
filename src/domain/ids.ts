/**
 * Identifiants.
 *
 * UUID v4 produit à partir d'octets fournis de l'extérieur : le générateur est injecté,
 * donc la fonction reste pure et vérifiable. L'application lui passe
 * `expo-crypto.getRandomBytes`, les tests une suite d'octets fixée.
 */

export type RandomBytes = (length: number) => Uint8Array;

const HEX = '0123456789abcdef';

export function createId(randomBytes: RandomBytes): string {
  const bytes = randomBytes(16);
  if (bytes.length < 16) {
    throw new Error(`createId attend 16 octets, reçu ${bytes.length}`);
  }
  // Version 4 (aléatoire) et variante RFC 4122.
  const view = Uint8Array.from(bytes.subarray(0, 16));
  view[6] = ((view[6] ?? 0) & 0x0f) | 0x40;
  view[8] = ((view[8] ?? 0) & 0x3f) | 0x80;

  let out = '';
  for (let i = 0; i < 16; i += 1) {
    const byte = view[i] ?? 0;
    out += HEX[byte >> 4] ?? '0';
    out += HEX[byte & 0x0f] ?? '0';
    if (i === 3 || i === 5 || i === 7 || i === 9) out += '-';
  }
  return out;
}

/** Générateur déterministe, réservé aux tests et aux données de démonstration. */
export function seededRandomBytes(seed: number): RandomBytes {
  let state = seed >>> 0 || 0x9e3779b9;
  return (length: number) => {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      out[i] = state & 0xff;
    }
    return out;
  };
}

/** Référence lisible d'un contrat : « CT-2026-0007 ». */
export function contractReference(sequence: number, year: number): string {
  return `CT-${year}-${String(sequence).padStart(4, '0')}`;
}
