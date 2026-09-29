/**
 * Liste des véhicules.
 *
 * Chaque ligne porte les trois informations qui décident : l'état, le kilométrage, et ce
 * qui ne va pas. Un véhicule sans alerte n'affiche **rien** à la place — une pastille
 * « RAS » sur quinze lignes rend les deux vraies alertes invisibles.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { VEHICLE_STATUS_LABELS } from '@/domain/catalog';
import { formatKm, formatMoney, formatPercent } from '@/domain/money';
import { VEHICLE_STATUSES, type VehicleStatus } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { vehicleAlerts, vehicleFinancials } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import {
  Badge,
  Card,
  EmptyState,
  IconBubble,
  Screen,
  ScreenTitle,
  SectionHeader,
} from '@/ui/components/base';
import { Button, Chip } from '@/ui/components/button';
import { Icon } from '@/ui/components/icons';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type SortKey = 'rentabilite' | 'kilometrage' | 'recent';

export default function VehiclesScreen(): ReactElement {
  const { data } = useApp();
  const { colors } = useTheme();
  const router = useRouter();

  const [status, setStatus] = useState<VehicleStatus | null>(null);
  const [sort, setSort] = useState<SortKey>('rentabilite');
  const [showSold, setShowSold] = useState(false);

  const vehicles = useMemo(() => {
    const filtered = data.vehicles.filter((vehicle) => {
      if (!showSold && vehicle.status === 'vendu') return false;
      if (status !== null && vehicle.status !== status) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sort === 'kilometrage') return b.currentMileageKm - a.currentMileageKm;
      if (sort === 'recent') return (b.purchaseDate ?? '').localeCompare(a.purchaseDate ?? '');
      const netA = vehicleFinancials(data, a.id)?.netCents ?? 0;
      const netB = vehicleFinancials(data, b.id)?.netCents ?? 0;
      return netB - netA;
    });
  }, [data, status, sort, showSold]);

  const soldCount = data.vehicles.filter((vehicle) => vehicle.status === 'vendu').length;

  return (
    <Screen
      header={
        <View>
          <ScreenTitle
            title="Véhicules"
            subtitle={`${data.vehicles.length} véhicule${data.vehicles.length > 1 ? 's' : ''} au total`}
          />
          <View style={styles.actions}>
            <Button
              label="Ajouter"
              icon="plus"
              onPress={() => router.push('/ajout/vehicule')}
              variant="secondary"
            />
          </View>
        </View>
      }
    >
      <View style={styles.chips}>
        <Chip label="Tous" selected={status === null} onPress={() => setStatus(null)} />
        {VEHICLE_STATUSES.map((candidate) => (
          <Chip
            key={candidate}
            label={VEHICLE_STATUS_LABELS[candidate].label}
            selected={status === candidate}
            onPress={() => setStatus(status === candidate ? null : candidate)}
          />
        ))}
      </View>

      <View style={styles.chips}>
        <Chip
          label="Par rentabilité"
          selected={sort === 'rentabilite'}
          onPress={() => setSort('rentabilite')}
        />
        <Chip
          label="Par kilométrage"
          selected={sort === 'kilometrage'}
          onPress={() => setSort('kilometrage')}
        />
        <Chip label="Plus récents" selected={sort === 'recent'} onPress={() => setSort('recent')} />
        {soldCount === 0 ? null : (
          <Chip
            label={showSold ? 'Masquer les vendus' : `Voir les vendus (${soldCount})`}
            selected={showSold}
            onPress={() => setShowSold(!showSold)}
          />
        )}
      </View>

      {vehicles.length === 0 ? (
        <Card>
          <EmptyState
            icon="car"
            title={status === null ? 'Aucun véhicule' : 'Aucun véhicule dans cet état'}
            message={
              status === null
                ? 'Ajoutez votre premier véhicule pour suivre ses loyers, ses dépenses et sa rentabilité.'
                : 'Changez de filtre pour voir les autres véhicules.'
            }
            action={
              status === null ? (
                <Button label="Ajouter un véhicule" icon="plus" onPress={() => router.push('/ajout/vehicule')} />
              ) : (
                <Button label="Voir tous les véhicules" variant="secondary" onPress={() => setStatus(null)} />
              )
            }
          />
        </Card>
      ) : (
        vehicles.map((vehicle) => {
          const financials = vehicleFinancials(data, vehicle.id);
          const alerts = vehicleAlerts(data, vehicle.id);
          const label = `${vehicle.brand} ${vehicle.model}`.trim();
          const recovered = financials?.recovery.recoveredPercent ?? null;

          return (
            <Card
              key={vehicle.id}
              style={{ marginBottom: spacing.md }}
              onPress={() => router.push(`/vehicule/${vehicle.id}`)}
            >
              <View style={styles.row}>
                <IconBubble
                  icon="car"
                  size={44}
                  tone={
                    vehicle.status === 'loue'
                      ? 'accent'
                      : vehicle.status === 'disponible'
                        ? 'ok'
                        : vehicle.status === 'vendu'
                          ? 'neutral'
                          : 'warn'
                  }
                />
                <View style={styles.rowBody}>
                  <AppText variant="title" numberOfLines={1}>
                    {label === '' ? vehicle.plate : label}
                  </AppText>
                  <AppText variant="small" color="textMuted" numberOfLines={1}>
                    {[vehicle.trim, vehicle.plate].filter((part) => part !== '').join(' · ')}
                  </AppText>
                </View>
                <Badge {...VEHICLE_STATUS_LABELS[vehicle.status]} />
              </View>

              <View style={[styles.stats, { borderTopColor: colors.separator }]}>
                <Stat label="Kilométrage" value={formatKm(vehicle.currentMileageKm)} />
                <Stat
                  label="Encaissé"
                  value={financials === null ? '—' : formatMoney(financials.revenueCents, { currency: '' }).trim()}
                />
                <Stat
                  label="Résultat"
                  value={financials === null ? '—' : formatMoney(financials.netCents, { currency: '' }).trim()}
                  tone={financials !== null && financials.netCents < 0 ? 'danger' : 'default'}
                />
                <Stat
                  label="Récupéré"
                  value={recovered === null ? '—' : formatPercent(recovered, 0)}
                  tone={recovered !== null && recovered >= 100 ? 'success' : 'default'}
                />
              </View>

              {alerts.length === 0 ? null : (
                <View style={styles.alerts}>
                  {alerts.slice(0, 3).map((alert, index) => (
                    <View key={`${alert.kind}-${index}`} style={styles.alertRow}>
                      <Icon
                        name={alert.tone === 'danger' ? 'alert-circle' : 'clock'}
                        size={13}
                        color={alert.tone === 'danger' ? colors.danger : colors.warning}
                        strokeWidth={2}
                      />
                      <AppText
                        variant="caption"
                        color={alert.tone === 'danger' ? 'danger' : 'warning'}
                        style={{ marginLeft: 5 }}
                      >
                        {alert.message}
                      </AppText>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          );
        })
      )}

      {vehicles.length === 0 ? null : (
        <>
          <SectionHeader title="Ajouter" />
          <Button
            label="Nouveau véhicule"
            icon="plus"
            variant="secondary"
            block
            onPress={() => router.push('/ajout/vehicule')}
          />
        </>
      )}
    </Screen>
  );
}

function Stat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}): ReactElement {
  const { colors } = useTheme();
  const color =
    tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.text;
  return (
    <View style={styles.stat}>
      <AppText variant="caption" color="textFaint" numberOfLines={1}>
        {label}
      </AppText>
      <AppText variant="small" tabular style={{ color, fontWeight: '600', marginTop: 1 }} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBody: { flex: 1, marginHorizontal: spacing.md },
  stats: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, paddingRight: spacing.sm },
  alerts: { marginTop: spacing.md },
  alertRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
});
