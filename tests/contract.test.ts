import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  availableVariableNames,
  buildContractVariables,
  durationSentence,
  parseSignature,
  renderClauseBody,
  renderContractHtml,
  signatureSvg,
  unknownVariables,
  type ContractRenderInput,
} from '@/domain/contract';
import { interpolate } from '@/domain/html';

function input(overrides: Partial<ContractRenderInput> = {}): ContractRenderInput {
  return {
    reference: 'CT-2026-0007',
    generatedAt: '2026-10-05T10:30:00.000Z',
    currency: '€',
    today: '2026-10-05',
    owner: {
      firstName: 'Sofiane',
      lastName: 'B.',
      company: 'SB Location',
      address: '1 rue du Marché\n95300 Pontoise',
      phone: '06 00 00 00 00',
      email: 'contact@example.fr',
      siret: '123 456 789 00012',
      extra: '',
    },
    tenant: {
      firstName: 'Ahmed',
      lastName: 'Benali',
      birthDate: '1988-04-17',
      address: '12 rue des Acacias\n95300 Pontoise',
      phone: '06 12 45 78 90',
      email: 'ahmed.benali@example.fr',
      licenseNumber: '881204517830',
      licenseDate: '2007-06-12',
      vtcNumber: 'VTC-2023-114872',
    },
    vehicle: {
      brand: 'Toyota',
      model: 'Corolla',
      trim: 'Touring Sports',
      year: 2021,
      plate: 'GK-482-LM',
      vin: 'SB1KZ3JE00E123456',
      fuelLabel: 'Hybride',
      currentMileageKm: 125_400,
    },
    terms: {
      startDate: '2026-10-05',
      endDate: null,
      openEnded: true,
      rentAmountCents: 30_000,
      frequencyLabel: 'Chaque semaine',
      dueLabel: 'chaque lundi',
      depositCents: 60_000,
      allowedKm: null,
      excessKmPriceCents: 0,
      feesCents: 0,
      startMileageKm: 118_000,
    },
    clauses: [
      { title: 'Objet', body: 'Le loueur {{loueur.nom}} loue à {{locataire.nom}} le véhicule {{vehicule.immatriculation}}.' },
      { title: 'Loyer', body: 'Loyer de {{location.loyer}}, exigible {{location.echeance}}.' },
    ],
    documents: [
      { label: 'Permis de conduire', status: 'valide' },
      { label: 'Assurance', status: 'absent' },
    ],
    signatures: { owner: null, tenant: null, signedAt: null },
    ...overrides,
  };
}

test('les variables reprennent les informations du loueur, du locataire et du véhicule', () => {
  const variables = buildContractVariables(input());
  assert.equal(variables['loueur.nom'], 'Sofiane B. — SB Location');
  assert.equal(variables['locataire.nom'], 'Ahmed Benali');
  assert.equal(variables['vehicule.immatriculation'], 'GK-482-LM');
  assert.equal(variables['vehicule.vin'], 'SB1KZ3JE00E123456');
  assert.equal(variables['vehicule.kmDepart'], '118\u202F000\u202Fkm');
  assert.equal(variables['location.loyer'], '300,00\u202F€ chaque semaine');
  assert.equal(variables['location.caution'], '600,00\u202F€');
  assert.equal(variables['location.debut'], '05/10/2026');
});

test('le texte d’une clause est substitué, et une variable inconnue reste visible', () => {
  const variables = buildContractVariables(input());
  const rendu = renderClauseBody('Le loueur {{loueur.nom}} loue à {{locataire.nom}}.', variables);
  assert.equal(rendu, 'Le loueur Sofiane B. — SB Location loue à Ahmed Benali.');

  // Une coquille dans un gabarit doit se voir sur le PDF, pas disparaître en silence.
  assert.equal(renderClauseBody('{{clause.inconnue}}', variables), '{{clause.inconnue}}');
  assert.deepEqual(unknownVariables('{{loueur.nom}} et {{oups}}', variables), ['oups']);
});

test('interpolate accepte les espaces autour du nom de variable', () => {
  assert.equal(interpolate('{{ nom }}', { nom: 'Ahmed' }), 'Ahmed');
  assert.equal(interpolate('{{nom}}', { nom: 'Ahmed' }), 'Ahmed');
});

