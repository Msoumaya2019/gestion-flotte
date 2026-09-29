/**
 * Finances : où part l'argent, et d'où il vient.
 *
 * L'écran répond à deux questions dans cet ordre : « combien il me reste », puis « pourquoi
 * ce chiffre ». D'où la répartition par catégorie juste sous les totaux — un total de
 * dépenses sans sa décomposition oblige à ouvrir la liste pour comprendre.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PAYMENT_STATUS_LABELS } from '@/domain/catalog';
import { periodRange, type PeriodFilter } from '@/domain/dashboard';
import { formatFr, todayIso } from '@/domain/dates';
import { formatMoney, formatPercent } from '@/domain/money';
import { effectivePaymentStatus, paymentBalance } from '@/domain/rental';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import { BarChart } from '@/ui/components/charts';
import {
  Card,
  EmptyState,
  ListRow,
  Screen,
  ScreenTitle,
  SectionHeader,
  StatTile,
} from '@/ui/components/base';
import { Chip } from '@/ui/components/button';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

const PERIODS: { value: PeriodFilter; label: string }[] = [
  { value: 'ce_mois', label: 'Ce mois' },
  { value: 'mois_precedent', label: 'Mois précédent' },
  { value: 'cette_annee', label: 'Cette année' },
  { value: 'depuis_debut', label: 'Depuis le début' },
];

type Tab = 'depenses' | 'encaissements';

export default function FinancesScreen(): ReactElement {
  const { data } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const today = todayIso();

  const [period, setPeriod] = useState<PeriodFilter>('ce_mois');
  const [tab, setTab] = useState<Tab>('depenses');

  const range = periodRange(period, today);

  const scoped = useMemo(() => {
    const inRange = (date: string): boolean => {
      if (range.from !== null && date < range.from) return false;
      if (range.to !== null && date > range.to) return false;
      return true;
    };
    return {
      expenses: data.expenses.filter((expense) => inRange(expense.date)),
      payments: data.payments.filter((payment) => payment.status !== 'annule' && inRange(payment.dueDate)),
    };
  }, [data.expenses, data.payments, range.from, range.to]);

  const totals = useMemo(() => {
    const revenue = scoped.payments.reduce((sum, payment) => sum + payment.receivedCents, 0);
    const billed = scoped.payments.reduce((sum, payment) => sum + payment.expectedCents, 0);
    const expense = scoped.expenses.reduce((sum, item) => sum + item.amountCents, 0);
    return { revenue, billed, expense, net: revenue - expense, unpaid: billed - revenue };
  }, [scoped]);

  /** Répartition des dépenses par catégorie, du poste le plus lourd au plus léger. */
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const expense of scoped.expenses) {
      map.set(expense.categoryId, (map.get(expense.categoryId) ?? 0) + expense.amountCents);
    }
    return [...map.entries()]
      .map(([categoryId, total]) => ({
        categoryId,
        label: data.expenseCategories.find((category) => category.id === categoryId)?.label ?? 'Autre',
        total,
      }))
      .sort((a, b) => b.total - a.total);
  }, [scoped.expenses, data.expenseCategories]);

  const byVehicle = useMemo(() => {
    const map = new Map<string, number>();
    for (const expense of scoped.expenses) {
      map.set(expense.vehicleId, (map.get(expense.vehicleId) ?? 0) + expense.amountCents);
    }
    return [...map.entries()]
      .map(([vehicleId, total]) => ({ vehicleId, label: vehicleName(data, vehicleId), total }))
      .sort((a, b) => b.total - a.total);
  }, [scoped.expenses, data]);

  const chartData = byCategory.slice(0, 8).map((entry) => ({
    label: entry.label.slice(0, 5),
    value: entry.total,
  }));

  const recentExpenses = [...scoped.expenses].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const recentPayments = [...scoped.payments]
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
    .slice(0, 30);

  return (
    <Screen
      header={
        <View>
          <ScreenTitle title="Finances" subtitle={range.label} />
        </View>
      }
    >
      <View style={styles.chips}>
        {PERIODS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            selected={period === option.value}
            onPress={() => setPeriod(option.value)}
          />
        ))}
      </View>

      <View style={styles.tiles}>
        <StatTile
          label="Encaissé"
          value={formatMoney(totals.revenue, { currency: '' }).trim()}
          hint={`${formatMoney(totals.billed, { currency: '' }).trim()} facturés`}
          tone="ok"
          icon="banknote"
        />
        <StatTile
          label="Dépenses"
          value={formatMoney(totals.expense, { currency: '' }).trim()}
          hint={`${scoped.expenses.length} écriture${scoped.expenses.length > 1 ? 's' : ''}`}
          tone="warn"
          icon="receipt"
        />
      </View>
      <View style={[styles.tiles, { marginTop: spacing.md }]}>
        <StatTile
          label="Résultat"
          value={formatMoney(totals.net, { currency: '' }).trim()}
          hint={totals.net >= 0 ? 'Bénéfice sur la période' : 'Perte sur la période'}
          tone={totals.net >= 0 ? 'ok' : 'danger'}
          icon="trending-up"
        />
        <StatTile
          label="Reste à encaisser"
          value={formatMoney(totals.unpaid, { currency: '' }).trim()}
          hint="Facturé et non reçu"
          tone={totals.unpaid > 0 ? 'warn' : 'neutral'}
          icon="clock"
        />
      </View>

      <SectionHeader title="Répartition des dépenses" icon="chart-bar" />
      <Card>
        {chartData.length === 0 ? (
          <EmptyState icon="receipt" title="Aucune dépense sur la période" />
        ) : (
          <>
            <BarChart data={chartData} height={130} />
            {byCategory.slice(0, 6).map((entry) => (
              <View key={entry.categoryId} style={styles.breakdownRow}>
                <AppText variant="small" style={{ flex: 1 }} numberOfLines={1}>
                  {entry.label}
                </AppText>
                <AppText variant="caption" color="textFaint" style={{ marginRight: spacing.sm }}>
                  {totals.expense === 0 ? '—' : formatPercent((entry.total / totals.expense) * 100, 0)}
                </AppText>
                <AppText variant="small" tabular style={{ fontWeight: '600' }}>
                  {formatMoney(entry.total, { currency: '' }).trim()}
                </AppText>
              </View>
            ))}
          </>
        )}
      </Card>

      {byVehicle.length > 1 ? (
        <>
          <SectionHeader title="Par véhicule" icon="car" />
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {byVehicle.map((entry, index) => (
              <View key={entry.vehicleId}>
                {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
                <ListRow
                  title={entry.label}
                  value={formatMoney(entry.total, { currency: '' }).trim()}
                  chevron
                  onPress={() => router.push(`/vehicule/${entry.vehicleId}`)}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <SectionHeader title="Écritures" icon="list" />
      <View style={styles.chips}>
        <Chip
          label={`Dépenses (${scoped.expenses.length})`}
          selected={tab === 'depenses'}
          onPress={() => setTab('depenses')}
        />
        <Chip
          label={`Encaissements (${scoped.payments.length})`}
          selected={tab === 'encaissements'}
          onPress={() => setTab('encaissements')}
        />
      </View>

      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        {tab === 'depenses' ? (
          recentExpenses.length === 0 ? (
            <EmptyState
              icon="receipt"
              title="Aucune dépense"
              message="Enregistrez une dépense depuis le bouton + pour la voir apparaître ici."
            />
          ) : (
            recentExpenses.map((expense, index) => {
              const category = data.expenseCategories.find((item) => item.id === expense.categoryId);
              return (
                <View key={expense.id}>
                  {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
                  <ListRow
                    title={category?.label ?? 'Dépense'}
                    subtitle={[
                      formatFr(expense.date),
                      vehicleName(data, expense.vehicleId),
                      expense.supplier === '' ? null : expense.supplier,
                    ]
                      .filter((part) => part !== null && part !== '')
                      .join(' · ')}
                    value={formatMoney(expense.amountCents, { currency: '' }).trim()}
                    chevron
                    onPress={() => router.push(`/vehicule/${expense.vehicleId}`)}
                  />
                </View>
              );
            })
          )
        ) : recentPayments.length === 0 ? (
          <EmptyState icon="banknote" title="Aucun encaissement" />
        ) : (
          recentPayments.map((payment, index) => {
            const status = effectivePaymentStatus(payment, today);
            const balance = paymentBalance(payment);
            return (
              <View key={payment.id}>
                {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
                <ListRow
                  title={tenantName(data, payment.tenantId)}
                  subtitle={`${formatFr(payment.dueDate)} · ${vehicleName(data, payment.vehicleId)}`}
                  value={formatMoney(payment.receivedCents, { currency: '' }).trim()}
                  valueColor={status === 'paye' ? 'success' : status === 'retard' || status === 'impaye' ? 'danger' : 'text'}
                  badge={
                    status === 'paye'
                      ? PAYMENT_STATUS_LABELS.paye
                      : balance.remainingCents > 0
                        ? { label: `${formatMoney(balance.remainingCents, { currency: '' }).trim()} restants`, tone: status === 'retard' || status === 'impaye' ? 'danger' : 'warn' }
                        : PAYMENT_STATUS_LABELS[status]
                  }
                  chevron
                  onPress={() => router.push(`/location/${payment.rentalId}`)}
                />
              </View>
            );
          })
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.md },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  separator: { height: StyleSheet.hairlineWidth },
});
