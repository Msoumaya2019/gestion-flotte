/**
 * Ce qui pointe vers une fiche, et ce que contient la base.
 *
 * ## Pourquoi ce module existe
 *
 * Le schéma déclare **toutes** ses clés étrangères en `ON DELETE RESTRICT` : la base
 * refusera d'elle-même de détruire un véhicule que des échéances désignent. C'est la
 * garantie. Mais un refus de SQLite remonte sous forme d'erreur brute, après coup, et
 * l'utilisateur a déjà appuyé. Ce module-ci sert à **prévenir avant** : il compte, et
 * l'écran peut alors annoncer ce qui se passera.
 *
 * ## Pourquoi un module à part, et non une méthode de `fleet`
 *
 * `fleet` ne connaît que les véhicules, les locataires et les assurances. Les onze tables
 * qui désignent un véhicule appartiennent à cinq autres modules. Écrire ces jointures
 * dans `fleet` obligerait à y redéclarer des tables qui vivent ailleurs — exactement ce
 * que la note de `system.ts` met en garde de faire. Ici, un seul fichier connaît le
 * graphe des références, et il est le seul à le connaître.
 *
 * ## Les comptes incluent les archivés
 *
 * Un archivé existe toujours et désigne toujours : il empêche la suppression autant qu'un
 * autre, et il figure dans le message. Une exception, et une seule : `locationsEnCours`
 * ignore les locations archivées, sans quoi une location annulée bloquerait à jamais le
 * retrait d'un véhicule.
 */

import { compter, type Liens } from '@/domain/suppression';
import type { Row, SqlDatabase } from '../sql';

/** Une famille de l'inventaire : un libellé accordé, et son compte. */
export interface LigneInventaire {
  readonly cle: string;
  readonly libelle: string;
  readonly nombre: number;
}

export interface Inventaire {
  readonly lignes: readonly LigneInventaire[];
  /** Somme des lignes. Zéro veut dire « base vide », et l'écran doit le dire. */
  readonly total: number;
}

export interface LienRepositories {
  liens: {
    pourVehicule(id: string): Promise<Liens>;
    pourLocataire(id: string): Promise<Liens>;
    /** Tout ce que la base contient, pour annoncer un effacement avant de le faire. */
    inventaire(): Promise<Inventaire>;
  };
}

function nombre(row: Row | null, cle: string): number {
  const valeur = row?.[cle];
  return typeof valeur === 'number' ? valeur : Number(valeur ?? 0);
}

/**
 * Les onze tables qui désignent un véhicule, réunies en **une seule requête**.
 *
 * Une requête par famille ferait onze allers-retours pour un écran qui s'ouvre au
 * balayage. Les paramètres sont répétés à l'identique plutôt que numérotés (`?1`) : les
 * deux moteurs visés — celui d'expo-sqlite sur l'appareil, celui de `node:sqlite` au
 * banc — acceptent les paramètres anonymes, et rien ne garantit qu'ils acceptent les
 * mêmes formes numérotées.
 */
const REQUETE_VEHICULE = `
  SELECT
    (SELECT COUNT(*) FROM rentals           WHERE vehicleId = ? AND status = 'active' AND archivedAt IS NULL) AS locationsEnCours,
    (SELECT COUNT(*) FROM rentals           WHERE vehicleId = ?) AS locations,
    (SELECT COUNT(*) FROM payments          WHERE vehicleId = ?) AS echeances,
    (SELECT COUNT(*) FROM expenses          WHERE vehicleId = ?) AS depenses,
    (SELECT COUNT(*) FROM maintenance_records WHERE vehicleId = ?) AS entretiens,
    (SELECT COUNT(*) FROM vehicle_documents WHERE vehicleId = ?) AS documents,
    (SELECT COUNT(*) FROM maintenance_plans WHERE vehicleId = ?)
      + (SELECT COUNT(*) FROM mileage_records WHERE vehicleId = ?)
      + (SELECT COUNT(*) FROM inspections     WHERE vehicleId = ?)
      + (SELECT COUNT(*) FROM damages         WHERE vehicleId = ?)
      + (SELECT COUNT(*) FROM insurances      WHERE vehicleId = ?) AS autres
`;

