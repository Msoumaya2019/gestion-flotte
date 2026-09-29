/**
 * Fiche véhicule — paiements, entretien, kilométrage.
 *
 * ## Ce que ces trois blocs ont en commun
 *
 * Ce sont les **flux** du véhicule : l'argent qui rentre, l'entretien qui sort, les
 * kilomètres qui défilent. Les trois s'affichent du plus récent au plus ancien, et les
 * trois proposent la même chose en bas de liste : un bouton pour ajouter, jamais un
 * formulaire au milieu de l'écran.
 */

import { useMemo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { PAYMENT_STATUS_LABELS } from '@/domain/catalog';
import { formatFr, formatLongFr } from '@/domain/dates';
import { intervalLabel, maintenanceStatus, nextMaintenanceDue } from '@/domain/maintenance';
import { formatKm, formatMoney, formatNumberFr } from '@/domain/money';
import { effectivePaymentStatus, rentalPaymentTotals } from '@/domain/rental';
import type { Vehicle } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { AppText } from '@/ui/components/text';
import {
  Badge,
  Card,
  EmptyState,
  KeyValue,
  ProgressBar,
  SectionHeader,
  StatTile,
} from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { MaintenanceRecordLine, MileageLine, PaymentLine } from '@/ui/lines';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

// ---------------------------------------------------------------------------
// Paiements
// ---------------------------------------------------------------------------

export function VehiclePaymentsSection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data, today } = useApp();
  const router = useRouter();
  const todayIso = today();

  const payments = useMemo(
    () =>
      data.payments
        .filter((payment) => payment.vehicleId === vehicle.id)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [data.payments, vehicle.id],
  );

  const totals = rentalPaymentTotals(payments, todayIso);

  if (payments.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="wallet"
          title="Aucune échéance"
          message="Les échéances apparaissent dès qu’une location est activée : elles sont engendrées depuis la fréquence du loyer."
        />
      </Card>
    );
  }

  return (
    <View>
      <View style={styles.tiles}>
        <StatTile
          label="Encaissé"
          value={formatMoney(totals.receivedCents, { currency: '' }).trim()}
          tone="ok"
          icon="wallet"
        />
        <StatTile
          label="Facturé"
          value={formatMoney(totals.expectedCents, { currency: '' }).trim()}
          icon="receipt"
        />
      </View>
      <View style={[styles.tiles, { marginTop: spacing.sm }]}>
        <StatTile
          label="En retard"
          value={formatMoney(totals.lateCents, { currency: '' }).trim()}
          tone={totals.lateCents > 0 ? 'danger' : 'neutral'}
          hint={totals.lateCount === 0 ? 'Aucune échéance en retard' : `${totals.lateCount} échéance(s)`}
          icon="alert-circle"
        />
        <StatTile
          label="Soldées"
          value={String(totals.paidCount)}
          hint={totals.partialCount === 0 ? undefined : `${totals.partialCount} partielle(s)`}
          icon="check-circle"
        />
      </View>

      <SectionHeader title={`${payments.length} échéance${payments.length > 1 ? 's' : ''}`} />
      <Card padded={false} style={styles.list}>
        {payments.map((payment, index) => (
          <View key={payment.id}>
            {index > 0 ? <Separator /> : null}
            <PaymentLine
              payment={payment}
              today={todayIso}
              title={formatFr(payment.dueDate)}
              subtitle={[
                PAYMENT_STATUS_LABELS[effectivePaymentStatus(payment, todayIso)].label,
                payment.payerName,
                payment.comment,
              ]
                .filter((part) => part !== '')
                .join(' · ')}
              onPress={() => router.push(`/ajout/paiement?paymentId=${payment.id}`)}
            />
          </View>
        ))}
      </Card>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Entretien
// ---------------------------------------------------------------------------

export function VehicleMaintenanceSection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data, today } = useApp();
  const router = useRouter();
  const todayIso = today();

  const plans = data.maintenancePlans.filter((plan) => plan.vehicleId === vehicle.id && plan.active);
  const records = useMemo(
    () =>
      data.maintenanceRecords
        .filter((record) => record.vehicleId === vehicle.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.maintenanceRecords, vehicle.id],
  );

  const typeLabel = (typeId: string): string =>
    data.maintenanceTypes.find((type) => type.id === typeId)?.label ?? 'Entretien';

  return (
    <View>
      <SectionHeader title="Échéances à venir" icon="clock" />
      {plans.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Aucun plan d’entretien sur ce véhicule. Un plan se crée en enregistrant une
            intervention : l’intervalle est celui que vous choisissez, aucune fréquence n’est
            imposée.
          </AppText>
        </Card>
      ) : (
        plans
          .map((plan) => {
            const due = nextMaintenanceDue(plan);
            const status = maintenanceStatus(due, vehicle.currentMileageKm, todayIso, {
              warningKm: data.settings.maintenanceWarningKm,
              criticalKm: data.settings.maintenanceCriticalKm,
              warningDays: data.settings.maintenanceWarningDays,
              criticalDays: data.settings.maintenanceCriticalDays,
            });
            return { plan, due, status };
          })
          .sort((a, b) => {
            const order = { depasse: 0, proche: 1, inconnu: 2, ok: 3 } as const;
            return order[a.status.state] - order[b.status.state];
          })
          .map(({ plan, due, status }) => (
            <Card key={plan.id} style={{ marginBottom: spacing.md }}>
              <View style={styles.rowBetween}>
                <AppText variant="title">{typeLabel(plan.typeId)}</AppText>
                <Badge
                  label={
                    status.state === 'depasse'
                      ? 'Dépassé'
                      : status.state === 'proche'
                        ? 'À prévoir'
                        : status.state === 'ok'
                          ? 'À jour'
                          : 'Intervalle non défini'
                  }
                  tone={
                    status.state === 'depasse'
                      ? 'danger'
                      : status.state === 'proche'
                        ? 'warn'
                        : status.state === 'ok'
                          ? 'ok'
                          : 'neutral'
                  }
                />
              </View>
              <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                {intervalLabel(plan.intervalMode, plan.intervalKm, plan.intervalMonths)}
              </AppText>

              <View style={{ marginTop: spacing.md }}>
                <KeyValue
                  label="Dernière intervention"
                  value={
                    plan.lastDate === null && plan.lastKm === null
                      ? 'inconnue'
                      : `${plan.lastDate === null ? '—' : formatFr(plan.lastDate)} · ${plan.lastKm === null ? '—' : formatKm(plan.lastKm)}`
                  }
                  mono
                />
                <KeyValue
                  label="Prochaine échéance"
                  value={
                    due.nextKm === null && due.nextDate === null
                      ? 'à définir'
                      : [due.nextKm === null ? '' : formatKm(due.nextKm), due.nextDate === null ? '' : formatFr(due.nextDate)]
                          .filter((part) => part !== '')
                          .join(' · ')
                  }
                  mono
                />
                {status.kmRemaining === null ? null : (
                  <KeyValue
                    label="Reste"
                    value={
                      status.kmRemaining > 0
                        ? `${formatNumberFr(status.kmRemaining)} km`
                        : `dépassé de ${formatNumberFr(Math.abs(status.kmRemaining))} km`
                    }
                    valueColor={status.kmRemaining <= 0 ? 'danger' : 'text'}
                    mono
                  />
                )}
              </View>

              {status.kmRemaining === null || status.kmRemaining <= 0 ? null : (
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar
                    ratio={
                      plan.intervalKm === null || plan.intervalKm === 0
                        ? 0
                        : Math.max(0, Math.min(1, 1 - status.kmRemaining / plan.intervalKm))
                    }
                    tone={status.state === 'proche' ? 'warn' : 'accent'}
                  />
                </View>
              )}
            </Card>
          ))
      )}

      <SectionHeader title={`Historique (${records.length})`} icon="wrench" />
      {records.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Aucune intervention enregistrée.
          </AppText>
        </Card>
      ) : (
        <Card padded={false} style={styles.list}>
          {records.map((record, index) => (
            <View key={record.id}>
              {index > 0 ? <Separator /> : null}
              <MaintenanceRecordLine record={record} typeLabel={typeLabel(record.typeId)} />
            </View>
          ))}
        </Card>
      )}

      <View style={{ height: spacing.lg }} />
      <Button
        label="Enregistrer une intervention"
        icon="plus"
        variant="secondary"
        block
        onPress={() => router.push(`/ajout/entretien?vehicleId=${vehicle.id}`)}
      />
      <View style={{ height: spacing.sm }} />
      <AppText variant="caption" color="textFaint">
        Enregistrer une intervention avance l’échéance du plan et met à jour le kilométrage.
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Kilométrage
// ---------------------------------------------------------------------------

