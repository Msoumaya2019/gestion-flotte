/**
 * État applicatif : base ouverte, données en mémoire, réglages, coffre.
 *
 * ## Pourquoi tout charger en mémoire
 *
 * Une flotte personnelle, c'est quelques véhicules, quelques locataires, quelques milliers
 * de lignes de loyers et de dépenses sur dix ans : l'ensemble tient sans effort dans la
 * mémoire d'un téléphone. Le charger une fois rend les écrans **simples** — un tri, un
 * filtre, une somme se font en JavaScript sur des tableaux — au lieu d'exiger une requête
 * par écran, un cache et une invalidation. C'est la source la plus fréquente de bogues
 * d'affichage : deux écrans qui montrent deux totaux différents parce que l'un n'a pas
 * rechargé.
 *
 * Après chaque écriture, on recharge. Le coût est de quelques millisecondes, et il n'y a
 * jamais d'écran périmé.
 *
 * ## Le coffre peut manquer
 *
 * Si la clé du coffre est absente ou illisible, l'application **fonctionne quand même** :
 * véhicules, loyers, dépenses et entretiens n'en dépendent pas. Seuls les documents sont
 * alors indisponibles, et l'erreur est exposée pour être affichée là où elle compte, plutôt
 * que de bloquer tout le démarrage.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { Repositories } from '@/data/repositories';
import type { SqlDatabase } from '@/data/sql';
import { DEFAULT_SETTINGS } from '@/domain/settings';
import type {
  AppSettings,
  Clause,
  Contract,
  Damage,
  DocumentType,
  Expense,
  ExpenseCategory,
  Inspection,
  Insurance,
  MaintenancePlan,
  MaintenanceRecord,
  MaintenanceType,
  MileageRecord,
  Payment,
  PaymentMethod,
  Rental,
  ScheduledNotification,
  Tenant,
  TenantDocument,
  Vehicle,
  VehicleDocument,
} from '@/domain/types';
import { deviceNow, deviceRandomBytes, deviceToday, newId } from '@/services/device';
import { openAppDatabase } from '@/services/database';
import { createVaultFileStore, expoFilePort, type VaultFileStore } from '@/services/file-store';
import { loadOrCreateVaultKey } from '@/services/vault';

/** Tout ce que les écrans lisent. Rechargé en bloc après chaque écriture. */
export interface AppData {
  settings: AppSettings;
  vehicles: Vehicle[];
  tenants: Tenant[];
  rentals: Rental[];
  contracts: Contract[];
  payments: Payment[];
  expenses: Expense[];
  expenseCategories: ExpenseCategory[];
  paymentMethods: PaymentMethod[];
  maintenanceTypes: MaintenanceType[];
  maintenancePlans: MaintenancePlan[];
  maintenanceRecords: MaintenanceRecord[];
  mileageRecords: MileageRecord[];
  inspections: Inspection[];
  damages: Damage[];
  insurances: Insurance[];
  documentTypes: DocumentType[];
  tenantDocuments: TenantDocument[];
  vehicleDocuments: VehicleDocument[];
  clauses: Clause[];
  notifications: ScheduledNotification[];
}

const EMPTY_DATA: AppData = {
  settings: DEFAULT_SETTINGS,
  vehicles: [],
  tenants: [],
  rentals: [],
  contracts: [],
  payments: [],
  expenses: [],
  expenseCategories: [],
  paymentMethods: [],
  maintenanceTypes: [],
  maintenancePlans: [],
  maintenanceRecords: [],
  mileageRecords: [],
  inspections: [],
  damages: [],
  insurances: [],
  documentTypes: [],
  tenantDocuments: [],
  vehicleDocuments: [],
  clauses: [],
  notifications: [],
};

export interface AppContextValue {
  /** La base est ouverte et les données sont chargées. */
  ready: boolean;
  /** Erreur de démarrage : base illisible, migration échouée. Bloque l'application. */
  fatalError: string | null;
  /** Erreur du coffre : documents indisponibles, le reste fonctionne. */
  vaultError: string | null;
  data: AppData;
  repositories: Repositories | null;
  /**
   * La base ouverte, en accès brut.
   *
   * Réservé à la **sauvegarde et à la restauration** : elles dumpent les tables telles
   * quelles, colonne par colonne, précisément pour qu'une colonne ajoutée demain ne puisse
   * pas être oubliée par un mapping d'entité. Les écrans, eux, passent par `repositories` —
   * un écran qui compose sa propre requête fait diverger un total de celui du tableau de bord.
   */
  db: SqlDatabase | null;
  /** Coffre des documents. `null` si la clé n'a pas pu être obtenue. */
  vault: VaultFileStore | null;
  /** Recharge tout depuis la base. À appeler après chaque écriture. */
  refresh(): Promise<void>;
  /** Modifie un réglage et met à jour l'état local. */
  patchSettings(partial: Partial<AppSettings>): Promise<void>;
  /** Horodatage courant, pour ne pas disperser `new Date()` dans les écrans. */
  now(): string;
  today(): string;
  newId(): string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (value === null) {
    throw new Error('useApp doit être appelé sous <AppProvider>.');
  }
  return value;
}

