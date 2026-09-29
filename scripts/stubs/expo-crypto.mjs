/**
 * Doublure de `expo-crypto`.
 *
 * Les octets ne sont **pas** aléatoires : ils sont produits par un générateur déterministe,
 * pour qu'un test portant sur un identifiant ou un sel soit reproductible. Un identifiant
 * tiré au hasard ferait échouer une comparaison une fois sur un milliard, ce qui est la
 * pire des instabilités : celle qu'on n'arrive pas à reproduire.
 *
 * L'application, elle, reçoit le vrai générateur du système.
 */

let state = 0x2f6e2b1;

function nextByte() {
  state ^= state << 13;
  state >>>= 0;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return state & 0xff;
}

export function getRandomBytes(length) {
  const out = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) out[index] = nextByte();
  return out;
}

export function getRandomBytesAsync(length) {
  return Promise.resolve(getRandomBytes(length));
}

export async function digestStringAsync() {
  throw new Error('expo-crypto.digestStringAsync n’est pas doublé : utiliser @noble/hashes.');
}

export function __resetRandom() {
  state = 0x2f6e2b1;
}
