/**
 * Banc de la **saisie** : ce qu'un doigt tape sur un clavier de téléphone.
 *
 * Ces deux analyseurs vivent dans `domain/money.ts` et `domain/dates.ts`, mais ils forment
 * une même surface : la frontière entre du texte libre et une valeur métier. C'est là que
 * se perdent les centimes et que se décalent les échéances, donc c'est là qu'il faut des
 * cas tordus — virgule, espaces de groupement, date inexistante, année sur deux chiffres.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseDateInput } from '@/domain/dates';
import { parseInteger, parseMoneyToCents } from '@/domain/money';

// ---------------------------------------------------------------------------
// Montants
// ---------------------------------------------------------------------------

test('un montant se lit avec la virgule ou le point', () => {
  assert.equal(parseMoneyToCents('300'), 30_000);
  assert.equal(parseMoneyToCents('300,50'), 30_050);
  assert.equal(parseMoneyToCents('300.50'), 30_050);
});

test('un montant se lit avec ses espaces de groupement et le signe €', () => {
  assert.equal(parseMoneyToCents('1 650'), 165_000);
  assert.equal(parseMoneyToCents('1\u202F650,00 €'), 165_000);
  assert.equal(parseMoneyToCents(' 15 500 € '), 1_550_000);
});

test('un centime ne se perd pas là où un flottant le perdrait', () => {
  // `Number('1.005') * 100` vaut 100.49999… : arrondi, cela donne 100 centimes, pas 101.
  // C'est exactement le centime qui disparaît d'un total annuel sans qu'on le retrouve.
  assert.equal(parseMoneyToCents('1.005'), 100, 'la troisième décimale est tronquée, pas arrondie');
  assert.equal(parseMoneyToCents('0.07'), 7);
  assert.equal(parseMoneyToCents('19.99'), 1_999);
  assert.equal(parseMoneyToCents('1234.56'), 123_456);
});

test('une saisie incomplète rend null, jamais zéro', () => {
  // Zéro est un montant valide : le confondre avec « rien saisi » ferait enregistrer une
  // dépense de 0 € au lieu de refuser l'enregistrement.
  assert.equal(parseMoneyToCents(''), null);
  assert.equal(parseMoneyToCents('   '), null);
  assert.equal(parseMoneyToCents('-'), null);
  assert.equal(parseMoneyToCents('.'), null);
  assert.equal(parseMoneyToCents('abc'), null);
  assert.equal(parseMoneyToCents('12,3,4'), null);
  assert.equal(parseMoneyToCents('1e3'), null);
});

test('un montant nul saisi explicitement vaut bien zéro', () => {
  assert.equal(parseMoneyToCents('0'), 0);
  assert.equal(parseMoneyToCents('0,00'), 0);
});

test('un montant négatif est accepté et garde son signe', () => {
  assert.equal(parseMoneyToCents('-250,75'), -25_075);
});

test('un entier se lit avec ou sans séparateurs, et rejette le reste', () => {
  assert.equal(parseInteger('125 400'), 125_400);
  assert.equal(parseInteger('125400'), 125_400);
  assert.equal(parseInteger('120000'), 120_000);
  assert.equal(parseInteger(''), null);
  assert.equal(parseInteger('12,5 km'), null);
  assert.equal(parseInteger('abc'), null);
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

test('une date se lit dans les trois écritures qu’on tape réellement', () => {
  assert.equal(parseDateInput('2026-09-28'), '2026-09-28');
  assert.equal(parseDateInput('28/09/2026'), '2026-09-28');
  assert.equal(parseDateInput('28-09-2026'), '2026-09-28');
  assert.equal(parseDateInput('1/3/2026'), '2026-03-01', 'les zéros de tête sont facultatifs');
});

test('une date inexistante est refusée au lieu d’être reportée', () => {
  // `new Date(2026, 1, 31)` donne le 3 mars : une échéance silencieusement décalée de
  // trois jours est bien pire qu'une saisie à refaire.
  assert.equal(parseDateInput('31/02/2026'), null);
  assert.equal(parseDateInput('45/13/2026'), null);
  assert.equal(parseDateInput('00/01/2026'), null);
  assert.equal(parseDateInput('2026-02-30'), null);
});

test('le 29 février n’est accepté que les années bissextiles', () => {
  assert.equal(parseDateInput('29/02/2024'), '2024-02-29');
  assert.equal(parseDateInput('29/02/2025'), null);
  assert.equal(parseDateInput('29/02/2026'), null);
});

test('une année sur deux chiffres est refusée', () => {
  // « 26 » peut vouloir dire 1926 ou 2026 : sur un contrat de location, mieux vaut
  // demander une ressaisie que choisir à la place de l'utilisateur.
  assert.equal(parseDateInput('28/09/26'), null);
});

test('une date vide ou illisible rend null', () => {
  assert.equal(parseDateInput(''), null);
  assert.equal(parseDateInput('   '), null);
  assert.equal(parseDateInput('demain'), null);
  assert.equal(parseDateInput('28/09'), null);
  assert.equal(parseDateInput('2026/09/28'), null);
});