export function VehicleMileageSection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data } = useApp();
  const router = useRouter();

  /** Relevés du plus récent au plus ancien, avec l'écart par rapport au précédent. */
  const records = useMemo(() => {
    const ascending = data.mileageRecords
      .filter((record) => record.vehicleId === vehicle.id)
      .sort((a, b) => a.date.localeCompare(b.date) || a.km - b.km);
    const withDelta = ascending.map((record, index) => ({
      record,
      deltaKm: index === 0 ? null : Math.max(0, record.km - (ascending[index - 1]?.km ?? record.km)),
    }));
    return withDelta.reverse();
  }, [data.mileageRecords, vehicle.id]);

  const total = records.length === 0 ? 0 : records[0]!.record.km - (records[records.length - 1]?.record.km ?? 0);

  return (
    <View>
      <View style={styles.tiles}>
        <StatTile label="Compteur actuel" value={formatKm(vehicle.currentMileageKm)} icon="gauge" />
        <StatTile
          label="Depuis l’achat"
          value={formatKm(Math.max(0, vehicle.currentMileageKm - vehicle.purchaseMileageKm))}
          icon="trending-up"
        />
      </View>
      <View style={[styles.tiles, { marginTop: spacing.sm }]}>
        <StatTile label="Relevés" value={String(records.length)} icon="list" />
        <StatTile label="Couvert par les relevés" value={formatKm(Math.max(0, total))} icon="clock" />
      </View>

      <SectionHeader title="Historique des relevés" />
      {records.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Aucun relevé. Le kilométrage se met aussi à jour en enregistrant une dépense, un
            entretien ou un état des lieux.
          </AppText>
        </Card>
      ) : (
        <Card padded={false} style={styles.list}>
          {records.map((entry, index) => (
            <View key={entry.record.id}>
              {index > 0 ? <Separator /> : null}
              <MileageLine record={entry.record} deltaKm={entry.deltaKm} />
            </View>
          ))}
        </Card>
      )}

      <View style={{ height: spacing.lg }} />
      <Button
        label="Nouveau relevé"
        icon="plus"
        variant="secondary"
        block
        onPress={() => router.push(`/ajout/kilometrage?vehicleId=${vehicle.id}`)}
      />
      <View style={{ height: spacing.sm }} />
      <AppText variant="caption" color="textFaint">
        {`Dernière mise à jour : ${records.length === 0 ? '—' : formatLongFr(records[0]!.record.date)}`}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------

export function Separator(): ReactElement {
  const { colors } = useTheme();
  return <View style={[styles.separator, { backgroundColor: colors.separator }]} />;
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg },
  separator: { height: StyleSheet.hairlineWidth },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
