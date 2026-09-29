/**
 * Contrat de location : variables, texte et HTML imprimable.
 *
 * Le texte juridique n'est **pas** dans ce fichier. Il est semé en base sous forme de
 * clauses, que le propriétaire modifie, active ou supprime. Ce module se contente de :
 *
 * 1. construire le dictionnaire de variables (`{{locataire.nom}}`…) depuis les données ;
 * 2. substituer ces variables dans le corps des clauses ;
 * 3. mettre en page le document.
 *
 * Conséquence utile : une clause ajoutée demain n'exige aucune modification du code.
 */

import { formatLongFr, formatFr, formatDateTimeFr, relativeDaysLabel, daysBetween } from './dates';
import { formatMoney, formatKm, formatPercent } from './money';
import { escapeHtml, htmlDocument, interpolate } from './html';
import type { DocumentStatus, IsoDate } from './types';

export interface ContractOwnerView {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  phone: string;
  email: string;
  siret: string;
  extra: string;
}

export interface ContractTenantView {
  firstName: string;
  lastName: string;
  birthDate: IsoDate | null;
  address: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseDate: IsoDate | null;
  vtcNumber: string;
}

export interface ContractVehicleView {
  brand: string;
  model: string;
  trim: string;
  year: number | null;
  plate: string;
  vin: string;
  fuelLabel: string;
  currentMileageKm: number;
}

export interface ContractTermsView {
  startDate: IsoDate;
  endDate: IsoDate | null;
  openEnded: boolean;
  rentAmountCents: number;
  frequencyLabel: string;
  /** « chaque lundi », « le 5 de chaque mois », « tous les 7 jours ». */
  dueLabel: string;
  depositCents: number;
  allowedKm: number | null;
  excessKmPriceCents: number;
  feesCents: number;
  startMileageKm: number;
}

export interface ContractClauseView {
  title: string;
  body: string;
}

export interface ContractSignatureView {
  owner: string | null;
  tenant: string | null;
  signedAt: string | null;
}

export interface ContractRenderInput {
  reference: string;
  generatedAt: string;
  currency: string;
  owner: ContractOwnerView;
  tenant: ContractTenantView;
  vehicle: ContractVehicleView;
  terms: ContractTermsView;
  clauses: readonly ContractClauseView[];
  documents: readonly { label: string; status: DocumentStatus | 'absent' }[];
  signatures: ContractSignatureView;
  today: IsoDate;
}

function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function ownerDisplayName(owner: ContractOwnerView): string {
  const person = fullName(owner);
  if (owner.company.trim() === '') return person;
  return person === '' ? owner.company : `${person} — ${owner.company}`;
}

/** Durée en jours puis en mois, telle qu'on l'écrit dans un contrat. */
export function durationSentence(startDate: IsoDate, endDate: IsoDate | null, openEnded: boolean, today: IsoDate): string {
  if (openEnded || endDate === null) {
    const elapsed = daysBetween(startDate, today);
    return `Elle est conclue sans date de fin ; à ce jour elle court depuis ${elapsed} jours.`;
  }
  const days = daysBetween(startDate, endDate);
  const months = Math.round((days / 30.4375) * 10) / 10;
  return `Elle court du ${formatFr(startDate)} au ${formatFr(endDate)}, soit ${days} jours (environ ${String(months).replace('.', ',')} mois).`;
}

