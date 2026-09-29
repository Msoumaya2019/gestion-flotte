import assert from 'node:assert/strict';
import { test } from 'node:test';

import { centsToCsv, csvEscape, safeFileName, toCsv } from '@/domain/csv';

test('les cellules contenant le séparateur sont protégées par des guillemets', () => {
  assert.equal(csvEscape('simple'), 'simple');
  assert.equal(csvEscape('a;b'), '"a;b"');
  assert.equal(csvEscape('a"b'), '"a""b"', 'un guillemet se double');
  assert.equal(csvEscape('a\nb'), '"a\nb"');
});

test('une cellule commençant par un caractère de formule est neutralisée', () => {
  // Sans cela, un commentaire saisi « =1+1 » deviendrait une formule exécutée à
  // l'ouverture du fichier dans un tableur.
  assert.equal(csvEscape('=1+1'), "'=1+1");
  assert.equal(csvEscape('+33 6 12 45 78 90'), "'+33 6 12 45 78 90");
  assert.equal(csvEscape('-12'), "'-12");
  assert.equal(csvEscape('@import'), "'@import");
  assert.equal(csvEscape('=a;b'), '"\'=a;b"', 'la neutralisation et l’échappement se cumulent');
});

test('un tableau CSV se termine par un saut de ligne, en CRLF', () => {
  const csv = toCsv([{ label: 'Date' }, { label: 'Montant' }], [
    ['2026-09-28', '300,00'],
    ['2026-10-05', '300,00'],
  ]);
  assert.equal(csv, 'Date;Montant\r\n2026-09-28;300,00\r\n2026-10-05;300,00\r\n');
});

test('les nombres sortent en décimales françaises, les valeurs nulles vides', () => {
  const csv = toCsv([{ label: 'Km' }, { label: 'Note' }], [
    [125_400, null],
    [12.5, 'texte'],
  ]);
  assert.equal(csv, 'Km;Note\r\n125400;\r\n12,5;texte\r\n');
});

test('un montant en centimes se rend en euros décimaux', () => {
  assert.equal(centsToCsv(30_000), '300,00');
  assert.equal(centsToCsv(1_234_567), '12345,67');
  assert.equal(centsToCsv(1), '0,01');
  assert.equal(centsToCsv(-4_250), '-42,50');
});

test('un nom de fichier exporté est sûr, même avec accents et espaces', () => {
  assert.equal(safeFileName('Bilan mensuel Toyota Corolla', 'pdf'), 'bilan-mensuel-toyota-corolla.pdf');
  assert.equal(safeFileName('Dépenses 2026 — véhicule n°1', 'csv'), 'depenses-2026-vehicule-n-1.csv');
  assert.equal(safeFileName('../../etc/passwd', 'csv'), 'etc-passwd.csv', 'aucune remontée de dossier');
  assert.equal(safeFileName('   ', 'csv'), 'export.csv');
});
