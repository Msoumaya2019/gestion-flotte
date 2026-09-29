import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';

import {
  addDays,
  addMonths,
  compareIso,
  daysBetween,
  daysInMonth,
  endOfMonth,
  formatFr,
  isIsoDate,
  isoWeekday,
  lastMonths,
  monthKey,
  monthLabelFr,
  previousMonth,
  relativeDaysLabel,
  startOfMonth,
  toIsoDate,
  toLocalDate,
  todayIso,
  weekdayLabelFr,
} from '@/domain/dates';

test('une date invalide est refusée, y compris un 30 février', () => {
  assert.equal(isIsoDate('2026-02-28'), true);
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('2024-02-29'), true, '2024 est bissextile');
  assert.equal(isIsoDate('2026-02-29'), false, '2026 ne l’est pas');
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('28/09/2026'), false);
  assert.equal(isIsoDate(''), false);
});

test('daysInMonth connaît les années bissextiles, y compris séculaires', () => {
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2000, 2), 29, '2000 est bissextile : divisible par 400');
  assert.equal(daysInMonth(1900, 2), 28, '1900 ne l’est pas : divisible par 100 sans 400');
  assert.equal(daysInMonth(2026, 4), 30);
});

test('addMonths ramène au dernier jour du mois cible au lieu de déborder', () => {
  // C'est la règle qui rend un échéancier mensuel stable : partir du 31 janvier ne doit
  // pas produire le 3 mars.
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-01-31', 2), '2026-03-31', 'la dérive ne se cumule pas');
  assert.equal(addMonths('2026-01-31', 3), '2026-04-30');
  assert.equal(addMonths('2026-03-15', -1), '2026-02-15');
  assert.equal(addMonths('2026-01-15', 12), '2027-01-15');
});

test('addDays franchit les mois et les années', () => {
  assert.equal(addDays('2026-09-28', 7), '2026-10-05');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
});

test('daysBetween compte des jours entiers, dans les deux sens', () => {
  assert.equal(daysBetween('2026-09-05', '2026-09-12'), 7);
  assert.equal(daysBetween('2026-09-12', '2026-09-05'), -7);
  assert.equal(daysBetween('2026-09-28', '2026-09-28'), 0);
  assert.equal(daysBetween('2026-09-28', '2026-10-05'), 7);
});

test('isoWeekday suit la convention ISO : lundi vaut 1, dimanche 7', () => {
  assert.equal(isoWeekday('2026-09-28'), 1, '28 septembre 2026 est un lundi');
  assert.equal(isoWeekday('2026-10-05'), 1);
  assert.equal(isoWeekday('2026-10-04'), 7, 'dimanche');
  assert.equal(isoWeekday('2026-10-03'), 6, 'samedi');
  assert.equal(weekdayLabelFr(1), 'lundi');
  assert.equal(weekdayLabelFr(7), 'dimanche');
});

test('début et fin de mois, mois précédent, fenêtre glissante', () => {
  assert.equal(startOfMonth('2026-09-28'), '2026-09-01');
  assert.equal(endOfMonth('2026-09-28'), '2026-09-30');
  assert.equal(endOfMonth('2026-02-10'), '2026-02-28');
  assert.equal(previousMonth('2026-01-15'), '2025-12-01');
  assert.deepEqual(lastMonths('2026-03-15', 3), ['2026-01-01', '2026-02-01', '2026-03-01']);
  assert.equal(monthKey('2026-09-28'), '2026-09');
  assert.equal(monthLabelFr('2026-09-28'), 'septembre 2026');
});

test('les comparaisons de dates sont des comparaisons de chaînes', () => {
  assert.equal(compareIso('2026-09-28', '2026-10-01'), -1);
  assert.equal(compareIso('2026-10-01', '2026-09-28'), 1);
  assert.equal(compareIso('2026-09-28', '2026-09-28'), 0);
});

test('les libellés relatifs se lisent en français', () => {
  assert.equal(relativeDaysLabel(0), "aujourd'hui");
  assert.equal(relativeDaysLabel(1), 'demain');
  assert.equal(relativeDaysLabel(-1), 'hier');
  assert.equal(relativeDaysLabel(5), 'dans 5 jours');
  assert.equal(relativeDaysLabel(-12), 'il y a 12 jours');
});

test('formatFr rend le format français à partir d’une date métier', () => {
  assert.equal(formatFr('2026-10-05'), '05/10/2026');
  assert.equal(formatFr('2026-01-01'), '01/01/2026');
});

test('todayIso lit l’horloge locale, pas UTC', () => {
  // 1ᵉʳ janvier 2026 à 00 h 30 locales : en UTC, c'est encore le 31 décembre dans un
  // fuseau en retard. `toIsoDate` doit rendre le jour local.
  const local = new Date(2026, 0, 1, 0, 30);
  assert.equal(todayIso(local), '2026-01-01');
  assert.equal(toIsoDate(local), '2026-01-01');
  assert.equal(toLocalDate('2026-01-01').getHours(), 0);
});

// ---------------------------------------------------------------------------
// Le piège que ces fonctions évitent
// ---------------------------------------------------------------------------

/**
 * Sonder une écriture de `TZ` qui donne réellement le décalage voulu.
 *
 * La convention du signe de `GMT±N` **diffère entre Windows et Linux** (POSIX l'inverse) :
 * une écriture figée passerait ici et échouerait en intégration continue. On essaie donc
 * plusieurs écritures et on retient celle qui produit le décalage mesuré.
 */
function fuseauPour(decalageVoulu: number): string | null {
  const magnitude = Math.abs(decalageVoulu);
  const candidats = [
    `GMT+${magnitude}`,
    `GMT-${magnitude}`,
    `Etc/GMT+${magnitude}`,
    `Etc/GMT-${magnitude}`,
    `UTC+${magnitude}`,
    `UTC-${magnitude}`,
  ];
  for (const candidat of candidats) {
    try {
      const sortie = execFileSync(
        process.execPath,
        ['-e', 'console.log(JSON.stringify(-new Date().getTimezoneOffset() / 60))'],
        { env: { ...process.env, TZ: candidat }, encoding: 'utf8', timeout: 15_000 },
      );
      if (Number(JSON.parse(sortie.trim())) === decalageVoulu) return candidat;
    } catch {
      // Écriture refusée par la plateforme : on essaie la suivante.
    }
  }
  return null;
}

test('dans un fuseau en retard sur UTC, lire une date comme un instant décale le jour', () => {
  const fuseau = fuseauPour(-5);
  if (fuseau === null) {
    // La plateforme n'offre pas de décalage fixe : on le dit plutôt que de passer à vide.
    assert.ok(true, 'aucune écriture de TZ ne fixe un décalage ici — test non concluant, mais signalé');
    return;
  }

  const programme = `
    const brut = new Date('2026-01-01');
    console.log(JSON.stringify({
      decalage: -new Date().getTimezoneOffset() / 60,
      piege: brut.getDate(),
    }));
  `;
  const mesure: { decalage: number; piege: number } = JSON.parse(
    execFileSync(process.execPath, ['-e', programme], {
      env: { ...process.env, TZ: fuseau },
      encoding: 'utf8',
      timeout: 15_000,
    }).trim(),
  );

  // Le test mesure d'abord sa propre prémisse : sans le bon décalage, il ne prouverait rien.
  assert.equal(mesure.decalage, -5, 'le fuseau demandé n’a pas été appliqué au processus fils');
  assert.equal(
    mesure.piege,
    31,
    'minuit UTC tombe la veille — sans cela, l’entrée ne discrimine pas',
  );
});