/** Construit le dictionnaire des variables substituables dans les clauses. */
export function buildContractVariables(input: ContractRenderInput): Record<string, string> {
  const { owner, tenant, vehicle, terms } = input;
  const currency = input.currency;

  const mileageSentence =
    terms.allowedKm === null
      ? 'Le kilométrage autorisé est illimité sur la durée de la location.'
      : `Le kilométrage autorisé sur la durée de la location est de ${formatKm(terms.allowedKm)}.`;

  const excessSentence =
    terms.excessKmPriceCents === 0
      ? 'Aucun dépassement kilométrique ne sera facturé.'
      : `Tout kilomètre supplémentaire est facturé ${formatMoney(terms.excessKmPriceCents, { currency })}.`;

  const vehicleDescription = [vehicle.brand, vehicle.model, vehicle.trim].filter((part) => part.trim() !== '').join(' ');

  return {
    reference: input.reference,
    date: formatLongFr(input.today),
    dateCourte: formatFr(input.today),
    'loueur.nom': ownerDisplayName(owner),
    'loueur.prenom': owner.firstName,
    'loueur.nomFamille': owner.lastName,
    'loueur.societe': owner.company,
    'loueur.adresse': owner.address,
    'loueur.telephone': owner.phone,
    'loueur.email': owner.email,
    'loueur.siret': owner.siret,
    'locataire.nom': fullName(tenant),
    'locataire.prenom': tenant.firstName,
    'locataire.nomFamille': tenant.lastName,
    'locataire.adresse': tenant.address,
    'locataire.telephone': tenant.phone,
    'locataire.email': tenant.email,
    'locataire.permis': tenant.licenseNumber,
    'locataire.carteVtc': tenant.vtcNumber,
    'vehicule.description': vehicleDescription,
    'vehicule.immatriculation': vehicle.plate,
    'vehicule.vin': vehicle.vin,
    'vehicule.kmDepart': formatKm(terms.startMileageKm),
    'vehicule.kmActuel': formatKm(vehicle.currentMileageKm),
    'location.debut': formatFr(terms.startDate),
    'location.fin': terms.openEnded || terms.endDate === null ? ', sans date de fin,' : ` et se termine le ${formatFr(terms.endDate)}`,
    'location.duree': durationSentence(terms.startDate, terms.endDate, terms.openEnded, input.today),
    'location.loyer': `${formatMoney(terms.rentAmountCents, { currency })} ${terms.frequencyLabel.toLowerCase()}`,
    'location.frequence': terms.frequencyLabel.toLowerCase(),
    'location.echeance': terms.dueLabel,
    'location.caution': formatMoney(terms.depositCents, { currency }),
    'location.kilometrage': mileageSentence,
    'location.prixKmSupplementaire': excessSentence,
    'location.frais': terms.feesCents === 0 ? 'sans frais annexes' : `${formatMoney(terms.feesCents, { currency })} de frais annexes`,
  };
}