/** Lit toutes les tables en parallèle. Une requête par table, sans jointure. */
async function loadEverything(repositories: Repositories): Promise<AppData> {
  const [
    settings,
    vehicles,
    tenants,
    rentals,
    contracts,
    payments,
    expenses,
    expenseCategories,
    paymentMethods,
    maintenanceTypes,
    maintenancePlans,
    maintenanceRecords,
    mileageRecords,
    inspections,
    damages,
    insurances,
    documentTypes,
    tenantDocuments,
    vehicleDocuments,
    clauses,
    notifications,
  ] = await Promise.all([
    repositories.settings.load(),
    repositories.vehicles.list(),
    repositories.tenants.list(),
    repositories.rentals.list(),
    repositories.contracts.list(),
    repositories.payments.list(),
    repositories.expenses.list(),
    repositories.expenseCategories.list(),
    repositories.paymentMethods.list(),
    repositories.maintenanceTypes.list(),
    repositories.maintenancePlans.list(),
    repositories.maintenanceRecords.list(),
    repositories.mileageRecords.list(),
    repositories.inspections.list(),
    repositories.damages.list(),
    repositories.insurances.list(),
    repositories.documentTypes.list(),
    repositories.tenantDocuments.list(),
    repositories.vehicleDocuments.list(),
    repositories.clauses.list(),
    repositories.notifications.list(),
  ]);

  return {
    settings,
    vehicles,
    tenants,
    rentals,
    contracts,
    payments,
    expenses,
    expenseCategories,
    paymentMethods,
    maintenanceTypes,
    maintenancePlans,
    maintenanceRecords,
    mileageRecords,
    inspections,
    damages,
    insurances,
    documentTypes,
    tenantDocuments,
    vehicleDocuments,
    clauses,
    notifications,
  };
}

export function AppProvider({ children }: { children: ReactNode }): ReactNode {
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [repositories, setRepositories] = useState<Repositories | null>(null);
  /**
   * La base ouverte, gardée pour la sauvegarde et la restauration.
   *
   * Elle est conservée en plus de `repositories` : les dépôts portent les règles métier et
   * ne savent pas dumper une table telle quelle, ce dont une archive a besoin. Voir la
   * note de `AppContextValue.db`.
   */
  const [db, setDb] = useState<SqlDatabase | null>(null);
  const [vault, setVault] = useState<VaultFileStore | null>(null);
  const repositoriesRef = useRef<Repositories | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start(): Promise<void> {
      try {
        const bootstrap = await openAppDatabase();
        if (cancelled) return;

        repositoriesRef.current = bootstrap.repositories;
        setRepositories(bootstrap.repositories);
        setDb(bootstrap.db);

        // Le coffre est ouvert séparément : son échec ne doit pas empêcher l'application
        // de démarrer, sans quoi un trousseau vidé rendrait tout le reste inaccessible.
        try {
          const key = await loadOrCreateVaultKey(deviceRandomBytes);
          if (cancelled) return;
          setVault(
            createVaultFileStore({
              port: expoFilePort,
              key,
              random: deviceRandomBytes,
              newId,
              now: deviceNow,
            }),
          );
        } catch (error) {
          if (!cancelled) {
            setVaultError(error instanceof Error ? error.message : String(error));
          }
        }

        const loaded = await loadEverything(bootstrap.repositories);
        if (cancelled) return;
        setData(loaded);
        setReady(true);
      } catch (error) {
        if (!cancelled) {
          setFatalError(error instanceof Error ? error.message : String(error));
          setReady(true);
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const current = repositoriesRef.current;
    if (current === null) return;
    setData(await loadEverything(current));
  }, []);

  const patchSettings = useCallback(
    async (partial: Partial<AppSettings>): Promise<void> => {
      const current = repositoriesRef.current;
      if (current === null) return;
      const updated = await current.settings.patch(partial, deviceNow());
      setData((previous) => ({ ...previous, settings: updated }));
    },
    [],
  );

  const value = useMemo<AppContextValue>(
    () => ({
      ready,
      fatalError,
      vaultError,
      data,
      repositories,
      db,
      vault,
      refresh,
      patchSettings,
      now: deviceNow,
      today: deviceToday,
      newId,
    }),
    [ready, fatalError, vaultError, data, repositories, db, vault, refresh, patchSettings],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
