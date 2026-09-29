import assert from 'node:assert/strict';
import { test } from 'node:test';

import { normalize, searchDocuments, type SearchDocument } from '@/domain/search';

const DOCUMENTS: SearchDocument[] = [
  {
    kind: 'vehicule',
    id: 'v1',
    title: 'Toyota Corolla Touring Sports',
    subtitle: 'GK-482-LM',
    href: '/vehicule/v1',
    fields: ['hybride', 'SB1KZ3JE00E123456'],
  },
  {
    kind: 'vehicule',
    id: 'v2',
    title: 'Toyota C-HR',
    subtitle: 'FT-119-RD',
    href: '/vehicule/v2',
    fields: ['hybride'],
  },
  {
    kind: 'locataire',
    id: 't1',
    title: 'Ahmed Benali',
    subtitle: '06 12 45 78 90',
    href: '/locataire/t1',
    fields: ['ahmed.benali@example.fr', 'VTC-2023-114872'],
  },
  {
    kind: 'depense',
    id: 'e1',
    title: 'Vidange et filtres',
    subtitle: '20/01/2026 — 145,00 €',
    href: '/depense/e1',
    fields: ['Toyota Cergy', 'Corolla'],
  },
];

test('normalize supprime accents, casse et séparateurs', () => {
  assert.equal(normalize('Toyota Corolla'), 'toyota corolla');
  assert.equal(normalize('Véhicule'), 'vehicule');
  // Le degré n'est pas un séparateur : « n°1 » reste tel quel, seule la casse change.
  assert.equal(normalize('Véhicule n°1'), 'vehicule n°1');
  assert.equal(normalize('  A-B_C  '), 'a b c');
  assert.equal(normalize('GK-482-LM'), 'gk 482 lm');
});

test('une plaque saisie exactement sort en premier', () => {
  const hits = searchDocuments('gk-482-lm', DOCUMENTS);
  assert.equal(hits[0]?.id, 'v1');
  assert.equal(hits[0]?.matchedIn, 'sous-titre');
});

test('la recherche trouve un locataire par son nom, sans accent ni casse', () => {
  assert.equal(searchDocuments('benali', DOCUMENTS)[0]?.id, 't1');
  assert.equal(searchDocuments('BENALI', DOCUMENTS)[0]?.id, 't1');
  assert.equal(searchDocuments('benáli', DOCUMENTS)[0]?.id, 't1');
});

test('la recherche porte aussi sur les champs secondaires', () => {
  assert.equal(searchDocuments('vtc-2023', DOCUMENTS)[0]?.id, 't1');
  assert.equal(searchDocuments('sb1kz3je', DOCUMENTS)[0]?.id, 'v1');
  assert.equal(searchDocuments('toyota cergy', DOCUMENTS)[0]?.id, 'e1');
});

test('une correspondance de titre passe avant une correspondance de champ', () => {
  const hits = searchDocuments('corolla', DOCUMENTS);
  assert.equal(hits[0]?.id, 'v1', 'le titre exact d’abord');
  assert.equal(hits[1]?.id, 'e1', 'le champ « Corolla » ensuite');
});

test('une recherche vide ne rend rien, une recherche sans correspondance non plus', () => {
  assert.deepEqual(searchDocuments('', DOCUMENTS), []);
  assert.deepEqual(searchDocuments('   ', DOCUMENTS), []);
  assert.deepEqual(searchDocuments('zzzzz', DOCUMENTS), []);
});

test('une recherche de plusieurs mots trouve un titre qui les contient tous', () => {
  const hits = searchDocuments('corolla touring', DOCUMENTS);
  assert.equal(hits[0]?.id, 'v1');
});

test('la limite de résultats est respectée', () => {
  assert.equal(searchDocuments('toyota', DOCUMENTS, 1).length, 1);
  assert.equal(searchDocuments('toyota', DOCUMENTS).length, 3);
});