/** Substitue les variables dans le corps d'une clause. */
export function renderClauseBody(body: string, variables: Readonly<Record<string, string>>): string {
  return interpolate(body, variables);
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

export interface SignaturePayload {
  width: number;
  height: number;
  /** Tracés au format SVG, dans le repère 0–1000 × 0–400. */
  paths: string[];
}

const SIGNATURE_VIEWBOX_WIDTH = 1000;
const SIGNATURE_VIEWBOX_HEIGHT = 400;

/** Relit une signature stockée. Une valeur illisible rend `null` plutôt que de lever. */
export function parseSignature(raw: string | null): SignaturePayload | null {
  if (raw === null || raw.trim() === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as { width?: unknown; height?: unknown; paths?: unknown };
    if (!Array.isArray(candidate.paths)) return null;
    const paths = candidate.paths.filter((path): path is string => typeof path === 'string');
    if (paths.length === 0) return null;
    return {
      width: typeof candidate.width === 'number' ? candidate.width : SIGNATURE_VIEWBOX_WIDTH,
      height: typeof candidate.height === 'number' ? candidate.height : SIGNATURE_VIEWBOX_HEIGHT,
      paths,
    };
  } catch {
    return null;
  }
}

/** Rend une signature en SVG, ou un cadre vide si elle n'existe pas encore. */
export function signatureSvg(raw: string | null, heightMm: number): string {
  const payload = parseSignature(raw);
  if (payload === null) {
    return `<div class="frame"><span class="muted small">Non signé</span></div>`;
  }
  const strokes = payload.paths
    .map(
      (path) =>
        `<path d="${escapeHtml(path)}" fill="none" stroke="#14171f" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />`,
    )
    .join('');
  return `<div class="frame" style="height:${heightMm}mm"><svg viewBox="0 0 ${SIGNATURE_VIEWBOX_WIDTH} ${SIGNATURE_VIEWBOX_HEIGHT}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%">${strokes}</svg></div>`;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------

const STATUS_CLASS: Record<DocumentStatus | 'absent', string> = {
  valide: 'ok',
  expire_bientot: 'warn',
  expire: 'danger',
  sans_echeance: 'neutral',
  absent: 'danger',
};

const STATUS_TEXT: Record<DocumentStatus | 'absent', string> = {
  valide: 'Valide',
  expire_bientot: 'Expire bientôt',
  expire: 'Expiré',
  sans_echeance: 'Sans échéance',
  absent: 'Manquant',
};

export function renderContractHtml(input: ContractRenderInput): string {
  const variables = buildContractVariables(input);
  const currency = input.currency;
  const { owner, tenant, vehicle, terms } = input;

  const ownerBlock = [
    `<strong>${escapeHtml(ownerDisplayName(owner) || 'Loueur')}</strong>`,
    owner.address === '' ? '' : escapeHtml(owner.address),
    owner.phone === '' ? '' : `Tél. ${escapeHtml(owner.phone)}`,
    owner.email === '' ? '' : escapeHtml(owner.email),
    owner.siret === '' ? '' : `SIRET ${escapeHtml(owner.siret)}`,
  ]
    .filter((line) => line !== '')
    .join('<br />');

  const tenantBlock = [
    `<strong>${escapeHtml(fullName(tenant) || 'Locataire')}</strong>`,
    tenant.birthDate === null ? '' : `Né(e) le ${escapeHtml(formatFr(tenant.birthDate))}`,
    tenant.address === '' ? '' : escapeHtml(tenant.address),
    tenant.phone === '' ? '' : `Tél. ${escapeHtml(tenant.phone)}`,
    tenant.email === '' ? '' : escapeHtml(tenant.email),
    tenant.licenseNumber === '' ? '' : `Permis n° ${escapeHtml(tenant.licenseNumber)}`,
    tenant.vtcNumber === '' ? '' : `Carte VTC n° ${escapeHtml(tenant.vtcNumber)}`,
  ]
    .filter((line) => line !== '')
    .join('<br />');

  const vehicleRows: [string, string][] = [
    ['Véhicule', [vehicle.brand, vehicle.model, vehicle.trim].filter((p) => p !== '').join(' ')],
    ['Année', vehicle.year === null ? '—' : String(vehicle.year)],
    ['Immatriculation', vehicle.plate],
    ['Numéro de châssis (VIN)', vehicle.vin],
    ['Énergie', vehicle.fuelLabel],
    ['Kilométrage au départ', formatKm(terms.startMileageKm)],
  ];

  const conditionRows: [string, string][] = [
    ['Date de début', formatFr(terms.startDate)],
    ['Date de fin', terms.openEnded || terms.endDate === null ? 'Sans date de fin' : formatFr(terms.endDate)],
    ['Loyer', `${formatMoney(terms.rentAmountCents, { currency })} ${terms.frequencyLabel.toLowerCase()}`],
    ["Jour d'échéance", terms.dueLabel],
    ['Dépôt de garantie', formatMoney(terms.depositCents, { currency })],
    ['Kilométrage autorisé', terms.allowedKm === null ? 'Illimité' : formatKm(terms.allowedKm)],
    ['Dépassement kilométrique', terms.excessKmPriceCents === 0 ? 'Non facturé' : `${formatMoney(terms.excessKmPriceCents, { currency })} / km`],
    ['Frais annexes', terms.feesCents === 0 ? 'Aucun' : formatMoney(terms.feesCents, { currency })],
  ];

  const clauseHtml = input.clauses
    .map(
      (clause, index) => `<div class="clause">
      <h3>Article ${index + 1} — ${escapeHtml(clause.title)}</h3>
      <p>${escapeHtml(renderClauseBody(clause.body, variables))}</p>
    </div>`,
    )
    .join('');

  const documentsHtml =
    input.documents.length === 0
      ? '<p class="muted small">Aucun document justificatif n’a été joint à ce contrat.</p>'
      : `<table><thead><tr><th>Document</th><th>État au ${escapeHtml(formatFr(input.today))}</th></tr></thead><tbody>${input.documents
          .map(
            (document) =>
              `<tr><td>${escapeHtml(document.label)}</td><td><span class="badge ${STATUS_CLASS[document.status]}">${STATUS_TEXT[document.status]}</span></td></tr>`,
          )
          .join('')}</tbody></table>`;

  const signedNote =
    input.signatures.signedAt === null
      ? ''
      : `<p class="small muted">Signé électroniquement le ${escapeHtml(formatDateTimeFr(input.signatures.signedAt))}.</p>`;

  const body = `
  <div class="doc-header">
    <div class="party">${ownerBlock}</div>
    <div class="party" style="text-align:right">${tenantBlock}</div>
  </div>

  <div class="doc-title">
    <div class="kicker">Contrat de location de véhicule</div>
    <h1>${escapeHtml([vehicle.brand, vehicle.model].filter((p) => p !== '').join(' '))}</h1>
    <div class="reference">Référence ${escapeHtml(input.reference)} — établi le ${escapeHtml(formatLongFr(input.today))}</div>
  </div>

  <h2>1. Parties</h2>
  <div class="grid">
    <div class="box">
      <h3>Le loueur</h3>
      <p class="small">${ownerBlock}</p>
    </div>
    <div class="box">
      <h3>Le locataire</h3>
      <p class="small">${tenantBlock}</p>
    </div>
  </div>

  <h2>2. Véhicule loué</h2>
  ${tableFrom(vehicleRows)}

  <h2>3. Conditions financières et durée</h2>
  ${tableFrom(conditionRows)}

  <h2>4. Documents justificatifs du locataire</h2>
  ${documentsHtml}

  <div class="page-break"></div>
  <h2>5. Conditions générales</h2>
  ${clauseHtml}

  <h2>6. Signatures</h2>
  <p class="small">Fait à ${escapeHtml(owner.address.split('\n')[0] ?? '')}, le ${escapeHtml(formatLongFr(input.today))}, en deux exemplaires originaux.</p>
  <div class="signatures">
    <div class="signature">
      <div class="caption">Le loueur</div>
      <div class="name">${escapeHtml(ownerDisplayName(owner))}</div>
      ${signatureSvg(input.signatures.owner, 30)}
      <div class="caption">${escapeHtml(owner.firstName)} ${escapeHtml(owner.lastName)}</div>
    </div>
    <div class="signature">
      <div class="caption">Le locataire — « Lu et approuvé »</div>
      <div class="name">${escapeHtml(fullName(tenant))}</div>
      ${signatureSvg(input.signatures.tenant, 30)}
      <div class="caption">${escapeHtml(tenant.firstName)} ${escapeHtml(tenant.lastName)}</div>
    </div>
  </div>
  ${signedNote}

  <div class="footer">
    Contrat ${escapeHtml(input.reference)} généré par l’application de gestion de flotte le ${escapeHtml(formatDateTimeFr(input.generatedAt))}.
    Les clauses reproduites ci-dessus sont celles en vigueur à cette date.
  </div>`;

  return htmlDocument({ title: `Contrat ${input.reference}`, body });
}

function tableFrom(rows: readonly (readonly [string, string])[]): string {
  const body = rows
    .map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td class="value">${escapeHtml(value)}</td></tr>`)
    .join('');
  return `<table class="totals">${body}</table>`;
}

/** Résumé d'une clause désactivée, pour laisser une trace dans l'aperçu. */
export function clausePreview(body: string, variables: Readonly<Record<string, string>>, length = 160): string {
  const rendered = renderClauseBody(body, variables);
  return rendered.length <= length ? rendered : `${rendered.slice(0, length - 1)}…`;
}

/** Phrase d'aide affichée quand une clause contient une variable inconnue. */
export function unknownVariables(body: string, variables: Readonly<Record<string, string>>): string[] {
  const found = new Set<string>();
  const pattern = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
  let match = pattern.exec(body);
  while (match !== null) {
    const key = match[1];
    if (key !== undefined && variables[key] === undefined) found.add(key);
    match = pattern.exec(body);
  }
  return [...found];
}

/** Liste des variables disponibles, pour l'aide à la saisie dans les paramètres. */
export function availableVariableNames(): string[] {
  const sample = buildContractVariables({
    reference: 'CT-0000-0000',
    generatedAt: new Date(0).toISOString(),
    currency: '€',
    today: '2000-01-01',
    owner: { firstName: '', lastName: '', company: '', address: '', phone: '', email: '', siret: '', extra: '' },
    tenant: {
      firstName: '',
      lastName: '',
      birthDate: null,
      address: '',
      phone: '',
      email: '',
      licenseNumber: '',
      licenseDate: null,
      vtcNumber: '',
    },
    vehicle: { brand: '', model: '', trim: '', year: null, plate: '', vin: '', fuelLabel: '', currentMileageKm: 0 },
    terms: {
      startDate: '2000-01-01',
      endDate: null,
      openEnded: true,
      rentAmountCents: 0,
      frequencyLabel: '',
      dueLabel: '',
      depositCents: 0,
      allowedKm: null,
      excessKmPriceCents: 0,
      feesCents: 0,
      startMileageKm: 0,
    },
    clauses: [],
    documents: [],
    signatures: { owner: null, tenant: null, signedAt: null },
  });
  return Object.keys(sample).sort();
}

/** Utilisé par l'aperçu : un libellé court d'échéance relative. */
export function expiryHint(expiryDate: IsoDate | null, today: IsoDate): string {
  if (expiryDate === null) return 'sans échéance';
  return relativeDaysLabel(daysBetween(today, expiryDate));
}

/** Formatage d'un pourcentage utilisé dans les bilans. */
export function percentText(value: number | null): string {
  return value === null ? '—' : formatPercent(value);
}
