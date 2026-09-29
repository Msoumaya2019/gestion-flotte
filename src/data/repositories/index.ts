/**
 * Point d'entrée unique des dépôts.
 *
 * Un seul objet porte tout : les écrans reçoivent `repositories` et n'ouvrent jamais la
 * base eux-mêmes. Cela évite qu'un écran invente sa propre requête — et fasse diverger un
 * total de celui du tableau de bord.
 */

import type { SqlDatabase } from '../sql';
import { createCatalogRepositories, type CatalogRepositories } from './catalog';
import { createDocumentRepositories, type DocumentRepositories } from './documents';
import { createExpenseRepository, type ExpenseRepository } from './expenses';
import { createFleetRepositories, type FleetRepositories } from './fleet';
import { createInspectionRepositories, type InspectionRepositories } from './inspections';
import { createLienRepositories, type LienRepositories } from './liens';
import { createMaintenanceRepositories, type MaintenanceRepositories } from './maintenance';
import { createRentalRepositories, type RentalRepositories } from './rentals';
import { createSystemRepositories, type SystemRepositories } from './system';

export interface Repositories
  extends FleetRepositories,
    RentalRepositories,
    ExpenseRepository_,
    MaintenanceRepositories,
    InspectionRepositories,
    DocumentRepositories,
    CatalogRepositories,
    SystemRepositories,
    LienRepositories {}

/** Alias local : `ExpenseRepository` est une interface étendue, pas un groupe. */
type ExpenseRepository_ = { expenses: ExpenseRepository };

export function createRepositories(db: SqlDatabase): Repositories {
  return {
    ...createFleetRepositories(db),
    ...createRentalRepositories(db),
    expenses: createExpenseRepository(db),
    ...createMaintenanceRepositories(db),
    ...createInspectionRepositories(db),
    ...createDocumentRepositories(db),
    ...createCatalogRepositories(db),
    ...createSystemRepositories(db),
    ...createLienRepositories(db),
  };
}

export type { CatalogRepositories, DocumentRepositories, ExpenseRepository, FleetRepositories };
export type { InspectionRepositories, LienRepositories, MaintenanceRepositories, RentalRepositories };
export type { SystemRepositories };
