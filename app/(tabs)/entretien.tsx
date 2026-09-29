/**
 * Entretien : ce qui doit être fait, et ce qui a été fait.
 *
 * L'écran est séparé en deux, et l'ordre compte : d'abord les **échéances à venir**, triées
 * par urgence, ensuite l'**historique**. C'est l'inverse de la plupart des applications, qui
 * ouvrent sur un journal. Ici, ce qu'on vient chercher, c'est « qu'est-ce que je dois
 * prévoir » — l'historique sert à vérifier, pas à décider.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { formatFr, relativeDaysLabel } from '@/domain/dates';
import { formatKm, formatMoney, formatNumberFr } from '@/domain/money';
import { intervalLabel } from '@/domain/maintenance';
import { useApp } from '@/state/app-context';
import { maintenancePlanStatuses, vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import {
  Badge,
  Card,
  EmptyState,
  IconBubble,
  ListRow,
  Screen,
  ScreenTitle,
  SectionHeader,
} from '@/ui/components/base';
import { Button, Chip } from '@/ui/components/button';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type Tab = 'a_prevoir' | 'historique' | 'kilometrage';

const STATE_LABELS = {
  depasse: { label: 'Dépassé', tone: 'danger' as const },
  proche: { label: 'À prévoir', tone: 'warn' as const },
  ok: { label: 'À jour', tone: 'ok' as const },
  inconnu: { label: 'Non renseigné', tone: 'neutral' as const },
};

export default function MaintenanceScreen(): ReactElement {
  const { data } = useApp();
  const { colors } = useTheme();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>('a_prevoir');

  const planStatuses = useMemo(() => maintenancePlanStatuses(data), [data]);

  const records = useMemo(
    () => [...data.maintenanceRecords].sort((a, b) => b.date.localeCompare(a.date)),
    [data.maintenanceRecords],
  );

  const mileage = useMemo(
    () => [...data.mileageRecords].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60),
    [data.mileageRecords],
  );

  const urgentCount = planStatuses.filter(
    (entry) => entry.status.state === 'depasse' || entry.status.state === 'proche',
  ).length;

  const maintenanceTotal = useMemo(() => {
    const known = new Set(
      data.expenseCategories
        .filter((category) =>
          ['entretien', 'mécanique', 'mecanique', 'pneus', 'carrosserie', 'dépannage', 'depannage'].includes(
            category.label.trim().toLowerCase(),
          ),
        )
        .map((category) => category.id),
    );
    return data.expenses
      .filter((expense) => known.has(expense.categoryId))
      .reduce((sum, expense) => sum + expense.amountCents, 0);
  }, [data.expenses, data.expenseCategories]);

  return (
    <Screen
      header={
        <View>
          <ScreenTitle
            title="Entretien"
            subtitle={
              urgentCount === 0
                ? 'Tout est à jour'
                : `${urgentCount} intervention${urgentCount > 1 ? 's' : ''} à prévoir`
            }
          />
          <View style={styles.actions}>
            <Button
              label="Enregistrer un entretien"
              icon="plus"
              variant="secondary"
              onPress={() => router.push('/ajout/entretien')}
            />
          </View>
        </View>
      }
    >
      <View style={styles.chips}>
        <Chip
          label={`À prévoir (${planStatuses.length})`}
          selected={tab === 'a_prevoir'}
          onPress={() => setTab('a_prevoir')}
        />
        <Chip
          label={`Historique (${records.length})`}
          selected={tab === 'historique'}
          onPress={() => setTab('historique')}
        />
        <Chip label="Kilométrage" selected={tab === 'kilometrage'} onPress={() => setTab('kilometrage')} />
      </View>

      {tab === 'a_prevoir' ? (
        planStatuses.length === 0 ? (
          <Card>
            <EmptyState
              icon="wrench"
              title="Aucun entretien programmé"
              message="Créez un plan d'entretien depuis la fiche d'un véhicule : vidange, filtres, pneus, contrôle technique. L'échéance se calcule ensuite toute seule."
              action={
                <Button
                  label="Enregistrer un entretien"
                  icon="plus"
                  onPress={() => router.push('/ajout/entretien')}
                />
              }
            />
          </Card>
        ) : (
          <>
            <Card style={{ marginBottom: spacing.md }}>
              <AppText variant="small" color="textMuted">
                {`Total dépensé en entretien, tous véhicules : ${formatMoney(maintenanceTotal)}`}
              </AppText>
            </Card>

            {planStatuses.map((entry) => {
              const plan = data.maintenancePlans.find((candidate) => candidate.id === entry.planId);
              const state = STATE_LABELS[entry.status.state];
              const detail =
                entry.status.kmRemaining !== null
                  ? entry.status.kmRemaining <= 0
                    ? `Dépassé de ${formatKm(Math.abs(entry.status.kmRemaining))}`
                    : `${formatKm(entry.status.kmRemaining)} restants`
                  : entry.status.daysRemaining !== null
                    ? relativeDaysLabel(entry.status.daysRemaining)
                    : 'Échéance non calculable';

              return (
                <Card
                  key={entry.planId}
                  style={{ marginBottom: spacing.md }}
                  onPress={() => router.push(`/vehicule/${entry.vehicleId}`)}
                >
                  <View style={styles.row}>
                    <IconBubble
                      icon="wrench"
                      size={40}
                      tone={state.tone}
                    />
                    <View style={styles.rowBody}>
                      <AppText variant="title" numberOfLines={1}>
                        {entry.typeLabel}
                      </AppText>
                      <AppText variant="small" color="textMuted" numberOfLines={1}>
                        {entry.vehicleLabel}
                      </AppText>
                    </View>
                    <Badge {...state} />
                  </View>

                  <View style={[styles.detail, { borderTopColor: colors.separator }]}>
                    <AppText variant="small" color="textMuted">
                      {detail}
                    </AppText>
                    <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }}>
                      {[
                        plan === undefined
                          ? null
                          : intervalLabel(plan.intervalMode, plan.intervalKm, plan.intervalMonths),
                        entry.nextKm === null ? null : `prochain seuil à ${formatNumberFr(entry.nextKm)} km`,
                        entry.nextDate === null ? null : `ou le ${formatFr(entry.nextDate)}`,
                      ]
                        .filter((part) => part !== null && part !== '')
                        .join(' · ')}
                    </AppText>
                  </View>
                </Card>
              );
            })}
          </>
        )
      ) : null}

      {tab === 'historique' ? (
        records.length === 0 ? (
          <Card>
            <EmptyState
              icon="clipboard"
              title="Aucun entretien enregistré"
              message="Chaque intervention notée met à jour l'échéance suivante du véhicule."
            />
          </Card>
        ) : (
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {records.map((record, index) => {
              const type = data.maintenanceTypes.find((candidate) => candidate.id === record.typeId);
              return (
                <View key={record.id}>
                  {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
                  <ListRow
                    title={type?.label ?? 'Entretien'}
                    subtitle={[
                      formatFr(record.date),
                      vehicleName(data, record.vehicleId),
                      formatKm(record.mileageKm),
                      record.supplier === '' ? null : record.supplier,
                    ]
                      .filter((part) => part !== null && part !== '')
                      .join(' · ')}
                    value={formatMoney(record.amountCents, { currency: '' }).trim()}
                    chevron
                    onPress={() => router.push(`/vehicule/${record.vehicleId}`)}
                  />
                </View>
              );
            })}
          </Card>
        )
      ) : null}

      {tab === 'kilometrage' ? (
        mileage.length === 0 ? (
          <Card>
            <EmptyState
              icon="gauge"
              title="Aucun relevé"
              message="Relevez le compteur régulièrement : les échéances en kilomètres et le coût au kilomètre en dépendent."
            />
          </Card>
        ) : (
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {mileage.map((record, index) => (
              <View key={record.id}>
                {index > 0 ? <View style={[styles.separator, { backgroundColor: colors.separator }]} /> : null}
                <ListRow
                  title={formatKm(record.km)}
                  subtitle={`${formatFr(record.date)} · ${vehicleName(data, record.vehicleId)}`}
                  value={record.source === 'manuel' ? '' : sourceLabel(record.source)}
                  chevron
                  onPress={() => router.push(`/vehicule/${record.vehicleId}`)}
                />
              </View>
            ))}
          </Card>
        )
      ) : null}

      <SectionHeader title="Ajouter" />
      <Button
        label="Relever le kilométrage"
        icon="gauge"
        variant="secondary"
        block
        onPress={() => router.push('/ajout/kilometrage')}
      />
    </Screen>
  );
}

function sourceLabel(source: string): string {
  switch (source) {
    case 'entretien':
      return 'entretien';
    case 'etat_des_lieux':
      return 'état des lieux';
    case 'location':
      return 'location';
    case 'achat':
      return 'achat';
    default:
      return 'manuel';
  }
}

const styles = StyleSheet.create({
  actions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBody: { flex: 1, marginHorizontal: spacing.md },
  detail: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  separator: { height: StyleSheet.hairlineWidth },
});
