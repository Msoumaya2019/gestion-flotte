/**
 * Éligibilité d'un locataire : les documents obligatoires sont-ils réunis ?
 *
 * Le contrôle est **informatif**, pas bloquant : le propriétaire peut forcer la
 * validation. C'est une décision commerciale qui lui appartient — refuser un locataire
 * parce qu'une attestation manque n'est pas au logiciel de décider. L'application doit
 * donc dire précisément ce qui manque, et laisser passer sur décision explicite.
 */

import { documentValidity } from './documents';
import type { DocumentStatus, IsoDate } from './types';

export interface EligibilityRequirement {
  typeId: string;
  label: string;
}

export interface EligibilityDocument {
  id: string;
  typeId: string;
  expiryDate: IsoDate | null;
}

export interface EligibilityItem {
  typeId: string;
  label: string;
  status: DocumentStatus | 'absent';
  present: boolean;
  usable: boolean;
  expiryDate: IsoDate | null;
  documentId: string | null;
  daysRemaining: number | null;
}

export interface EligibilityReport {
  items: EligibilityItem[];
  /** Tous les documents obligatoires sont présents et utilisables. */
  satisfied: boolean;
  missing: string[];
  expired: string[];
  expiringSoon: string[];
  /** Phrase prête à afficher, ou `null` si le dossier est complet. */
  message: string | null;
}

/** Rang de préférence entre deux documents d'un même type : on garde le plus utile. */
function score(status: DocumentStatus | 'absent', daysRemaining: number | null): number {
  switch (status) {
    case 'valide':
      return 4000 + (daysRemaining ?? 0);
    case 'sans_echeance':
      return 3000;
    case 'expire_bientot':
      return 2000 + (daysRemaining ?? 0);
    case 'expire':
      return 1000 + (daysRemaining ?? 0);
    case 'absent':
      return -1;
  }
}

export function checkRentalEligibility(input: {
  requirements: readonly EligibilityRequirement[];
  documents: readonly EligibilityDocument[];
  today: IsoDate;
  warningDays: number;
}): EligibilityReport {
  const items: EligibilityItem[] = input.requirements.map((requirement) => {
    const candidates = input.documents.filter((document) => document.typeId === requirement.typeId);
    if (candidates.length === 0) {
      return {
        typeId: requirement.typeId,
        label: requirement.label,
        status: 'absent',
        present: false,
        usable: false,
        expiryDate: null,
        documentId: null,
        daysRemaining: null,
      };
    }

    const evaluated = candidates.map((document) => {
      const validity = documentValidity(document.expiryDate, input.today, input.warningDays);
      return { document, validity };
    });
    evaluated.sort(
      (a, b) => score(b.validity.status, b.validity.daysRemaining) - score(a.validity.status, a.validity.daysRemaining),
    );
    const best = evaluated[0];
    if (best === undefined) {
      // Inatteignable : `candidates` n'est pas vide.
      throw new Error(`Évaluation impossible pour le type ${requirement.typeId}`);
    }

    const status = best.validity.status;
    return {
      typeId: requirement.typeId,
      label: requirement.label,
      status,
      present: true,
      usable: status === 'valide' || status === 'sans_echeance' || status === 'expire_bientot',
      expiryDate: best.document.expiryDate,
      documentId: best.document.id,
      daysRemaining: best.validity.daysRemaining,
    };
  });

  const missing = items.filter((item) => item.status === 'absent').map((item) => item.label);
  const expired = items.filter((item) => item.status === 'expire').map((item) => item.label);
  const expiringSoon = items.filter((item) => item.status === 'expire_bientot').map((item) => item.label);
  const satisfied = items.every((item) => item.usable);

  return {
    items,
    satisfied,
    missing,
    expired,
    expiringSoon,
    message: satisfied ? null : eligibilityMessage(missing, expired),
  };
}

export function eligibilityMessage(missing: readonly string[], expired: readonly string[]): string {
  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`${missing.join(', ').toLowerCase()} ${missing.length > 1 ? 'manquants' : 'manquant'}`);
  }
  if (expired.length > 0) {
    parts.push(`${expired.join(', ').toLowerCase()} ${expired.length > 1 ? 'expirés' : 'expiré'}`);
  }
  if (parts.length === 0) return '';
  return `Impossible de valider complètement le dossier : ${parts.join(' et ')}.`;
}
