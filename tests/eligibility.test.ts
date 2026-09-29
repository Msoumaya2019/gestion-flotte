import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkRentalEligibility, eligibilityMessage } from '@/domain/eligibility';

const TODAY = '2026-09-28';
const WARNING = 30;

const REQUIREMENTS = [
  { typeId: 'permis', label: 'Permis' },
  { typeId: 'identite', label: "Pièce d'identité" },
  { typeId: 'vtc', label: 'Carte VTC' },
  { typeId: 'assurance', label: 'Assurance' },
];

test('un dossier complet est déclaré conforme, sans message', () => {
  const report = checkRentalEligibility({
    requirements: REQUIREMENTS,
    documents: [
      { id: 'a', typeId: 'permis', expiryDate: '2028-04-12' },
      { id: 'b', typeId: 'identite', expiryDate: '2031-03-04' },
      { id: 'c', typeId: 'vtc', expiryDate: '2029-02-19' },
      { id: 'd', typeId: 'assurance', expiryDate: '2027-05-01' },
    ],
    today: TODAY,
    warningDays: WARNING,
  });
  assert.equal(report.satisfied, true);
  assert.equal(report.message, null);
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.expired, []);
});

test('le cas de référence : l’assurance manque, le message le dit précisément', () => {
  const report = checkRentalEligibility({
    requirements: REQUIREMENTS,
    documents: [
      { id: 'a', typeId: 'permis', expiryDate: '2028-04-12' },
      { id: 'b', typeId: 'identite', expiryDate: '2031-03-04' },
      { id: 'c', typeId: 'vtc', expiryDate: '2029-02-19' },
    ],
    today: TODAY,
    warningDays: WARNING,
  });

  assert.equal(report.satisfied, false);
  assert.deepEqual(report.missing, ['Assurance']);
  assert.equal(report.message, 'Impossible de valider complètement le dossier : assurance manquant.');

  const assurance = report.items.find((item) => item.typeId === 'assurance');
  assert.equal(assurance?.status, 'absent');
  assert.equal(assurance?.present, false);
  assert.equal(assurance?.documentId, null);
});

test('un document expiré est distingué d’un document absent', () => {
  const report = checkRentalEligibility({
    requirements: REQUIREMENTS,
    documents: [
      { id: 'a', typeId: 'permis', expiryDate: '2028-04-12' },
      { id: 'b', typeId: 'identite', expiryDate: '2031-03-04' },
      { id: 'c', typeId: 'vtc', expiryDate: '2029-02-19' },
      { id: 'd', typeId: 'assurance', expiryDate: '2026-08-14' },
    ],
    today: TODAY,
    warningDays: WARNING,
  });
  assert.deepEqual(report.missing, []);
  assert.deepEqual(report.expired, ['Assurance']);
  assert.equal(report.message, 'Impossible de valider complètement le dossier : assurance expiré.');
  assert.equal(report.items.find((item) => item.typeId === 'assurance')?.status, 'expire');
});

test('un document qui expire bientôt ne bloque pas, mais il est signalé', () => {
  const report = checkRentalEligibility({
    requirements: REQUIREMENTS,
    documents: [
      { id: 'a', typeId: 'permis', expiryDate: '2028-04-12' },
      { id: 'b', typeId: 'identite', expiryDate: '2031-03-04' },
      { id: 'c', typeId: 'vtc', expiryDate: '2026-10-28' },
      { id: 'd', typeId: 'assurance', expiryDate: '2027-05-01' },
    ],
    today: TODAY,
    warningDays: WARNING,
  });
  assert.equal(report.satisfied, true);
  assert.deepEqual(report.expiringSoon, ['Carte VTC']);
  assert.equal(report.message, null);
});

test('entre deux documents du même type, le plus utile est retenu', () => {
  // Un permis expiré ne doit pas masquer un permis renouvelé.
  const report = checkRentalEligibility({
    requirements: [{ typeId: 'permis', label: 'Permis' }],
    documents: [
      { id: 'vieux', typeId: 'permis', expiryDate: '2026-01-01' },
      { id: 'neuf', typeId: 'permis', expiryDate: '2032-01-01' },
    ],
    today: TODAY,
    warningDays: WARNING,
  });
  assert.equal(report.satisfied, true);
  assert.equal(report.items[0]?.documentId, 'neuf');
  assert.equal(report.items[0]?.status, 'valide');
});

test('entre un permis qui expire bientôt et un permis valide longtemps, le valide gagne', () => {
  const report = checkRentalEligibility({
    requirements: [{ typeId: 'permis', label: 'Permis' }],
    documents: [
      { id: 'bientot', typeId: 'permis', expiryDate: '2026-10-05' },
      { id: 'longtemps', typeId: 'permis', expiryDate: '2030-10-05' },
    ],
    today: TODAY,
    warningDays: WARNING,
  });
  assert.equal(report.items[0]?.documentId, 'longtemps');
  assert.deepEqual(report.expiringSoon, []);
});

test('aucune exigence signifie un dossier conforme', () => {
  const report = checkRentalEligibility({ requirements: [], documents: [], today: TODAY, warningDays: WARNING });
  assert.equal(report.satisfied, true);
  assert.equal(report.items.length, 0);
});

test('le message énumère plusieurs manques et plusieurs expirations', () => {
  assert.equal(
    eligibilityMessage(['Assurance', 'Carte VTC'], []),
    'Impossible de valider complètement le dossier : assurance, carte vtc manquants.',
  );
  assert.equal(
    eligibilityMessage(['Assurance'], ['Permis']),
    'Impossible de valider complètement le dossier : assurance manquant et permis expiré.',
  );
  assert.equal(eligibilityMessage([], []), '');
});
