/**
 * Accueil : l'écran qui doit répondre en trois secondes.
 *
 * ## Ce qu'on vient y chercher
 *
 * « Combien j'ai encaissé ce mois-ci », « qui ne m'a pas payé », « qu'est-ce qui arrive à
 * échéance ». Les chiffres du mois sont en haut, les urgences juste après, et le détail
 * plus bas. Rien n'est replié : un accordéon cache précisément ce qu'on venait voir.
 *
 * ## Pourquoi un filtre par véhicule et par période
 *
 * « Ce mois-ci » et « depuis le début » répondent à deux questions différentes, et il faut
 * souvent la seconde pour juger un véhicule. Le filtre porte sur **tous** les indicateurs à
 * la fois, jamais sur une partie : un total de période à côté d'un total de flotte sans
 * mention serait lu comme une incohérence.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { computeDashboard, periodRange, type PeriodFilter } from '@/domain/dashboard';
import { collectExpiring, documentValidity } from '@/domain/documents';
import { maintenanceStatus, nextMaintenanceDue } from '@/domain/maintenance';
import { formatMoney, formatPercent } from '@/domain/money';
import { daysBetween, formatFr, monthShortLabelFr, relativeDaysLabel, todayIso } from '@/domain/dates';
import { effectivePaymentStatus, paymentBalance } from '@/domain/rental';
import { PAYMENT_STATUS_LABELS } from '@/domain/catalog';
import { useApp } from '@/state/app-context';
import { AppText } from '@/ui/components/text';
import { BarChart, ChartLegend, ProgressRing } from '@/ui/components/charts';
import {
  Card,
  EmptyState,
  IconBubble,
  ListRow,
  ProgressBar,
  Screen,
  ScreenTitle,
  SectionHeader,
  StatTile,
} from '@/ui/components/base';
import { Chip, IconButton } from '@/ui/components/button';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const PERIOD_LABELS: { value: PeriodFilter; label: string }[] = [
  { value: 'ce_mois', label: 'Ce mois' },
  { value: 'mois_precedent', label: 'Mois précédent' },
  { value: 'cette_annee', label: 'Cette année' },
  { value: 'depuis_debut', label: 'Depuis le début' },
];

export default function DashboardScreen(): ReactElement {
  const { data } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const today = todayIso();

  const [period, setPeriod] = useState<PeriodFilter>('ce_mois');
  const [vehicleId, setVehicleId] = useState<string | null>(null);

  const metrics = useMemo(
    () =>
      computeDashboard({
        vehicles: data.vehicles,
        rentals: data.rentals,
        payments: data.payments,
        expenses: data.expenses,
        today,
        range: periodRange(period, today),
        vehicleId,
      }),
    [data.vehicles, data.rentals, data.payments, data.expenses, today, period, vehicleId],
  );

  // Loyers en retard, du plus ancien au plus récent : c'est l'ordre dans lequel on relance.
  const lateRentals = useMemo(() => {
    return data.payments
      .filter((payment) => {
        if (vehicleId !== null && payment.vehicleId !== vehicleId) return false;
        const status = effectivePaymentStatus(payment, today);
        return status === 'retard' || status === 'impaye';
      })
      .map((payment) => ({ payment, balance: paymentBalance(payment) }))
      .sort((a, b) => a.payment.dueDate.localeCompare(b.payment.dueDate));
  }, [data.payments, today, vehicleId]);

  // Documents à échéance, locataires et véhicules confondus.
  const expiringDocuments = useMemo(() => {
    const tenantEntries = data.tenantDocuments.map((document) => {
      const tenant = data.tenants.find((candidate) => candidate.id === document.tenantId);
      const type = data.documentTypes.find((candidate) => candidate.id === document.typeId);
      return {
        id: document.id,
        label: type?.label ?? 'Document',
        subject: tenant === undefined ? 'Locataire' : `${tenant.firstName} ${tenant.lastName}`,
        expiryDate: document.expiryDate,
        route: `/locataire/${document.tenantId}`,
      };
    });

    const vehicleEntries = data.vehicleDocuments.map((document) => {
      const vehicle = data.vehicles.find((candidate) => candidate.id === document.vehicleId);
      const type = data.documentTypes.find((candidate) => candidate.id === document.typeId);
      return {
        id: document.id,
        label: type?.label ?? 'Document',
        subject: vehicle === undefined ? 'Véhicule' : `${vehicle.brand} ${vehicle.model}`,
        expiryDate: document.expiryDate,
        route: `/vehicule/${document.vehicleId}`,
      };
    });

    // `collectExpiring` rend chaque entrée enrichie : `subject` et `route` traversent tels
    // quels, sans recherche par identifiant après coup.
    return collectExpiring([...tenantEntries, ...vehicleEntries], today, data.settings.documentWarningDays);
  }, [data.tenantDocuments, data.vehicleDocuments, data.tenants, data.vehicles, data.documentTypes, data.settings.documentWarningDays, today]);

  // Entretiens à prévoir, d'après les plans actifs de chaque véhicule.
  const maintenanceAlerts = useMemo(() => {
    const out: {
      vehicleId: string;
      label: string;
      typeLabel: string;
      detail: string;
      tone: 'warn' | 'danger';
    }[] = [];

    for (const plan of data.maintenancePlans) {
      if (!plan.active) continue;
      if (vehicleId !== null && plan.vehicleId !== vehicleId) continue;
      const vehicle = data.vehicles.find((candidate) => candidate.id === plan.vehicleId);
      if (vehicle === undefined || vehicle.status === 'vendu') continue;

      const status = maintenanceStatus(nextMaintenanceDue(plan), vehicle.currentMileageKm, today, {
        warningKm: data.settings.maintenanceWarningKm,
        criticalKm: data.settings.maintenanceCriticalKm,
        warningDays: data.settings.maintenanceWarningDays,
        criticalDays: data.settings.maintenanceCriticalDays,
      });
      if (status.state === 'ok' || status.state === 'inconnu') continue;

      const type = data.maintenanceTypes.find((candidate) => candidate.id === plan.typeId);
      out.push({
        vehicleId: plan.vehicleId,
        label: `${vehicle.brand} ${vehicle.model}`,
        typeLabel: type?.label ?? 'Entretien',
        detail:
          status.kmRemaining !== null
            ? status.kmRemaining <= 0
              ? `dépassé de ${Math.abs(Math.round(status.kmRemaining))} km`
              : `dans ${Math.round(status.kmRemaining)} km`
            : status.daysRemaining !== null
              ? relativeDaysLabel(status.daysRemaining)
              : '',
        tone: status.state === 'depasse' ? 'danger' : 'warn',
      });
    }
    return out;
  }, [data.maintenancePlans, data.maintenanceTypes, data.vehicles, data.settings, today, vehicleId]);

  const chartData = metrics.monthly.map((point) => ({
    // `MonthlyPoint` porte un mois (`month`), pas un libellé déjà écrit : c'est
    // `monthShortLabelFr` qui le met en forme courte, comme partout ailleurs.
    label: monthShortLabelFr(point.month),
    value: point.revenueCents,
    secondary: point.expenseCents,
  }));

  const recoveredRatio =
    metrics.fleetRecoveredPercent === null ? 0 : metrics.fleetRecoveredPercent / 100;

  return (
    <Screen
      header={
        <View>
          <ScreenTitle title="Accueil" subtitle={`Aujourd’hui, ${formatFr(today)}`} />
          <View style={styles.actions}>
            <IconButton icon="search" label="Rechercher" onPress={() => router.push('/recherche')} />
            <IconButton icon="bell" label="Rappels" onPress={() => router.push('/notifications')} />
            <IconButton icon="settings" label="Réglages" onPress={() => router.push('/parametres')} />
          </View>
        </View>
      }
    >
      {/* ---------------------------------------------------------------- */}
      {/* Filtres                                                          */}
      {/* ---------------------------------------------------------------- */}
      <View style={styles.chips}>
        {PERIOD_LABELS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={period === option.value}
            onPress={() => setPeriod(option.value)}
          />
        ))}
      </View>

      <View style={styles.chips}>
        <Chip label="Toute la flotte" selected={vehicleId === null} onPress={() => setVehicleId(null)} />
        {data.vehicles
          .filter((vehicle) => vehicle.status !== 'vendu')
          .map((vehicle) => (
            <Chip
              key={vehicle.id}
              label={`${vehicle.brand} ${vehicle.model}`}
              selected={vehicleId === vehicle.id}
              onPress={() => setVehicleId(vehicle.id)}
            />
          ))}
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Chiffres de la période                                           */}
      {/* ---------------------------------------------------------------- */}
      <View style={styles.tiles}>
        <StatTile
          label="Encaissé"
          value={formatMoney(metrics.revenueCents, { currency: '' }).trim()}
          hint={`${metrics.range.label} · ${formatMoney(metrics.billedCents, { currency: '' }).trim()} facturés`}
          tone="ok"
          icon="banknote"
        />
        <StatTile
          label="Dépenses"
          value={formatMoney(metrics.expenseCents, { currency: '' }).trim()}
          hint={metrics.range.label}
          tone="warn"
          icon="receipt"
        />
      </View>

      <View style={[styles.tiles, { marginTop: spacing.md }]}>
        <StatTile
          label="Résultat net"
          value={formatMoney(metrics.netCents, { currency: '' }).trim()}
          hint={metrics.netCents >= 0 ? 'Recettes − dépenses' : 'La période est déficitaire'}
          tone={metrics.netCents >= 0 ? 'ok' : 'danger'}
          icon="trending-up"
        />
        <StatTile
          label="En retard"
          value={formatMoney(metrics.lateRentCents, { currency: '' }).trim()}
          hint={
            metrics.lateCount === 0
              ? 'Aucun loyer en retard'
              : `${metrics.lateCount} échéance${metrics.lateCount > 1 ? 's' : ''}`
          }
          tone={metrics.lateCount === 0 ? 'neutral' : 'danger'}
          icon="alert-triangle"
        />
      </View>

      {/* ---------------------------------------------------------------- */}
      {/* Flotte                                                           */}
      {/* ---------------------------------------------------------------- */}
      <SectionHeader title="Flotte" icon="car-multiple" />
      <Card>
        <View style={styles.fleetRow}>
          <View style={{ flex: 1 }}>
            <FleetCount label="Loués" value={metrics.rentedVehicles} tone="accent" />
            <FleetCount label="Disponibles" value={metrics.availableVehicles} tone="ok" />
            <FleetCount label="Immobilisés" value={metrics.maintenanceVehicles} tone="warn" />
          </View>
          <ProgressRing
            ratio={recoveredRatio}
            size={92}
            label={
              metrics.fleetRecoveredPercent === null
                ? '—'
                : formatPercent(metrics.fleetRecoveredPercent, 0)
            }
            caption="investi récupéré"
          />
        </View>

        <View style={[styles.investment, { borderTopColor: colors.separator }]}>
          <AppText variant="small" color="textMuted">
            {`${formatMoney(metrics.fleetRecoveredCents)} récupérés sur ${formatMoney(metrics.fleetInvestmentCents)} investis`}
          </AppText>
          <View style={{ marginTop: spacing.sm }}>
            <ProgressBar
              ratio={recoveredRatio}
              tone={recoveredRatio >= 1 ? 'ok' : 'accent'}
              height={10}
            />
          </View>
          <AppText variant="caption" color="textFaint" style={{ marginTop: 6 }}>
            {metrics.fleetRecoveredPercent === null
              ? 'Investissement non renseigné pour ces véhicules.'
              : `Reste à récupérer : ${formatMoney(Math.max(0, metrics.fleetInvestmentCents - metrics.fleetRecoveredCents))}`}
          </AppText>
        </View>
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Urgences                                                         */}
      {/* ---------------------------------------------------------------- */}
      {lateRentals.length > 0 ? (
        <>
          <SectionHeader
            title="Loyers en retard"
            icon="alert-triangle"
            action={
              <AppText variant="caption" color="danger">
                {formatMoney(metrics.lateRentCents)}
              </AppText>
            }
          />
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {lateRentals.slice(0, 4).map(({ payment, balance }, index) => {
              const vehicle = data.vehicles.find((candidate) => candidate.id === payment.vehicleId);
              const tenant = data.tenants.find((candidate) => candidate.id === payment.tenantId);
              const days = daysBetween(payment.dueDate, today);
              return (
                <View key={payment.id}>
                  {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
                  <ListRow
                    icon="alert-circle"
                    iconTone="danger"
                    title={tenant === undefined ? 'Locataire' : `${tenant.firstName} ${tenant.lastName}`}
                    subtitle={`${vehicle?.brand ?? ''} ${vehicle?.model ?? ''} · échu depuis ${days} j`}
                    value={formatMoney(balance.remainingCents)}
                    valueColor="danger"
                    badge={PAYMENT_STATUS_LABELS[effectivePaymentStatus(payment, today)]}
                    chevron
                    onPress={() => router.push(`/location/${payment.rentalId}`)}
                  />
                </View>
              );
            })}
          </Card>
        </>
      ) : null}

      {expiringDocuments.length > 0 ? (
        <>
          <SectionHeader title="Documents à surveiller" icon="file-check" />
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {expiringDocuments.slice(0, 4).map((document, index) => (
              <View key={document.id}>
                {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
                <ListRow
                  icon="file-text"
                  iconTone={document.status === 'expire' ? 'danger' : 'warn'}
                  title={document.label}
                  subtitle={document.subject}
                  value={document.expiryDate === null ? '—' : formatFr(document.expiryDate)}
                  badge={documentStatusLabel(document.status, document.daysRemaining)}
                  chevron
                  onPress={() => router.push(document.route as never)}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {maintenanceAlerts.length > 0 ? (
        <>
          <SectionHeader title="Entretiens à prévoir" icon="wrench" />
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {maintenanceAlerts.slice(0, 4).map((alert, index) => (
              <View key={`${alert.vehicleId}-${alert.typeLabel}`}>
                {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
                <ListRow
                  icon="gauge"
                  iconTone={alert.tone}
                  title={alert.typeLabel}
                  subtitle={`${alert.label} · ${alert.detail}`}
                  chevron
                  onPress={() => router.push(`/vehicule/${alert.vehicleId}`)}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      {/* ---------------------------------------------------------------- */}
      {/* Évolution                                                        */}
      {/* ---------------------------------------------------------------- */}
      <SectionHeader title="Douze derniers mois" icon="chart-bar" />
      <Card>
        {chartData.length === 0 ? (
          <EmptyState icon="chart-bar" title="Pas encore de mouvement" />
        ) : (
          <>
            <BarChart
              data={chartData}
              format={(value) => formatMoney(value)}
            />
            <ChartLegend
              items={[
                { label: 'Encaissé', color: colors.primary },
                { label: 'Dépenses', color: colors.danger },
              ]}
            />
          </>
        )}
      </Card>

      {/* ---------------------------------------------------------------- */}
      {/* Classement                                                       */}
      {/* ---------------------------------------------------------------- */}
      <SectionHeader title="Rentabilité par véhicule" icon="percent" />
      {metrics.ranking.length === 0 ? (
        <Card>
          <EmptyState
            icon="car"
            title="Aucun véhicule"
            message="Ajoutez un véhicule pour suivre sa rentabilité."
          />
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
          {[...metrics.ranking]
            .sort((a, b) => b.netCents - a.netCents)
            .map((entry, index) => (
              <View key={entry.vehicleId}>
                {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
                <Pressable onPress={() => router.push(`/vehicule/${entry.vehicleId}`)}>
                  <View style={styles.rankingRow}>
                    <IconBubble icon="car" tone={entry.netCents >= 0 ? 'ok' : 'danger'} />
                    <View style={{ flex: 1, marginLeft: spacing.md }}>
                      <AppText variant="body" numberOfLines={1}>
                        {entry.label}
                      </AppText>
                      <AppText variant="caption" color="textFaint">
                        {entry.plate === '' ? 'sans plaque' : entry.plate}
                      </AppText>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <AppText
                        variant="title"
                        color={entry.netCents >= 0 ? 'success' : 'danger'}
                        tabular
                      >
                        {formatMoney(entry.netCents, { currency: '' }).trim()}
                      </AppText>
                      <AppText variant="caption" color="textFaint">
                        {entry.recoveredPercent === null
                          ? '—'
                          : `${formatPercent(entry.recoveredPercent, 0)} récupéré`}
                      </AppText>
                    </View>
                  </View>
                </Pressable>
              </View>
            ))}
        </Card>
      )}
    </Screen>
  );
}

function FleetCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'ok' | 'warn' | 'accent';
}): ReactElement {
  const { colors } = useTheme();
  const color =
    tone === 'ok' ? colors.success : tone === 'warn' ? colors.warning : colors.primary;
  return (
    <View style={styles.fleetCount}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText variant="small" color="textMuted" style={{ flex: 1 }}>
        {label}
      </AppText>
      <AppText variant="title" tabular>
        {String(value)}
      </AppText>
    </View>
  );
}

/** Libellé du statut d'un document, avec le nombre de jours restants quand il y en a. */
function documentStatusLabel(
  status: ReturnType<typeof documentValidity>['status'],
  daysRemaining: number | null,
): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'info' | 'accent' } {
  switch (status) {
    case 'expire':
      return { label: 'Expiré', tone: 'danger' };
    case 'expire_bientot':
      return {
        label: daysRemaining === null ? 'Expire bientôt' : `Dans ${daysRemaining} j`,
        tone: 'warn',
      };
    case 'valide':
      return { label: 'Valide', tone: 'ok' };
    case 'sans_echeance':
      return { label: 'Sans échéance', tone: 'info' };
  }
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.md },
  fleetRow: { flexDirection: 'row', alignItems: 'center' },
  fleetCount: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  investment: { marginTop: spacing.lg, paddingTop: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth },
  separator: { height: StyleSheet.hairlineWidth },
  rankingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md },
});
