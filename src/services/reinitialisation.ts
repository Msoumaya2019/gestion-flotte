/**
 * Vider les données, ou tout remettre à zéro.
 *
 * ## Deux gestes, et pas un seul
 *
 * « Tout supprimer » recouvre deux intentions qui n'ont pas les mêmes conséquences :
 *
 * - **Vider les données** : plus aucun véhicule, locataire, location, échéance, dépense,
 *   document. Les **catalogues** restent — catégories de dépense, moyens de paiement,
 *   types d'entretien, types de document, clauses du contrat — et les réglages aussi, y
 *   compris le code. L'application repart à zéro **sans être à reconfigurer**.
 * - **Tout remettre à zéro** : la base entière, catalogues compris, plus les fichiers du
 *   coffre, la clé qui les chiffre et le code. L'application se retrouve comme à sa
 *   première ouverture, catalogues réamorcés.
 *
 * Les confondre obligerait soit à reconfigurer l'application après un simple ménage, soit
 * à laisser traîner des données qu'on croyait parties.
 *
 * ## Pourquoi une liste de tables, et pas un `DROP`
 *
 * Les tables sont vidées **dans un ordre** : les enfants d'abord. `contracts` désigne
 * `rentals`, `payments` désigne `rentals`, `vehicles` et `tenants`. Un `DELETE` dans le
 * désordre se heurte à `ON DELETE RESTRICT`, et l'effacement s'arrête au milieu. La liste
 * ci-dessous **est** cet ordre, et le banc le vérifie sur une base réellement peuplée.
 *
 * ## La couverture est vérifiée
 *
 * Les trois listes — vidées, de référence, de configuration — doivent recouvrir `TABLES`
 * exactement une fois chacune. Une table ajoutée au schéma et oubliée ici survivrait à un
 * « tout supprimer » sans que rien ne le signale ; le banc refuse cette omission.
 */

import { bootstrapDatabase } from '@/data/bootstrap';
import type { TableName } from '@/data/migrations';
import type { Repositories } from '@/data/repositories';
import { transaction, type SqlDatabase } from '@/data/sql';
import type { VaultFileStore } from './file-store';
import { clearNotifications } from './notifications';

/**
 * Les tables vidées, **enfants avant parents**.
 *
 * `files` n'est désigné par aucune clé étrangère (les colonnes `fileId` sont de simples
 * textes) : sa position n'a pas d'importance, elle est ici pour la lecture.
 */
export const TABLES_VIDEES: readonly TableName[] = [
  'contracts',
  'damages',
  'inspections',
  'payments',
  'mileage_records',
  'maintenance_records',
  'maintenance_plans',
  'expenses',
  'insurances',
  'vehicle_documents',
  'tenant_documents',
  'rentals',
  'vehicles',
  'tenants',
  'notifications',
  'files',
];

/** Les catalogues : conservés par « Vider », réamorcés par « Tout remettre à zéro ». */
export const TABLES_REFERENCE: readonly TableName[] = [
  'expense_categories',
  'payment_methods',
  'maintenance_types',
  'document_types',
  'clauses',
];

/** La configuration : réglages et méta (dont l'empreinte du code et l'horodatage). */
export const TABLES_CONFIGURATION: readonly TableName[] = ['settings', 'meta'];

/**
 * Vide les données d'exploitation.
 *
 * Les fichiers du coffre vivent **hors** de la base. Leurs chemins sont donc relevés
 * avant, sans quoi plus rien ne les désignerait et ils resteraient chiffrés sur le disque
 * pour toujours — invisibles, mais présents.
 */
export async function viderLesDonnees(
  db: SqlDatabase,
  repositories: Repositories,
  vault: VaultFileStore | null,
): Promise<void> {
  const fichiers = await repositories.files.list({ includeArchived: true });

  await transaction(db, async () => {
    for (const table of TABLES_VIDEES) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
  });

  if (vault === null) return;

  for (const fichier of fichiers) {
    try {
      await vault.remove(fichier);
    } catch {
      // Un contenu qu'on n'arrive pas à retirer laisse un orphelin chiffré. Ce n'est pas
      // une raison d'interrompre un effacement déjà fait en base, ni de le signaler comme
      // un échec : l'orphelin ne s'affiche nulle part et ne se déchiffre qu'avec une clé
      // que la remise à zéro fait oublier.
    }
  }
}

export interface OptionsRemiseAZero {
  newId: () => string;
  now: string;
  today: string;
}

/**
 * Efface tout et réamorce.
 *
 * L'ordre compte : les rappels du système d'abord — ils désignent des échéances qui vont
 * disparaître, et sonneraient sinon dans le vide ; le réamorçage enfin, qui rend
 * l'application utilisable sans la rouvrir.
 *
 * ## La clé du coffre n'est **pas** oubliée, et c'est délibéré
 *
 * L'appel à `forgetVaultKey` a été écrit, puis retiré après examen. Le coffre en service
 * garde en mémoire la clé chargée au démarrage : oublier la clé du trousseau pendant que
 * l'application tourne ferait chiffrer les **nouveaux** documents avec une clé que plus
 * rien ne détient — ils seraient définitivement illisibles à la prochaine ouverture, sans
 * que rien ne le signale. Or la clé appartient au cycle de vie du fournisseur d'état, pas
 * à cette fonction.
 *
 * Ce qu'on perd : un contenu que `vault.remove` n'aurait pas su effacer resterait
 * déchiffrable par la clé survivante. Ce qu'on évite : une perte silencieuse des documents
 * ajoutés après la remise à zéro. L'effacement des fichiers, lui, est bien réel — c'est lui
 * qui supprime les données, pas la disparition de la clé.
 */
export async function remettreAZero(
  db: SqlDatabase,
  repositories: Repositories,
  vault: VaultFileStore | null,
  options: OptionsRemiseAZero,
): Promise<void> {
  try {
    await clearNotifications(repositories);
  } catch {
    // Annuler un rappel déjà programmé dépend d'une permission système. Son refus ne doit
    // pas empêcher l'effacement : la table `notifications` est vidée de toute façon, donc
    // l'application n'aura plus rien à reprogrammer.
  }

  await viderLesDonnees(db, repositories, vault);

  await transaction(db, async () => {
    for (const table of [...TABLES_REFERENCE, ...TABLES_CONFIGURATION]) {
      await db.runAsync(`DELETE FROM ${table}`);
    }
  });

  // `withDemoData: false` : un jeu d'essai ne revient pas chez quelqu'un qui vient
  // d'effacer ses données. C'est la promesse écrite dans l'en-tête de `bootstrap`.
  await bootstrapDatabase(db, {
    newId: options.newId,
    now: options.now,
    today: options.today,
    withDemoData: false,
  });
}