const REQUETE_LOCATAIRE = `
  SELECT
    (SELECT COUNT(*) FROM rentals          WHERE tenantId = ? AND status = 'active' AND archivedAt IS NULL) AS locationsEnCours,
    (SELECT COUNT(*) FROM rentals          WHERE tenantId = ?) AS locations,
    (SELECT COUNT(*) FROM payments         WHERE tenantId = ?) AS echeances,
    (SELECT COUNT(*) FROM tenant_documents WHERE tenantId = ?) AS documents
`;

/** Les tables de l'inventaire, dans l'ordre où on les annonce : le plus parlant d'abord. */
const TABLES_INVENTAIRE: readonly { cle: string; table: string; singulier: string }[] = [
  { cle: 'vehicules', table: 'vehicles', singulier: 'véhicule' },
  { cle: 'locataires', table: 'tenants', singulier: 'locataire' },
  { cle: 'locations', table: 'rentals', singulier: 'location' },
  { cle: 'echeances', table: 'payments', singulier: 'échéance' },
  { cle: 'depenses', table: 'expenses', singulier: 'dépense' },
  { cle: 'entretiens', table: 'maintenance_records', singulier: 'entretien' },
  { cle: 'plans', table: 'maintenance_plans', singulier: 'plan d’entretien' },
  { cle: 'kilometrages', table: 'mileage_records', singulier: 'relevé de kilométrage' },
  { cle: 'assurances', table: 'insurances', singulier: 'assurance' },
  { cle: 'etatsDesLieux', table: 'inspections', singulier: 'état des lieux' },
  { cle: 'dommages', table: 'damages', singulier: 'dommage' },
  { cle: 'documents', table: 'tenant_documents', singulier: 'document de locataire' },
  { cle: 'documentsVehicule', table: 'vehicle_documents', singulier: 'document de véhicule' },
  { cle: 'contrats', table: 'contracts', singulier: 'contrat' },
];

export function createLienRepositories(db: SqlDatabase): LienRepositories {
  return {
    liens: {
      async pourVehicule(id: string): Promise<Liens> {
        const row = await db.getFirstAsync<Row>(REQUETE_VEHICULE, ...Array<string>(11).fill(id));
        return {
          locationsEnCours: nombre(row, 'locationsEnCours'),
          locations: nombre(row, 'locations'),
          echeances: nombre(row, 'echeances'),
          depenses: nombre(row, 'depenses'),
          entretiens: nombre(row, 'entretiens'),
          documents: nombre(row, 'documents'),
          autres: nombre(row, 'autres'),
        };
      },

      async pourLocataire(id: string): Promise<Liens> {
        const row = await db.getFirstAsync<Row>(REQUETE_LOCATAIRE, ...Array<string>(4).fill(id));
        return {
          locationsEnCours: nombre(row, 'locationsEnCours'),
          locations: nombre(row, 'locations'),
          echeances: nombre(row, 'echeances'),
          depenses: 0,
          entretiens: 0,
          documents: nombre(row, 'documents'),
          autres: 0,
        };
      },

      async inventaire(): Promise<Inventaire> {
        const lignes: LigneInventaire[] = [];
        let total = 0;
        for (const entree of TABLES_INVENTAIRE) {
          // Le nom de table vient d'une liste littérale de ce fichier, jamais d'une
          // saisie : aucune valeur extérieure n'entre dans la requête.
          const row = await db.getFirstAsync<Row>(`SELECT COUNT(*) AS n FROM ${entree.table}`);
          const compte = nombre(row, 'n');
          total += compte;
          lignes.push({ cle: entree.cle, libelle: compter(compte, entree.singulier), nombre: compte });
        }
        return { lignes, total };
      },
    },
  };
}
