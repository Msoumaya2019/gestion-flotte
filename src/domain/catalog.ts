/**
 * Catalogues par défaut et libellés d'état.
 *
 * Tout ce qui est « par défaut » ici est **modifiable par le propriétaire** : les
 * catalogues sont semés en base à la première ouverture, puis vivent leur vie. Les
 * libellés d'état, eux, sont du vocabulaire d'affichage : ils restent dans le code.
 *
 * Aucune fréquence d'entretien n'est imposée : `intervalKm` et `intervalMonths` sont des
 * propositions de départ, que le propriétaire remplace par ce qu'il veut.
 */

import type { IconName } from './iconNames';
import type {
  AmortizationMethod,
  ContractStatus,
  DocumentStatus,
  FuelType,
  MaintenanceIntervalMode,
  NotificationKind,
  PaymentFrequency,
  PaymentStatus,
  RentalStatus,
  VehicleStatus,
} from './types';

/** Ton sémantique : l'interface le traduit en couleur. */
export type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info' | 'accent';

export interface Labeled {
  label: string;
  tone: Tone;
}

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, Labeled> = {
  disponible: { label: 'Disponible', tone: 'ok' },
  loue: { label: 'Loué', tone: 'accent' },
  entretien: { label: 'En entretien', tone: 'warn' },
  reparation: { label: 'En réparation', tone: 'warn' },
  indisponible: { label: 'Indisponible', tone: 'neutral' },
  vendu: { label: 'Vendu', tone: 'neutral' },
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, Labeled> = {
  a_venir: { label: 'À venir', tone: 'neutral' },
  paye: { label: 'Payé', tone: 'ok' },
  partiel: { label: 'Partiellement payé', tone: 'warn' },
  retard: { label: 'En retard', tone: 'danger' },
  impaye: { label: 'Impayé', tone: 'danger' },
  annule: { label: 'Annulé', tone: 'neutral' },
};

export const RENTAL_STATUS_LABELS: Record<RentalStatus, Labeled> = {
  prevue: { label: 'Prévue', tone: 'info' },
  active: { label: 'En cours', tone: 'accent' },
  terminee: { label: 'Terminée', tone: 'neutral' },
  annulee: { label: 'Annulée', tone: 'neutral' },
};

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, Labeled> = {
  brouillon: { label: 'Brouillon', tone: 'neutral' },
  genere: { label: 'Généré', tone: 'info' },
  signe: { label: 'Signé', tone: 'ok' },
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus | 'absent', Labeled> = {
  valide: { label: 'Valide', tone: 'ok' },
  expire_bientot: { label: 'Expire bientôt', tone: 'warn' },
  expire: { label: 'Expiré', tone: 'danger' },
  sans_echeance: { label: 'Sans échéance', tone: 'info' },
  absent: { label: 'Absent', tone: 'danger' },
};

export const FREQUENCY_LABELS: Record<PaymentFrequency, string> = {
  hebdomadaire: 'Chaque semaine',
  bimensuel: 'Toutes les 2 semaines',
  mensuel: 'Chaque mois',
  personnalisee: 'Personnalisée',
};

/**
 * Énergies.
 *
 * Ces libellés manquaient, et leur absence se voyait à deux endroits : le contrat recevait
 * `fuelLabel` sans que personne ne le produise, et les écrans affichaient la valeur brute
 * de l'énumération — « hybride_rechargeable », avec son tiret bas.
 */
export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  essence: 'Essence',
  diesel: 'Diesel',
  hybride: 'Hybride',
  hybride_rechargeable: 'Hybride rechargeable',
  electrique: 'Électrique',
  gpl: 'GPL',
  autre: 'Autre',
};

export const AMORTIZATION_METHOD_LABELS: Record<AmortizationMethod, string> = {
  lineaire: 'Linéaire',
  degressif: 'Dégressif',
};

export const INTERVAL_MODE_LABELS: Record<MaintenanceIntervalMode, string> = {
  kilometrage: 'Au kilométrage',
  temps: 'Au temps',
  mixte: 'Kilométrage ou temps',
};

export const PAYER_TYPE_LABELS: Record<string, string> = {
  locataire: 'Locataire',
  societe: 'Société',
  autre_personne: 'Autre personne',
  autre: 'Autre',
};

export const DAMAGE_TYPE_LABELS: Record<string, string> = {
  rayure: 'Rayure',
  bosse: 'Bosse',
  choc: 'Choc',
  jante: 'Jante abîmée',
  pare_brise: 'Pare-brise',
  interieur: 'Intérieur',
  autre: 'Autre',
};

export const DEPOSIT_OUTCOME_LABELS: Record<string, string> = {
  restituee: 'Caution restituée',
  partielle: 'Caution partiellement retenue',
  retenue: 'Caution totalement retenue',
};

export const SOURCE_LABELS: Record<string, string> = {
  manuel: 'Saisie manuelle',
  entretien: 'Entretien',
  etat_des_lieux: 'État des lieux',
  location: 'Location',
  achat: 'Achat',
};

/**
 * Natures de rappel.
 *
 * Elles manquaient : `NOTIFICATION_KINDS` existait dans les types sans libellé français,
 * et l'écran des rappels n'avait donc aucun moyen de dire de quoi parlait une échéance
 * sans répéter la phrase du rappel lui-même.
 *
 * Le ton suit l'urgence réelle : un loyer déjà en retard ou un entretien dépassé sont des
 * manques, pas des avertissements — ils passent en rouge. Un loyer à échoir ou un retour
 * de location à venir sont de l'information, pas une alerte.
 */
export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, Labeled> = {
  loyer_jour: { label: 'Loyer à échoir', tone: 'info' },
  loyer_retard: { label: 'Loyer en retard', tone: 'danger' },
  assurance: { label: 'Assurance', tone: 'warn' },
  controle_technique: { label: 'Contrôle technique', tone: 'warn' },
  document_vehicule: { label: 'Document du véhicule', tone: 'warn' },
  document_locataire: { label: 'Document du locataire', tone: 'warn' },
  entretien_proche: { label: 'Entretien à prévoir', tone: 'warn' },
  entretien_depasse: { label: 'Entretien dépassé', tone: 'danger' },
  retour_location: { label: 'Retour de location', tone: 'info' },
};

// ---------------------------------------------------------------------------
// Catalogues semés en base
// ---------------------------------------------------------------------------

export interface CategorySeed {
  label: string;
  icon: IconName;
}

export const DEFAULT_EXPENSE_CATEGORIES: readonly CategorySeed[] = [
  { label: 'Entretien', icon: 'wrench' },
  { label: 'Mécanique', icon: 'gauge' },
  { label: 'Pneus', icon: 'tire' },
  { label: 'Assurance', icon: 'shield' },
  { label: 'Crédit', icon: 'banknote' },
  { label: 'Financement', icon: 'percent' },
  { label: 'Nettoyage', icon: 'droplet' },
  { label: 'Transport', icon: 'truck' },
  { label: 'Carte grise', icon: 'file-text' },
  { label: 'Contrôle technique', icon: 'clipboard' },
  { label: 'Stationnement', icon: 'map-pin' },
  { label: 'Sinistre', icon: 'alert-triangle' },
  { label: 'Carrosserie', icon: 'car' },
  { label: 'Dépannage', icon: 'alert-circle' },
  { label: 'Imprévu', icon: 'sparkles' },
  { label: 'Administratif', icon: 'folder' },
  { label: 'Autre', icon: 'tag' },
];

/** Catégories qui alimentent le poste « coût d'entretien » de la rentabilité. */
export const MAINTENANCE_CATEGORY_LABELS: readonly string[] = [
  'Entretien',
  'Mécanique',
  'Pneus',
  'Carrosserie',
  'Dépannage',
];

export const DEFAULT_PAYMENT_METHODS: readonly string[] = ['Espèces', 'Virement', 'Carte', 'Chèque', 'Autre'];

export interface MaintenanceTypeSeed {
  label: string;
  intervalMode: MaintenanceIntervalMode;
  intervalKm: number | null;
  intervalMonths: number | null;
  icon: IconName;
}

export const DEFAULT_MAINTENANCE_TYPES: readonly MaintenanceTypeSeed[] = [
  { label: 'Vidange', intervalMode: 'mixte', intervalKm: 20000, intervalMonths: 12, icon: 'droplet' },
  { label: "Filtre à huile", intervalMode: 'mixte', intervalKm: 20000, intervalMonths: 12, icon: 'filter' },
  { label: "Filtre à air", intervalMode: 'kilometrage', intervalKm: 30000, intervalMonths: null, icon: 'filter' },
  { label: 'Filtre habitacle', intervalMode: 'mixte', intervalKm: 20000, intervalMonths: 12, icon: 'filter' },
  { label: 'Pneus', intervalMode: 'kilometrage', intervalKm: 40000, intervalMonths: null, icon: 'tire' },
  { label: 'Plaquettes', intervalMode: 'kilometrage', intervalKm: 40000, intervalMonths: null, icon: 'gauge' },
  { label: 'Disques', intervalMode: 'kilometrage', intervalKm: 80000, intervalMonths: null, icon: 'gauge' },
  { label: 'Bougies', intervalMode: 'kilometrage', intervalKm: 60000, intervalMonths: null, icon: 'sparkles' },
  { label: 'Liquide de frein', intervalMode: 'temps', intervalKm: null, intervalMonths: 24, icon: 'droplet' },
  { label: 'Liquide de refroidissement', intervalMode: 'temps', intervalKm: null, intervalMonths: 48, icon: 'snowflake' },
  { label: 'Boîte de vitesses', intervalMode: 'kilometrage', intervalKm: 120000, intervalMonths: null, icon: 'wrench' },
  { label: 'Batterie', intervalMode: 'temps', intervalKm: null, intervalMonths: 60, icon: 'battery' },
  { label: 'Révision', intervalMode: 'mixte', intervalKm: 30000, intervalMonths: 24, icon: 'clipboard' },
  { label: 'Contrôle technique', intervalMode: 'temps', intervalKm: null, intervalMonths: 24, icon: 'shield-check' },
  { label: 'Autre', intervalMode: 'kilometrage', intervalKm: null, intervalMonths: null, icon: 'tag' },
];

export interface DocumentTypeSeed {
  label: string;
  scope: 'locataire' | 'vehicule';
  hasExpiry: boolean;
  requiredByDefault: boolean;
  icon: IconName;
}

export const DEFAULT_DOCUMENT_TYPES: readonly DocumentTypeSeed[] = [
  { label: 'Permis de conduire', scope: 'locataire', hasExpiry: true, requiredByDefault: true, icon: 'file-check' },
  { label: "Pièce d'identité", scope: 'locataire', hasExpiry: true, requiredByDefault: true, icon: 'user' },
  { label: 'Passeport', scope: 'locataire', hasExpiry: true, requiredByDefault: false, icon: 'file-text' },
  { label: 'Carte VTC', scope: 'locataire', hasExpiry: true, requiredByDefault: true, icon: 'car' },
  { label: "Attestation d'assurance", scope: 'locataire', hasExpiry: true, requiredByDefault: true, icon: 'shield' },
  { label: 'Justificatif de domicile', scope: 'locataire', hasExpiry: true, requiredByDefault: false, icon: 'map-pin' },
  { label: 'RIB', scope: 'locataire', hasExpiry: false, requiredByDefault: false, icon: 'banknote' },
  { label: 'KBIS', scope: 'locataire', hasExpiry: true, requiredByDefault: false, icon: 'folder' },
  { label: 'Carte grise', scope: 'vehicule', hasExpiry: false, requiredByDefault: false, icon: 'file-text' },
  { label: 'Assurance véhicule', scope: 'vehicule', hasExpiry: true, requiredByDefault: false, icon: 'shield' },
  { label: 'Contrôle technique', scope: 'vehicule', hasExpiry: true, requiredByDefault: false, icon: 'shield-check' },
  { label: "Facture d'achat", scope: 'vehicule', hasExpiry: false, requiredByDefault: false, icon: 'receipt' },
  { label: 'Facture garage', scope: 'vehicule', hasExpiry: false, requiredByDefault: false, icon: 'wrench' },
  { label: 'Autre document', scope: 'vehicule', hasExpiry: false, requiredByDefault: false, icon: 'tag' },
];

export interface ClauseSeed {
  title: string;
  body: string;
}

/**
 * Clauses de départ. Elles sont **semées en base**, pas figées dans le code : le
 * propriétaire les modifie, les désactive ou en ajoute, et chaque contrat conserve la
 * version retenue au moment de sa génération.
 *
 * Les variables disponibles entre doubles accolades sont remplacées à la génération.
 */
export const DEFAULT_CLAUSES: readonly ClauseSeed[] = [
  {
    title: 'Objet du contrat',
    body:
      "Le loueur donne en location au locataire le véhicule désigné ci-dessus, pour son usage personnel et professionnel, à l'exclusion de toute sous-location, de tout transport de marchandises et de toute utilisation en dehors du territoire français sans accord écrit préalable.",
  },
  {
    title: 'Durée',
    body:
      "La location prend effet le {{location.debut}}{{location.fin}}. {{location.duree}} Elle pourra être prolongée par accord écrit des deux parties.",
  },
  {
    title: 'Loyer et modalités de paiement',
    body:
      "Le loyer est fixé à {{location.loyer}} ({{location.frequence}}), exigible le {{location.echeance}}. Les paiements sont effectués par virement, carte, chèque ou espèces. Tout retard de paiement de plus de sept jours pourra entraîner la résiliation du contrat.",
  },
  {
    title: 'Dépôt de garantie',
    body:
      "Un dépôt de garantie de {{location.caution}} est versé à la signature du présent contrat. Il est restitué au plus tard un mois après la restitution du véhicule, déduction faite des éventuels dommages, frais de nettoyage et loyers impayés.",
  },
  {
    title: 'Kilométrage',
    body:
      "Le kilométrage relevé au départ est de {{vehicule.kmDepart}}. {{location.kilometrage}} Le dépassement éventuel est facturé {{location.prixKmSupplementaire}}.",
  },
  {
    title: 'Obligations du locataire',
    body:
      "Le locataire s'engage à utiliser le véhicule en bon père de famille, à respecter le code de la route, à maintenir les niveaux et à signaler sans délai tout sinistre. Il s'engage à ne pas conduire sous l'emprise d'alcool ou de stupéfiants, ni à prêter le véhicule à un tiers non déclaré.",
  },
  {
    title: 'Entretien',
    body:
      "Les entretiens périodiques sont à la charge du loueur et réalisés selon les préconisations du constructeur. Le locataire doit signaler toute anomalie et ne peut faire effectuer aucune réparation sans accord écrit du loueur.",
  },
  {
    title: 'Assurance',
    body:
      "Le véhicule est assuré par le loueur. Le locataire déclare avoir été informé des conditions d'assurance et s'engage à fournir tout document demandé. La franchise demeure à la charge du locataire en cas de sinistre responsable.",
  },
  {
    title: 'Restitution',
    body:
      "Le véhicule est restitué au terme du contrat, à l'adresse convenue, muni de ses documents et accessoires, dans l'état où il a été pris en charge, sous réserve de l'usure normale. Un état des lieux contradictoire est établi au retour.",
  },
  {
    title: 'Résiliation',
    body:
      "En cas de manquement grave de l'une des parties, notamment de non-paiement ou de non-restitution du véhicule, le contrat pourra être résilié de plein droit, sans préjudice de tous dommages et intérêts.",
  },
  {
    title: 'Données personnelles',
    body:
      "Les données personnelles du locataire sont conservées uniquement pour la gestion de la location et des obligations légales associées. Elles ne font l'objet d'aucune cession à un tiers.",
  },
  {
    title: 'Litiges',
    body:
      "Le présent contrat est soumis au droit français. En cas de litige, les parties rechercheront une solution amiable avant toute action contentieuse.",
  },
];
