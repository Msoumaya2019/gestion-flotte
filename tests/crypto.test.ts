import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bytesEqual,
  bytesToUtf8,
  concatBytes,
  createVaultKey,
  decodeVaultKey,
  deriveKey,
  encodeVaultKey,
  fromBase64,
  hashPin,
  looksSealed,
  open,
  pinIsAcceptable,
  seal,
  sha256Hex,
  toBase64,
  utf8Bytes,
  verifyPin,
  KEY_BYTES,
} from '@/services/crypto';

/** Fabrique déterministe : les tests ne dépendent pas du hasard. */
function fixedRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return (length: number): Uint8Array => {
    const out = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      state = (state * 1664525 + 1013904223) >>> 0;
      out[index] = (state >>> 24) & 0xff;
    }
    return out;
  };
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------

test('base64 fait l’aller-retour sur toutes les longueurs de reste', () => {
  for (let length = 0; length <= 12; length += 1) {
    const bytes = Uint8Array.from({ length }, (_, index) => (index * 37 + 11) & 0xff);
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes, `longueur ${length}`);
  }
});

test('base64 produit des chaînes connues', () => {
  assert.equal(toBase64(utf8Bytes('a')), 'YQ==');
  assert.equal(toBase64(utf8Bytes('ab')), 'YWI=');
  assert.equal(toBase64(utf8Bytes('abc')), 'YWJj');
  assert.equal(bytesToUtf8(fromBase64('SGVsbG8=')), 'Hello');
});

test('base64 ignore les caractères de remplissage et d’espace', () => {
  assert.deepEqual(fromBase64('YWJj\n'), fromBase64('YWJj'));
  assert.deepEqual(fromBase64('YW Jj'), fromBase64('YWJj'));
});

// ---------------------------------------------------------------------------
// Utilitaires binaires
// ---------------------------------------------------------------------------

test('concatBytes assemble dans l’ordre', () => {
  const joined = concatBytes(Uint8Array.from([1, 2]), Uint8Array.from([3]), Uint8Array.from([]));
  assert.deepEqual([...joined], [1, 2, 3]);
});

test('bytesEqual compare le contenu, pas la référence', () => {
  assert.equal(bytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2])), true);
  assert.equal(bytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 3])), false);
  assert.equal(bytesEqual(Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 3])), false);
});

test('sha256Hex rend une empreinte stable et connue', () => {
  assert.equal(
    sha256Hex(utf8Bytes('abc')),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(sha256Hex(utf8Bytes('')).length, 64);
});

// ---------------------------------------------------------------------------
// Conteneur chiffré
// ---------------------------------------------------------------------------

test('un contenu chiffré se relit à l’identique', () => {
  const key = createVaultKey(fixedRandom(1));
  const plain = utf8Bytes('Permis de conduire — Ahmed Benali — 881204517830');
  const sealed = seal(key, plain, fixedRandom(2));

  assert.equal(looksSealed(sealed), true);
  assert.notDeepEqual(sealed, plain, 'le contenu ne doit pas apparaître en clair');
  assert.ok(!bytesToUtf8(sealed).includes('Ahmed'), 'aucun fragment lisible dans le conteneur');
  assert.deepEqual(open(key, sealed), plain);
});

test('deux chiffrements du même contenu diffèrent : le nonce est tiré à chaque fois', () => {
  const key = createVaultKey(fixedRandom(3));
  const plain = utf8Bytes('même contenu');
  const first = seal(key, plain, fixedRandom(10));
  const second = seal(key, plain, fixedRandom(20));
  assert.notDeepEqual(first, second, 'sinon, deux fichiers identiques seraient reconnaissables');
});

test('un conteneur altéré est refusé au lieu d’être rendu corrompu', () => {
  const key = createVaultKey(fixedRandom(4));
  const sealed = seal(key, utf8Bytes('facture de 145,00 €'), fixedRandom(5));

  // On modifie un octet du cryptogramme : GCM doit refuser, pas rendre un texte faux.
  const tampered = Uint8Array.from(sealed);
  const index = tampered.length - 1;
  tampered[index] = (tampered[index] ?? 0) ^ 0x01;

  assert.throws(() => open(key, tampered));
});

test('une mauvaise clé ne déchiffre pas', () => {
  const sealed = seal(createVaultKey(fixedRandom(6)), utf8Bytes('secret'), fixedRandom(7));
  const otherKey = createVaultKey(fixedRandom(8));
  assert.throws(() => open(otherKey, sealed));
});

test('un fichier étranger est refusé par son en-tête, sans tentative de déchiffrement', () => {
  const key = createVaultKey(fixedRandom(9));

  // Un conteneur fait au minimum 5 octets d'en-tête + 12 de nonce + 16 d'étiquette = 33.
  // Un extrait plus court serait refusé pour sa TAILLE, et le test n'éprouverait alors pas
  // le contrôle d'en-tête qu'il annonce. On part donc d'un vrai début de PDF, assez long.
  const foreign = utf8Bytes('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  assert.ok(foreign.length > 33, 'le cas de test doit dépasser la taille minimale d’un conteneur');

  assert.equal(looksSealed(foreign), false);
  assert.throws(() => open(key, foreign), /pas un conteneur chiffré reconnu/);

  // Et le cas court, lui, est bien refusé pour sa taille — message distinct.
  assert.throws(() => open(key, new Uint8Array(4)), /trop court/);
});

test('une clé de mauvaise taille est refusée à la fabrication', () => {
  assert.throws(() => seal(new Uint8Array(16), utf8Bytes('x'), fixedRandom(1)), /AES-256/);
});

test('une clé de coffre s’encode et se relit, et une valeur illisible est refusée', () => {
  const key = createVaultKey(fixedRandom(11));
  assert.equal(key.length, KEY_BYTES);
  const encoded = encodeVaultKey(key);
  assert.deepEqual(decodeVaultKey(encoded), key);
  assert.throws(() => decodeVaultKey('QUJD'), /AES-256/);
});

// ---------------------------------------------------------------------------
// Dérivation et code de déverrouillage
// ---------------------------------------------------------------------------

test('la dérivation PBKDF2 est déterministe pour un sel donné', async () => {
  const salt = Uint8Array.from({ length: 16 }, (_, index) => index);
  const first = await deriveKey('motdepasse', salt, 1_000);
  const second = await deriveKey('motdepasse', salt, 1_000);
  assert.deepEqual(first, second);
  assert.equal(first.length, KEY_BYTES);

  const other = await deriveKey('motdepasse2', salt, 1_000);
  assert.notDeepEqual(first, other);
});

test('le code de déverrouillage se vérifie sans jamais être stocké en clair', async () => {
  const record = await hashPin('123456', fixedRandom(12), 1_000);
  assert.equal(record.algorithm, 'pbkdf2-sha256');
  assert.equal(record.iterations, 1_000);
  assert.ok(!record.hash.includes('123456'));
  assert.equal(await verifyPin('123456', record), true);
  assert.equal(await verifyPin('123457', record), false);
  assert.equal(await verifyPin('', record), false);
});

test('un code trop court est refusé à la saisie', () => {
  assert.equal(pinIsAcceptable('12345'), false);
  assert.equal(pinIsAcceptable('123456'), true);
  assert.equal(pinIsAcceptable('1234567890'), true);
  assert.equal(pinIsAcceptable('12345a'), false);
});