test('la durée s’écrit différemment selon que la location a une fin ou non', () => {
  assert.equal(
    durationSentence('2026-10-05', null, true, '2026-10-19'),
    'Elle est conclue sans date de fin ; à ce jour elle court depuis 14 jours.',
  );
  assert.equal(
    durationSentence('2026-10-05', '2026-11-30', false, '2026-10-19'),
    'Elle court du 05/10/2026 au 30/11/2026, soit 56 jours (environ 1,8 mois).',
  );
});

test('le contrat généré contient les informations attendues', () => {
  const html = renderContractHtml(input());
  assert.match(html, /Contrat de location de véhicule/);
  assert.match(html, /CT-2026-0007/);
  assert.match(html, /GK-482-LM/);
  assert.match(html, /SB1KZ3JE00E123456/);
  assert.match(html, /Ahmed Benali/);
  assert.match(html, /SB Location/);
  assert.match(html, /118\u202F000\u202Fkm/);
  assert.match(html, /Article 1 — Objet/);
  assert.match(html, /Le loueur Sofiane B\. — SB Location loue à Ahmed Benali/);
  assert.match(html, /Sans date de fin/);
});

test('le contrat échappe le HTML des saisies', () => {
  const html = renderContractHtml(
    input({
      clauses: [{ title: 'Note', body: 'Valeur saisie' }],
      tenant: { ...input().tenant, lastName: '<script>alert(1)</script>' },
    }),
  );
  assert.ok(!html.includes('<script>'), 'aucune balise saisie ne doit se retrouver dans le document');
  assert.match(html, /&lt;script&gt;/);
});

test('le contrat indique l’état des documents justificatifs', () => {
  const html = renderContractHtml(input());
  assert.match(html, /Permis de conduire/);
  assert.match(html, /badge ok[^>]*>Valide/);
  assert.match(html, /badge danger[^>]*>Manquant/);
});

test('les clauses de kilométrage s’adaptent au contrat', () => {
  const illimite = buildContractVariables(input());
  assert.equal(illimite['location.kilometrage'], 'Le kilométrage autorisé est illimité sur la durée de la location.');
  assert.equal(illimite['location.prixKmSupplementaire'], 'Aucun dépassement kilométrique ne sera facturé.');

  const limite = buildContractVariables(
    input({
      terms: { ...input().terms, allowedKm: 12_000, excessKmPriceCents: 25 },
    }),
  );
  assert.match(limite['location.kilometrage'] ?? '', /12\u202F000\u202Fkm/);
  assert.equal(limite['location.prixKmSupplementaire'], 'Tout kilomètre supplémentaire est facturé 0,25\u202F€.');
});

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

const SIGNATURE = JSON.stringify({ width: 1000, height: 400, paths: ['M 10 10 L 20 20'] });

test('une signature stockée se relit, une signature absente ou illisible rend null', () => {
  assert.deepEqual(parseSignature(SIGNATURE), { width: 1000, height: 400, paths: ['M 10 10 L 20 20'] });
  assert.equal(parseSignature(null), null);
  assert.equal(parseSignature(''), null);
  assert.equal(parseSignature('{ pas du json'), null);
  assert.equal(parseSignature('{"paths":[]}'), null, 'une signature sans tracé n’est pas une signature');
});

test('une signature absente est signalée comme telle, pas laissée vide', () => {
  const vide = signatureSvg(null, 30);
  assert.match(vide, /Non signé/);

  const signee = signatureSvg(SIGNATURE, 30);
  assert.match(signee, /<svg/);
  assert.match(signee, /M 10 10 L 20 20/);
});

test('une signature est intégrée au contrat signé', () => {
  const html = renderContractHtml(
    input({ signatures: { owner: SIGNATURE, tenant: SIGNATURE, signedAt: '2026-10-05T11:00:00.000Z' } }),
  );
  assert.match(html, /Signé électroniquement le 05\/10\/2026 à \d{2}:\d{2}/);
  assert.ok(!html.includes('Non signé'));
});

test('la liste des variables disponibles sert d’aide à la saisie', () => {
  const names = availableVariableNames();
  assert.ok(names.includes('loueur.nom'));
  assert.ok(names.includes('locataire.prenom'));
  assert.ok(names.includes('vehicule.immatriculation'));
  assert.ok(names.includes('location.loyer'));
  assert.ok(names.includes('location.kilometrage'));
  assert.equal(names.length, new Set(names).size, 'aucun doublon');
});
