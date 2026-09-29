import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  centsToEuros,
  eurosToCents,
  formatKm,
  formatMoney,
  formatMoneyCompact,
  formatMoneyRounded,
  formatPercent,
  ratioPercent,
  splitEvenly,
  sumCents,
} from '@/domain/money';

test('euros et centimes ne se confondent pas', () => {
  assert.equal(eurosToCents(300), 30_000);
  assert.equal(eurosToCents(15.5), 1_550);
  assert.equal(eurosToCents(0.1 + 0.2), 30, 'le flottant 0,30000000000000004 est arrondi');
  assert.equal(centsToEuros(30_000), 300);
});

test('formatMoney rend le format français, avec espace fine insécable', () => {
  assert.equal(formatMoney(30_000), '300,00\u202F€');
  assert.equal(formatMoney(1_234_567), '12\u202F345,67\u202F€');
  assert.equal(formatMoney(0), '0,00\u202F€');
  assert.equal(formatMoney(-4_250), '−42,50\u202F€', 'le signe moins est typographique');
  assert.equal(formatMoney(30_000, { signed: true }), '+300,00\u202F€');
  assert.equal(formatMoney(-4_250, { signed: true }), '−42,50\u202F€');
});

test('formatMoneyRounded et formatMoneyCompact servent les tuiles et les graphiques', () => {
  assert.equal(formatMoneyRounded(1_234_567), '12\u202F346\u202F€');
  assert.equal(formatMoneyCompact(1_530_000), '15,3\u202Fk€');
  assert.equal(formatMoneyCompact(30_000), '300\u202F€');
  assert.equal(formatMoneyCompact(2_450_000_000), '24,5\u202FM€');
});

test('formatPercent utilise la virgule décimale', () => {
  assert.equal(formatPercent(51.6129), '51,6\u202F%');
  assert.equal(formatPercent(100, 0), '100\u202F%');
});

test('formatKm sépare les milliers', () => {
  assert.equal(formatKm(125_400), '125\u202F400\u202Fkm');
  assert.equal(formatKm(0), '0\u202Fkm');
});

test('ratioPercent distingue « zéro pour cent » de « on ne sait pas »', () => {
  assert.equal(ratioPercent(0, 15_500), 0);
  assert.equal(ratioPercent(8_000, 15_500), 8000 / 15500 * 100);
  assert.equal(ratioPercent(5, 0), null, 'un dénominateur nul rend null, pas Infinity');
});

test('sumCents additionne des entiers sans dérive', () => {
  // Le cas qui casse un flottant : 0,1 € ajouté dix fois.
  const dixFoisDixCentimes = new Array<number>(10).fill(10);
  assert.equal(sumCents(dixFoisDixCentimes), 100);
  assert.equal(sumCents([30_000, 20_000, -5_000]), 45_000);
  assert.equal(sumCents([]), 0);
});

test('splitEvenly répartit un montant indivisible sans perdre un centime', () => {
  assert.deepEqual(splitEvenly(100, 3), [33, 33, 34]);
  assert.equal(sumCents(splitEvenly(100, 3)), 100, 'la somme des parts rend le total');
  assert.deepEqual(splitEvenly(30_000, 4), [7_500, 7_500, 7_500, 7_500]);
  assert.deepEqual(splitEvenly(500, 0), []);
});
