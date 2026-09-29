/**
 * Locations en cours et passées.
 *
 * L'ordre est celui de l'urgence : ce qui est en cours d'abord, puis ce qui commence
 * bientôt, puis l'historique. Chaque ligne en cours affiche le **prochain loyer attendu**
 * et son état — c'est la question qu'on se pose en ouvrant l'écran.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PAYMENT_STATUS_LABELS, RENTAL_STATUS_LABELS, FREQUENCY_LABELS } from '@/domain/catalog';
import { formatFr, todayIso } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { effectivePaymentStatus, paymentBalance, rentalPaymentTotals } from '@/domain/rental';
import type { Rental } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
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

type Filter = 'en_cours' | 'a_venir' | 'terminees' | 'toutes';

export default function RentalsScreen(): ReactElement {
  const { data } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const today = todayIso();

  const [filter, setFilter] = useState<Filter>('en_cours');

  const groups = useMemo(() => {
    const active = data.rentals.filter((rental) => rental.status === 'active');
    const upcoming = data.rentals
      .filter((rental) => rental.status === 'prevue')
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const finished = data.rentals
      .filter((rental) => rental.status === 'terminee' || rental.status === 'annulee')
      .sort((a, b) => (b.endDate ?? '').localeCompare(a.endDate ?? ''));
    return { active, upcoming, finished };
  }, [data.rentals]);

  const visible = useMemo(() => {
    if (filter === 'en_cours') return groups.active;
    if (filter === 'a_venir') return groups.upcoming;
    if (filter === 'terminees') return groups.finished;
    return [...groups.active, ...groups.upcoming, ...groups.finished];
  }, [filter, groups]);

  /** Prochain loyer non soldé d'une location, s'il y en a un. */
  function nextPayment(rental: Rental) {
    const payments = data.payments
      .filter((payment) => payment.rentalId === rental.id && payment.status !== 'annule')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return payments.find((payment) => !paymentBalance(payment).settled) ?? null;
  }

  return (
    <Screen
      header={
        <View>
          <ScreenTitle
            title="Locations"
            subtitle={
              groups.active.length === 0
                ? 'Aucune location en cours'
                : `${groups.active.length} location${groups.active.length > 1 ? 's' : ''} en cours`
            }
          />
          <View style={styles.actions}>
            <Button
              label="Nouvelle location"
              icon="plus"
              variant="secondary"
              onPress={() => router.push('/ajout/location')}
            />
          </View>
        </View>
      }
    >
      <View style={styles.chips}>
        <Chip
          label={`En cours (${groups.active.length})`}
          selected={filter === 'en_cours'}
          onPress={() => setFilter('en_cours')}
        />
        <Chip
          label={`À venir (${groups.upcoming.length})`}
          selected={filter === 'a_venir'}
          onPress={() => setFilter('a_venir')}
        />
        <Chip
          label={`Terminées (${groups.finished.length})`}
          selected={filter === 'terminees'}
          onPress={() => setFilter('terminees')}
        />
        <Chip label="Toutes" selected={filter === 'toutes'} onPress={() => setFilter('toutes')} />
      </View>

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon="key"
            title={filter === 'en_cours' ? 'Aucune location en cours' : 'Rien dans cette liste'}
            message="Créez une location depuis la fiche d'un véhicule : le contrat, les loyers et l'état des lieux en découlent."
            action={
              <Button
                label="Nouvelle location"
                icon="plus"
                onPress={() => router.push('/ajout/location')}
              />
            }
          />
        </Card>
      ) : (
        visible.map((rental) => {
          const payment = nextPayment(rental);
          const totals = rentalPaymentTotals(data.payments.filter((p) => p.rentalId === rental.id), today);
          const status = payment === null ? null : effectivePaymentStatus(payment, today);

          return (
            <Card
              key={rental.id}
              style={{ marginBottom: spacing.md }}
              onPress={() => router.push(`/location/${rental.id}`)}
            >
              <View style={styles.row}>
                <IconBubble
                  icon="key"
                  size={44}
                  tone={rental.status === 'active' ? 'accent' : rental.status === 'prevue' ? 'info' : 'neutral'}
                />
                <View style={styles.rowBody}>
                  <AppText variant="title" numberOfLines={1}>
                    {tenantName(data, rental.tenantId)}
                  </AppText>
                  <AppText variant="small" color="textMuted" numberOfLines={1}>
                    {vehicleName(data, rental.vehicleId)}
                  </AppText>
                </View>
                <Badge {...RENTAL_STATUS_LABELS[rental.status]} />
              </View>

              <View style={[styles.meta, { borderTopColor: colors.separator }]}>
                <Meta
                  label="Loyer"
                  value={`${formatMoney(rental.rentAmountCents, { currency: '' }).trim()} ${FREQUENCY_LABELS[rental.frequency].toLowerCase()}`}
                />
                <Meta
                  label="Du"
                  value={`${formatFr(rental.startDate)}${rental.endDate === null ? ' →' : ` → ${formatFr(rental.endDate)}`}`}
                />
              </View>

              {payment === null ? (
                totals.lateCents > 0 ? (
                  <ListRow
                    icon="alert-triangle"
                    iconTone="danger"
                    title="Tout est encaissé"
                    subtitle="Aucune échéance en attente"
                  />
                ) : null
              ) : (
                <ListRow
                  icon={status === 'retard' || status === 'impaye' ? 'alert-circle' : 'calendar'}
                  iconTone={status === 'retard' || status === 'impaye' ? 'danger' : 'accent'}
                  title={`Prochain loyer : ${formatMoney(paymentBalance(payment).remainingCents)}`}
                  subtitle={`Échéance du ${formatFr(payment.dueDate)}`}
                  badge={status === null ? undefined : PAYMENT_STATUS_LABELS[status]}
                />
              )}

              {totals.lateCents > 0 ? (
                <View style={styles.lateRow}>
                  <AppText variant="caption" color="danger">
                    {`Reste dû sur échéances échues : ${formatMoney(totals.lateCents)}`}
                  </AppText>
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      {filter === 'en_cours' && groups.active.length > 0 ? (
        <>
          <SectionHeader title="Actions" />
          <Button
            label="Nouvelle location"
            icon="plus"
            variant="secondary"
            block
            onPress={() => router.push('/ajout/location')}
          />
        </>
      ) : null}
    </Screen>
  );
}

function Meta({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="caption" color="textFaint">
        {label}
      </AppText>
      <AppText variant="small" numberOfLines={1} style={{ marginTop: 1 }}>
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
  meta: {
    flexDirection: 'row',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  lateRow: { marginTop: spacing.sm },
});
