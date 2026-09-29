import assert from 'node:assert/strict';
import { test } from 'node:test';

import { collectExpiring, documentValidity, isUsable, reminderDates } from '@/domain/documents';

const TODAY = '2026-09-28';
const WARNING = 30;

test('un document sans date d’expiration n’est pas « valide », il est sans échéance', () => {
  // La distinction compte : afficher « Valide » sur un document qu'on n'a pas vérifié
  // laisserait croire à une conformité qui n'a pas été établie.
  const validity = documentValidity(null, TODAY, WARNING);
  assert.equal(validity.status, 'sans_echeance');
  assert.equal(validity.daysRemaining, null);
  assert.equal(isUsable(validity.status), true, 'il reste utilisable pour louer');
});

test('les quatre états d’un document se distinguent', () => {
  assert.equal(documentValidity('2028-04-12', TODAY, WARNING).status, 'valide');
  assert.equal(documentValidity('2026-10-28', TODAY, WARNING).status, 'expire_bientot');
  assert.equal(documentValidity('2026-08-14', TODAY, WARNING).status, 'expire');
  assert.equal(documentValidity('2026-10-28', TODAY, WARNING).daysRemaining, 30);
});

test('le jour même de l’expiration, le document n’est pas encore expiré', () => {
  const validity = documentValidity(TODAY, TODAY, WARNING);
  assert.equal(validity.status, 'expire_bientot');
  assert.equal(validity.daysRemaining, 0);
});

test('seuls les états valide et sans échéance sont utilisables sans réserve', () => {
  assert.equal(isUsable('valide'), true);
  assert.equal(isUsable('sans_echeance'), true);
  assert.equal(isUsable('expire_bientot'), false);
  assert.equal(isUsable('expire'), false);
});

test('les rappels ne sont pas posés dans le passé', () => {
  // Un rappel « 90 jours avant » sur un document qui expire dans 30 jours serait déjà
  // dépassé : le programmer ferait tirer la notification immédiatement.
  const dates = reminderDates('2026-10-28', [90, 60, 30, 15, 7], TODAY);
  assert.deepEqual(
    dates,
    ['2026-09-28', '2026-10-13', '2026-10-21'],
    'les seuils 90 et 60 jours sont dépassés ; celui d’aujourd’hui est conservé, il n’a pas encore tiré',
  );
  assert.ok(!dates.includes('2026-08-29'), 'aucun rappel dans le passé');
});

test('les rappels sont rendus du plus tôt au plus tard', () => {
  const dates = reminderDates('2027-01-01', [7, 90, 30], TODAY);
  assert.deepEqual(dates, ['2026-10-03', '2026-12-02', '2026-12-25']);
});

test('la liste des documents à surveiller écarte les valides et trie par urgence', () => {
  const documents = [
    { id: 'd1', label: 'Permis', expiryDate: '2028-04-12' },
    { id: 'd2', label: 'Carte VTC', expiryDate: '2026-10-28' },
    { id: 'd3', label: 'Assurance', expiryDate: '2026-08-14' },
    { id: 'd4', label: 'RIB', expiryDate: null },
  ];
  const expiring = collectExpiring(documents, TODAY, WARNING);
  assert.equal(expiring.length, 2);
  assert.equal(expiring[0]?.id, 'd3', 'le plus urgent en premier');
  assert.equal(expiring[0]?.daysRemaining, -45);
  assert.equal(expiring[1]?.id, 'd2');
  assert.equal(expiring[1]?.daysRemaining, 30);
});
