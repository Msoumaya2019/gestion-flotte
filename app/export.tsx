/**
 * Export : tableaux CSV et états PDF.
 *
 * ## Deux sorties, deux usages
 *
 * Le **CSV** sert à travailler ailleurs : un tableur, un comptable, une sauvegarde de
 * contrôle. Il contient toutes les colonnes, sans mise en forme, et reste lisible par
 * n'importe quel outil. Le **PDF** sert à montrer : un bilan de flotte, un bilan par
 * véhicule, mis en page pour être lu ou transmis.
 *
 * ## Ce qui sort de l'application
 *
 * Chaque fichier passe par la feuille de partage du système : c'est l'utilisateur qui
 * choisit où il va — Fichiers, AirDrop, Mail, un tableur. Aucun fichier n'est écrit dans un
 * dossier exposé sans qu'il l'ait demandé, et rien n'est envoyé sur un serveur.
 *
 * Le contenu des documents du coffre **n'est pas** exporté ici : seules leurs métadonnées
 * le sont. Emporter les pièces justificatives est le rôle de la sauvegarde, qui les
 * chiffre. Un export CSV laissé dans un dossier partagé ne doit pas contenir un permis de
 * conduire scanné.
 *
 * ## Un export vide n'est pas un export
 *
 * Un tableau sans ligne produirait un fichier ne contenant que ses en-têtes, que
 * l'utilisateur ne comprendrait qu'après l'avoir ouvert. Les jeux vides sont donc annoncés
 * comme tels, et leur bouton est refusé.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { toCsv } from '@/domain/csv';
import { computeDashboard, periodRange } from '@/domain/dashboard';
import { formatLongFr } from '@/domain/dates';
import { computeRecovery } from '@/domain/finance';
import { formatKm, formatMoney, formatMoneyRounded, formatPercent } from '@/domain/money';
import { renderReportHtml, vehicleComparisonTable, type ReportSection } from '@/domain/report';
import {
  documentTable,
  expenseTable,
  maintenanceTable,
  mileageTable,
  paymentTable,
  rentalTable,
  tenantTable,
  vehicleLabel,
  vehicleTable,
  type CsvTable,
} from '@/domain/tables';
import { useApp } from '@/state/app-context';
import { vehicleFinancials } from '@/state/use-derived';
import {
  pdfFromHtml,
  shareOutput,
  writeTextOutput,
} from '@/services/output';
import { AppText } from '@/ui/components/text';
import { Card, DetailTitle, EmptyState, Screen, SectionHeader } from '@/ui/components/base';
import { Button, SegmentedControl } from '@/ui/components/button';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Mode = 'csv' | 'pdf';

/** Un jeu de données prêt à écrire, avec de quoi l'annoncer avant de l'exporter. */
interface Dataset {
  key: string;
  label: string;
  /** Nom de base du fichier ; l'extension et le nettoyage sont faits à l'écriture. */
  base: string;
  description: string;
  table: CsvTable;
}

