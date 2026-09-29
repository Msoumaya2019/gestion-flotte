import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  applyIntervention,
  intervalLabel,
  kmPerDay,
  maintenanceStatus,
  nextMaintenanceDue,
  projectedDateForKm,
} from '@/domain/maintenance';
import type { MaintenanceThresholds } from '@/domain/maintenance';

const THRESHOLDS: MaintenanceThresholds = {
  warningKm: 2_000,
  criticalKm: 500,
  warningDays: 45,
  criticalDays: 15,
};

test('l’échéance au kilométrage se calcule depuis la dernière intervention', () => {
  // L'exemple de référence : dernière vidange à 105 000 km, tous les 20 000 km.
  const due = nextMaintenanceDue({
    intervalMode: 'kilometrage',
    intervalKm: 20_000,
    intervalMonths: null,
    lastKm: 105_000,
    lastDate: '2025-08-12',
  });
  assert.equal(due.nextKm, 125_000);
  assert.equal(due.nextDate, null, 'un intervalle au kilométrage ne pose pas d’échéance de date');

  // Kilométrage courant 121 850 : il reste 3 150 km.
  const status = maintenanceStatus(due, 121_850, '2026-09-28', THRESHOLDS);
  assert.equal(status.kmRemaining, 3_150);
  assert.equal(status.state, 'ok');
});

test('l’échéance au temps se calcule depuis la dernière intervention', () => {
  const due = nextMaintenanceDue({
    intervalMode: 'temps',
    intervalKm: null,
    intervalMonths: 12,
    lastKm: 92_400,
    lastDate: '2024-11-15',
  });
  assert.equal(due.nextKm, null);
  assert.equal(due.nextDate, '2025-11-15');
});

test('un intervalle mixte retient le premier des deux seuils atteint', () => {
  const plan = {
    intervalMode: 'mixte' as const,
    intervalKm: 20_000,
    intervalMonths: 12,
    lastKm: 110_000,
    lastDate: '2026-01-20',
  };
  const due = nextMaintenanceDue(plan);
  assert.equal(due.nextKm, 130_000);
  assert.equal(due.nextDate, '2027-01-20');

  // Le véhicule a peu roulé mais la date approche : c'est la date qui commande.
  const parDate = maintenanceStatus(due, 111_000, '2027-01-10', THRESHOLDS);
  assert.equal(parDate.state, 'proche');
  assert.equal(parDate.triggeredBy, 'temps');
  assert.equal(parDate.daysRemaining, 10);

  // Beaucoup de kilomètres, mais la date est lointaine : c'est le kilométrage qui commande.
  const parKm = maintenanceStatus(due, 129_800, '2026-06-01', THRESHOLDS);
  assert.equal(parKm.state, 'proche');
  assert.equal(parKm.triggeredBy, 'kilometrage');
});

test('un entretien dépassé est signalé, et le dépassement est chiffré', () => {
  const due = nextMaintenanceDue({
    intervalMode: 'kilometrage',
    intervalKm: 20_000,
    intervalMonths: null,
    lastKm: 105_000,
    lastDate: null,
  });
  const status = maintenanceStatus(due, 125_400, '2026-09-28', THRESHOLDS);
  assert.equal(status.state, 'depasse');
  assert.equal(status.kmRemaining, -400, 'le dépassement est négatif, pas nul');
});

test('un plan sans point de départ est « inconnu », pas « en retard »', () => {
  const due = nextMaintenanceDue({
    intervalMode: 'kilometrage',
    intervalKm: 20_000,
    intervalMonths: null,
    lastKm: null,
    lastDate: null,
  });
  const status = maintenanceStatus(due, 125_400, '2026-09-28', THRESHOLDS);
  assert.equal(status.state, 'inconnu');
  assert.equal(status.kmRemaining, null);
  assert.equal(status.triggeredBy, 'aucun');
});

test('un entretien effectué décale l’échéance suivante depuis le kilométrage de l’intervention', () => {
  // L'exemple de référence : vidange faite à 124 870 km, nouvelle échéance 144 870 km.
  const plan = {
    intervalMode: 'mixte' as const,
    intervalKm: 20_000,
    intervalMonths: 12,
    lastKm: 105_000,
    lastDate: '2025-08-12',
  };
  const due = applyIntervention(plan, { date: '2026-09-28', mileageKm: 124_870 });
  assert.equal(due.nextKm, 144_870);
  assert.equal(due.nextDate, '2027-09-28');
});

test('la projection de date s’appuie sur la consommation récente', () => {
  assert.equal(projectedDateForKm(1_000, 100, '2026-09-28'), '2026-10-08');
  assert.equal(projectedDateForKm(1_000, 0, '2026-09-28'), null, 'sans consommation, aucune projection');
  assert.equal(projectedDateForKm(-50, 100, '2026-09-28'), null, 'une échéance dépassée n’est pas projetée');
});

test('kmPerDay mesure la consommation entre le premier et le dernier relevé', () => {
  const records = [
    { date: '2026-09-15', km: 125_400 },
    { date: '2026-09-01', km: 124_100 },
    { date: '2026-09-08', km: 124_750 },
  ];
  const perDay = kmPerDay(records);
  assert.ok(perDay !== null);
  assert.equal(Math.round((perDay ?? 0) * 14), 1_300, '1 300 km sur 14 jours');
  assert.equal(kmPerDay([{ date: '2026-09-15', km: 1 }]), null, 'un seul relevé ne dit rien');
  assert.equal(
    kmPerDay([
      { date: '2026-09-15', km: 100 },
      { date: '2026-09-15', km: 200 },
    ]),
    null,
    'deux relevés le même jour ne donnent pas de rythme',
  );
});

test('l’intervalle se résume en une phrase lisible', () => {
  // Espace fine insécable, comme partout ailleurs dans les montants et les kilométrages :
  // le groupement est écrit à la main, il ne dépend pas des données de locale du moteur.
  assert.equal(intervalLabel('kilometrage', 20_000, null), 'tous les 20\u202F000 km');
  assert.equal(intervalLabel('temps', null, 12), 'tous les 12 mois');
  assert.equal(intervalLabel('mixte', 20_000, 12), 'tous les 20\u202F000 km ou tous les 12 mois');
  assert.equal(intervalLabel('kilometrage', null, null), 'intervalle non défini');
  assert.equal(intervalLabel('temps', null, null), 'intervalle non défini');
});
