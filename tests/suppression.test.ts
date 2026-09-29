/**
 * La règle de retrait d'une fiche.
 *
 * Ce qui se teste ici n'est pas un affichage mais une **décision** : refuse-t-on, ou
 * archive-t-on ? Et la phrase le dit-elle exactement ? Un message faux sur un geste qui
 * masque des données coûte plus cher qu'un bouton mal placé.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { liens, totalLiens, verdictSuppression } from '@/domain/suppression';

test('une location en cours fait refuser, et le dit comme le formulaire', () => {
  const verdict = verdictSuppression('vehicule', 'Peugeot 208', liens({ locationsEnCours: 1 }));
  assert.equal(verdict.kind, 'refus');
  assert.equal(
    verdict.kind === 'refus' ? verdict.message : '',
    'Ce véhicule a une location en cours : terminez-la avant de l’archiver.',
  );
});

test('le refus s’accorde au locataire', () => {
  const verdict = verdictSuppression('locataire', 'Amine B.', liens({ locationsEnCours: 2 }));
  assert.equal(verdict.kind, 'refus');
  assert.equal(
    verdict.kind === 'refus' ? verdict.message : '',
    'Ce locataire a une location en cours : terminez-la avant de l’archiver.',
  );
});

test('le refus l’emporte même quand tout le reste est vide', () => {
  // Une seule location en cours, et rien d'autre : c'est le cas d'un véhicule qui vient
  // de partir. S'il passait, la location resterait à désigner un véhicule introuvable.
  const verdict = verdictSuppression('vehicule', 'Clio', liens({ locationsEnCours: 1, locations: 1 }));
  assert.equal(verdict.kind, 'refus');
});

test('une fiche sans aucune donnée est archivée, et le message le dit', () => {
  const verdict = verdictSuppression('vehicule', 'Peugeot 208', liens());
  assert.equal(verdict.kind, 'archivage');
  if (verdict.kind !== 'archivage') return;
  assert.equal(verdict.titre, 'Retirer ce véhicule ?');
  assert.equal(verdict.libelle, 'Archiver');
  assert.equal(
    verdict.message,
    '« Peugeot 208 » ne porte aucune donnée. Il sera archivé : masqué des listes, et restaurable à tout moment.',
  );
});

test('les familles rattachées sont annoncées, avec le bon pluriel', () => {
  const verdict = verdictSuppression(
    'locataire',
    'Amine B.',
    liens({ locations: 3, echeances: 12, depenses: 1 }),
  );
  assert.equal(verdict.kind, 'archivage');
  if (verdict.kind !== 'archivage') return;
  // 12, 3 puis 1 : du plus lourd au plus léger.
  assert.equal(
    verdict.message,
    '« Amine B. » porte 12 échéances, 3 locations et 1 dépense. Il sera archivé : masqué des listes, son historique est conservé et vous pourrez le restaurer.',
  );
});

test('une famille à zéro n’est pas annoncée du tout', () => {
  const verdict = verdictSuppression('vehicule', 'Clio', liens({ echeances: 2 }));
  assert.equal(verdict.kind, 'archivage');
  if (verdict.kind !== 'archivage') return;
  assert.match(verdict.message, /porte 2 échéances\./);
  assert.doesNotMatch(verdict.message, /location/);
  assert.doesNotMatch(verdict.message, /dépense/);
});

test('deux familles s’énumèrent sans virgule avant « et »', () => {
  const verdict = verdictSuppression('vehicule', 'Clio', liens({ locations: 2, entretiens: 1 }));
  assert.equal(verdict.kind, 'archivage');
  if (verdict.kind !== 'archivage') return;
  assert.match(verdict.message, /porte 2 locations et 1 entretien\./);
  assert.doesNotMatch(verdict.message, /, et /);
});

test('un nom vide ne produit pas de guillemets vides', () => {
  const verdict = verdictSuppression('locataire', '   ', liens({ documents: 1 }));
  assert.equal(verdict.kind, 'archivage');
  if (verdict.kind !== 'archivage') return;
  assert.match(verdict.message, /^Cette fiche porte 1 document\./);
  assert.doesNotMatch(verdict.message, /«\s*»/);
});

test('le titre nomme la cible', () => {
  const vehicule = verdictSuppression('vehicule', 'Clio', liens());
  const locataire = verdictSuppression('locataire', 'Amine', liens());
  assert.equal(vehicule.kind === 'archivage' ? vehicule.titre : '', 'Retirer ce véhicule ?');
  assert.equal(locataire.kind === 'archivage' ? locataire.titre : '', 'Retirer ce locataire ?');
});

test('totalLiens additionne les six familles, et locationsEnCours n’en fait pas partie', () => {
  // `locationsEnCours` est un signal de refus, pas un volume : la compter ferait
  // apparaître une location deux fois dans le message.
  const valeurs = liens({
    locationsEnCours: 4,
    locations: 4,
    echeances: 10,
    depenses: 2,
    entretiens: 1,
    documents: 3,
    autres: 5,
  });
  assert.equal(totalLiens(valeurs), 25);
});

test('liens() comble les familles non citées par des zéros', () => {
  const valeurs = liens({ depenses: 7 });
  assert.deepEqual(valeurs, {
    locationsEnCours: 0,
    locations: 0,
    echeances: 0,
    depenses: 7,
    entretiens: 0,
    documents: 0,
    autres: 0,
  });
});