export default function ExportScreen(): ReactElement {
  const { data, today } = useApp();
  const { colors } = useTheme();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('csv');
  /** Clé de l'action en cours : une seule à la fois, et son bouton porte le sablier. */
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const referenceDate = today();
  const warningDays = data.settings.documentWarningDays;

  // -------------------------------------------------------------------------
  // Les jeux de données
  // -------------------------------------------------------------------------

  /**
   * Tous les tableaux sont construits à chaque changement de données.
   *
   * `data` est rechargé après chaque écriture ; le calcul est de l'ordre de la milliseconde
   * sur une flotte de cette taille. Le mémoriser demanderait de savoir quand l'invalider —
   * et un export périmé est plus coûteux qu'un recalcul.
   */
  const datasets = useMemo<Dataset[]>(() => {
    const now = referenceDate;
    return [
      {
        key: 'vehicules',
        label: 'Véhicules',
        base: 'Vehicules',
        description: 'Identité, achat, kilométrage, statut',
        table: vehicleTable(data.vehicles),
      },
      {
        key: 'locataires',
        label: 'Locataires',
        base: 'Locataires',
        description: 'Coordonnées, permis, carte VTC',
        table: tenantTable(data.tenants),
      },
      {
        key: 'locations',
        label: 'Locations',
        base: 'Locations',
        description: 'Conditions, loyer, caution, kilométrage',
        table: rentalTable({
          rentals: data.rentals,
          vehicles: data.vehicles,
          tenants: data.tenants,
        }),
      },
      {
        key: 'echeances',
        label: 'Échéances',
        base: 'Echeances',
        description: 'Montants attendus, reçus, restes dus, qui a payé',
        table: paymentTable({
          payments: data.payments,
          vehicles: data.vehicles,
          tenants: data.tenants,
          methods: data.paymentMethods,
          today: now,
        }),
      },
      {
        key: 'depenses',
        label: 'Dépenses',
        base: 'Depenses',
        description: 'Date, catégorie, montant, fournisseur',
        table: expenseTable({
          expenses: data.expenses,
          vehicles: data.vehicles,
          categories: data.expenseCategories,
        }),
      },
      {
        key: 'entretien',
        label: 'Entretien',
        base: 'Entretien',
        description: 'Interventions, pièces changées, coûts',
        table: maintenanceTable({
          records: data.maintenanceRecords,
          vehicles: data.vehicles,
          types: data.maintenanceTypes,
        }),
      },
      {
        key: 'kilometrage',
        label: 'Kilométrage',
        base: 'Kilometrage',
        description: 'Relevés, origine, commentaire',
        table: mileageTable({ records: data.mileageRecords, vehicles: data.vehicles }),
      },
      {
        key: 'documents',
        label: 'Documents',
        base: 'Documents',
        description: 'Métadonnées seulement : type, numéro, dates, statut',
        table: documentTable({
          tenantDocuments: data.tenantDocuments,
          vehicleDocuments: data.vehicleDocuments,
          tenants: data.tenants,
          vehicles: data.vehicles,
          types: data.documentTypes,
          today: now,
          warningDays,
        }),
      },
    ];
  }, [data, referenceDate, warningDays]);

  const nonEmpty = datasets.filter((dataset) => dataset.table.rows.length > 0);
  const totalRows = nonEmpty.reduce((sum, dataset) => sum + dataset.table.rows.length, 0);

  // -------------------------------------------------------------------------
  // Écrire un CSV
  // -------------------------------------------------------------------------

  async function exportCsv(dataset: Dataset): Promise<void> {
    setBusy(dataset.key);
    setError(null);
    setNotice(null);

    try {
      if (dataset.table.rows.length === 0) {
        throw new Error(`« ${dataset.label} » ne contient aucune ligne : le fichier n’aurait que ses en-têtes.`);
      }
      const csv = toCsv(dataset.table.columns, dataset.table.rows);
      // Le fichier reste dans le cache : c'est le dossier que le système sait récupérer,
      // et `shareOutput` l'a déjà remis à sa destination. Le supprimer aussitôt ferait
      // courir un risque à une extension de partage qui lirait le fichier plus tard.
      await shareOutput(writeTextOutput(dataset.base, 'csv', csv), `Exporter ${dataset.label}`);
      setNotice(`${dataset.label} : ${dataset.table.rows.length} ligne(s) préparée(s).`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  /** Enchaîne les jeux non vides. Un refus de partage arrête la suite, sans la masquer. */
  async function exportAllCsv(): Promise<void> {
    setBusy('tous');
    setError(null);
    setNotice(null);
    try {
      for (const dataset of nonEmpty) {
        const csv = toCsv(dataset.table.columns, dataset.table.rows);
        const produced = writeTextOutput(dataset.base, 'csv', csv);
        await shareOutput(produced, `Exporter ${dataset.label}`);
      }
      setNotice(`${nonEmpty.length} fichier(s) préparé(s), ${totalRows} ligne(s) au total.`);
    } catch (caught) {
      setError(
        `L’enchaînement s’est arrêté : ${caught instanceof Error ? caught.message : String(caught)}. Les fichiers déjà transmis le sont restés.`,
      );
    } finally {
      setBusy(null);
    }
  }

  // -------------------------------------------------------------------------
  // États PDF
  // -------------------------------------------------------------------------

  /**
   * Bilan de flotte.
   *
   * Les totaux « depuis le début » viennent du même calcul que le tableau de bord, avec un
   * filtre de période qui couvre tout : le PDF ne peut donc pas annoncer un chiffre que
   * l'écran d'accueil contredit.
   */
  function fleetReportHtml(): string {
    const metrics = computeDashboard({
      vehicles: data.vehicles,
      rentals: data.rentals,
      payments: data.payments,
      expenses: data.expenses,
      today: referenceDate,
      range: periodRange('depuis_debut', referenceDate),
      vehicleId: null,
    });

    const investmentCents = metrics.fleetInvestmentCents;
    const recovery = computeRecovery({
      investmentCents,
      revenueCents: metrics.fleetRevenueCents,
      expenseCents: metrics.fleetExpenseCents,
    });

    const comparison = data.vehicles
      .map((vehicle) => {
        const financials = vehicleFinancials(data, vehicle.id);
        if (financials === null) return null;
        return {
          label: vehicleLabel(vehicle),
          revenue: formatMoneyRounded(financials.revenueCents),
          expense: formatMoneyRounded(financials.expenseCents),
          net: formatMoneyRounded(financials.netCents),
          monthly: formatMoneyRounded(financials.monthlyNetCents),
          recovered: formatPercent(financials.recovery.progressPercent, 0),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const sections: ReportSection[] = [
      {
        title: 'Résultat de la période',
        kpis: [
          { label: 'Revenus encaissés', value: formatMoney(metrics.fleetRevenueCents) },
          { label: 'Dépenses', value: formatMoney(metrics.fleetExpenseCents) },
          {
            label: 'Résultat net',
            value: formatMoney(metrics.fleetNetCents),
            tone: metrics.fleetNetCents >= 0 ? 'ok' : 'danger',
          },
        ],
        paragraphs: [
          'Les revenus comptent l’argent réellement reçu, et non ce qui a été facturé. Une échéance impayée ne figure donc pas ici : elle est décrite plus bas.',
        ],
      },
      {
        title: 'Parc',
        pairs: [
          ['Véhicules', String(metrics.totalVehicles)],
          ['Loués', String(metrics.rentedVehicles)],
          ['Disponibles', String(metrics.availableVehicles)],
          ['En entretien ou réparation', String(metrics.maintenanceVehicles)],
        ],
      },
      {
        title: 'Impayés et retards',
        kpis: [
          { label: 'En retard', value: formatMoney(metrics.lateRentCents), tone: metrics.lateRentCents > 0 ? 'danger' : 'ok' },
          { label: 'À échoir', value: formatMoney(metrics.pendingRentCents) },
          { label: 'Échéances en retard', value: String(metrics.lateCount) },
        ],
      },
      {
        title: 'Récupération de l’investissement',
        kpis: [
          { label: 'Investissement', value: formatMoneyRounded(recovery.investmentCents) },
          { label: 'Récupéré', value: formatMoneyRounded(recovery.recoveredCents) },
          {
            label: 'Reste à récupérer',
            value: formatMoneyRounded(recovery.remainingCents),
            tone: recovery.recovered ? 'ok' : 'neutral',
          },
        ],
        paragraphs: [
          recovery.investmentCents === 0
            ? 'Aucun investissement n’est enregistré : les véhicules n’ont pas de prix d’achat renseigné.'
            : `Soit ${formatPercent(recovery.recoveredPercent ?? 0)} de l’investissement, calculé sur le résultat net — les dépenses d’exploitation sont déduites avant de compter ce qui rembourse l’achat.`,
        ],
      },
    ];

    if (comparison.length > 0) {
      sections.push({ title: 'Comparaison des véhicules', table: vehicleComparisonTable(comparison) });
    }

    return renderReportHtml({
      title: 'Bilan de flotte',
      subtitle: `${metrics.totalVehicles} véhicule(s) — depuis le début`,
      generatedAt: new Date().toISOString(),
      referenceDate,
      sections,
      footerNote: 'Document produit par l’application de gestion de flotte.',
    });
  }

  /** Bilan d'un véhicule, sur toute son histoire. */
  function vehicleReportHtml(vehicleId: string): string | null {
    const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId);
    const financials = vehicleFinancials(data, vehicleId);
    if (vehicle === undefined || financials === null) return null;

    const sections: ReportSection[] = [
      {
        title: 'Résultat',
        kpis: [
          { label: 'Revenus encaissés', value: formatMoney(financials.revenueCents) },
          { label: 'Dépenses', value: formatMoney(financials.expenseCents) },
          {
            label: 'Résultat net',
            value: formatMoney(financials.netCents),
            tone: financials.netCents >= 0 ? 'ok' : 'danger',
          },
        ],
      },
      {
        title: 'Exploitation',
        pairs: [
          ['Moyenne mensuelle nette', formatMoney(financials.monthlyNetCents)],
          ['Dont entretien', formatMoney(financials.maintenanceCents)],
          ['Durée observée', `${financials.activeMonths.toFixed(1).replace('.', ',')} mois (${financials.activeDays} jours)`],
          ['Kilomètres parcourus', formatKm(financials.kmDriven)],
          ['Coût d’exploitation au km', financials.kmDriven > 0 ? formatMoney(financials.costPerKmCents) : 'Non calculable'],
          [
            'Rendement annualisé',
            financials.annualizedYieldPercent === null
              ? 'Non calculable'
              : formatPercent(financials.annualizedYieldPercent),
          ],
        ],
      },
      {
        title: 'Amortissement',
        pairs: [
          ['Base amortissable', formatMoney(financials.amortization.basisCents)],
          ['Dotation mensuelle', formatMoney(financials.amortization.monthlyCents)],
          ['Cumul', formatMoney(financials.amortization.cumulativeCents)],
          ['Valeur résiduelle', formatMoney(financials.amortization.remainingCents)],
          [
            'Avancement',
            `${formatPercent(financials.amortization.progressPercent, 0)} sur ${vehicle.amortizationMonths} mois`,
          ],
        ],
        paragraphs: [
          financials.amortization.finished
            ? 'La durée d’amortissement choisie est atteinte.'
            : `Fin prévue le ${formatLongFr(financials.amortization.endDate)}.`,
        ],
      },
      {
        title: 'Récupération de l’investissement',
        pairs: [
          ['Investissement', formatMoney(financials.recovery.investmentCents)],
          ['Récupéré', formatMoney(financials.recovery.recoveredCents)],
          ['Reste à récupérer', formatMoney(financials.recovery.remainingCents)],
        ],
        paragraphs: [
          financials.recovery.recovered
            ? 'Le véhicule a remboursé son achat.'
            : 'Le véhicule n’a pas encore remboursé son achat.',
        ],
      },
      {
        title: 'Véhicule',
        pairs: [
          ['Immatriculation', vehicle.plate === '' ? 'Non renseignée' : vehicle.plate],
          ['Année', vehicle.year === null ? 'Non renseignée' : String(vehicle.year)],
          ['Kilométrage actuel', formatKm(vehicle.currentMileageKm)],
          [
            'Achat',
            vehicle.purchaseDate === null
              ? 'Date non renseignée'
              : `${formatLongFr(vehicle.purchaseDate)} — ${formatMoney(vehicle.purchasePriceCents)}`,
          ],
        ],
      },
    ];

    return renderReportHtml({
      title: vehicleLabel(vehicle),
      subtitle: 'Bilan du véhicule — depuis le début',
      generatedAt: new Date().toISOString(),
      referenceDate,
      sections,
    });
  }

  async function exportPdf(key: string, html: string, base: string, dialogTitle: string): Promise<void> {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const produced = await pdfFromHtml(html, base);
      await shareOutput(produced, dialogTitle);
      setNotice(`${base} : document préparé.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  return (
    <Screen>
      <DetailTitle title="Exporter" onBack={() => router.back()} />

      <Card style={{ marginBottom: spacing.lg }}>
        <AppText variant="small" color="textMuted">
          Les fichiers sont préparés sur l’appareil, puis remis au système : c’est vous qui
          choisissez où ils vont — Fichiers, AirDrop, Mail, un tableur. Rien n’est envoyé
          sur un serveur.
        </AppText>
      </Card>

      <SegmentedControl
        options={[
          { value: 'csv', label: 'Tableaux' },
          { value: 'pdf', label: 'États' },
        ]}
        value={mode}
        onChange={setMode}
      />

      <View style={{ height: spacing.lg }} />

      {error === null ? null : (
        <>
          <Card style={{ borderColor: colors.danger }}>
            <AppText variant="small" color="danger">
              {error}
            </AppText>
          </Card>
          <View style={{ height: spacing.lg }} />
        </>
      )}

      {notice === null ? null : (
        <>
          <Card style={{ borderColor: colors.success }}>
            <AppText variant="small" color="success">
              {notice}
            </AppText>
          </Card>
          <View style={{ height: spacing.lg }} />
        </>
      )}

      {mode === 'csv' ? (
        <>
          <SectionHeader title="Tableaux CSV" icon="file-spreadsheet" />
          <Card>
            <AppText variant="caption" color="textFaint">
              Un tableau par fichier, avec toutes les colonnes. Les dates sont en
              AAAA-MM-JJ, donc triables ; les montants ont une virgule décimale et les
              colonnes sont séparées par des points-virgules, ce qu’un tableur en français
              ouvre directement. Un texte commençant par =, +, − ou @ est neutralisé, pour
              qu’un nom saisi ne puisse pas devenir une formule.
            </AppText>
          </Card>

          <View style={{ height: spacing.md }} />

          {datasets.map((dataset) => {
            const rows = dataset.table.rows.length;
            const empty = rows === 0;
            return (
              <Card key={dataset.key} style={{ marginBottom: spacing.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <AppText variant="body" style={{ fontWeight: '600' }}>{dataset.label}</AppText>
                  <AppText variant="caption" color={empty ? 'textFaint' : 'textMuted'}>
                    {empty ? 'aucune ligne' : `${rows} ligne${rows > 1 ? 's' : ''}`}
                  </AppText>
                </View>
                <AppText variant="caption" color="textMuted">
                  {dataset.description}
                </AppText>
                <View style={{ height: spacing.md }} />
                <Button
                  label={empty ? 'Rien à exporter' : 'Exporter'}
                  icon="share"
                  variant="secondary"
                  block
                  loading={busy === dataset.key}
                  disabled={empty || busy !== null}
                  onPress={() => void exportCsv(dataset)}
                />
              </Card>
            );
          })}

          <View style={{ height: spacing.sm }} />
          <Button
            label={`Tout exporter (${nonEmpty.length} fichier${nonEmpty.length > 1 ? 's' : ''})`}
            icon="download"
            block
            loading={busy === 'tous'}
            disabled={nonEmpty.length === 0 || busy !== null}
            onPress={() => void exportAllCsv()}
          />
          <View style={{ height: spacing.sm }} />
          <AppText variant="caption" color="textFaint">
            Chaque fichier ouvre la feuille de partage à son tour : il faut valider une fois
            par fichier. Les documents du coffre ne sont pas exportés — seules leurs
            métadonnées le sont, pour qu’un fichier transmis ne contienne jamais un permis
            scanné.
          </AppText>
        </>
      ) : (
        <>
          <SectionHeader title="États PDF" icon="file-text" />
          <Card>
            <AppText variant="caption" color="textFaint">
              Des documents mis en page, à imprimer ou à transmettre. Les chiffres viennent
              des mêmes calculs que le tableau de bord et les fiches véhicule : un état ne
              peut pas annoncer un montant que l’application contredit.
            </AppText>
          </Card>

          <View style={{ height: spacing.md }} />

          <Card style={{ marginBottom: spacing.md }}>
            <AppText variant="body" style={{ fontWeight: '600' }}>Bilan de flotte</AppText>
            <AppText variant="caption" color="textMuted">
              Résultat, parc, impayés, récupération de l’investissement et comparaison des
              véhicules.
            </AppText>
            <View style={{ height: spacing.md }} />
            <Button
              label="Générer le bilan"
              icon="chart-bar"
              variant="secondary"
              block
              loading={busy === 'pdf-flotte'}
              disabled={busy !== null || data.vehicles.length === 0}
              onPress={() =>
                void exportPdf('pdf-flotte', fleetReportHtml(), 'Bilan de flotte', 'Bilan de flotte')
              }
            />
          </Card>

          <SectionHeader title="Bilan par véhicule" icon="car" />
          {data.vehicles.length === 0 ? (
            <EmptyState
              icon="car"
              title="Aucun véhicule"
              message="Ajoutez un véhicule pour pouvoir établir son bilan."
            />
          ) : (
            data.vehicles.map((vehicle) => {
              const key = `pdf-${vehicle.id}`;
              return (
                <Card key={vehicle.id} style={{ marginBottom: spacing.md }}>
                  <AppText variant="body" style={{ fontWeight: '600' }}>{vehicleLabel(vehicle)}</AppText>
                  <View style={{ height: spacing.md }} />
                  <Button
                    label="Générer"
                    icon="file-text"
                    variant="secondary"
                    block
                    loading={busy === key}
                    disabled={busy !== null}
                    onPress={() => {
                      const html = vehicleReportHtml(vehicle.id);
                      if (html === null) {
                        setError(`Le bilan de ${vehicleLabel(vehicle)} n’a pas pu être calculé.`);
                        return;
                      }
                      void exportPdf(key, html, `Bilan ${vehicleLabel(vehicle)}`, `Bilan ${vehicleLabel(vehicle)}`);
                    }}
                  />
                </Card>
              );
            })
          )}
        </>
      )}
    </Screen>
  );
}
