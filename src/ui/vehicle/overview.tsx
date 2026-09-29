/**
 * Fiche véhicule — résumé, location en cours, finances.
 *
 * ## Trois questions, trois blocs
 *
 * Un propriétaire ouvre la fiche d'un véhicule pour savoir **où il en est** (résumé), **qui
 * le conduit et ce qui est dû** (location en cours), et **combien il rapporte** (finances).
 * L'ordre des blocs suit cet ordre-là, et non l'ordre des tables en base.
 *
 * ## Les alertes passent avant les chiffres
 *
 * Ce qui ne va pas est en haut : loyer en retard, document expiré, entretien dépassé. Un
 * total encaissé n'a aucune urgence ; une assurance périmée en a une.
 */

import { useState, type ReactElement } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  AMORTIZATION_METHOD_LABELS,
  FREQUENCY_LABELS,
  FUEL_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
} from '@/domain/catalog';
import { formatFr, formatLongFr } from '@/domain/dates';
import { formatKm, formatMoney, formatPercent } from '@/domain/money';
import { rentalKmUsage, scheduleLabel } from '@/domain/rental';
import { VEHICLE_STATUSES, type Vehicle, type VehicleStatus } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { currentRentalForVehicle, tenantName, vehicleAlerts, vehicleFinancials } from '@/state/use-derived';
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
import { Button, Chip } from '@/ui/components/button';
import { ProgressRing } from '@/ui/components/charts';
import { Icon } from '@/ui/components/icons';
import { useVaultImage } from '@/ui/use-vault-image';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

// ---------------------------------------------------------------------------
// Résumé
// ---------------------------------------------------------------------------

export function VehicleSummarySection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data, repositories, refresh, now } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const photo = useVaultImage(vehicle.photoFileId);
  const alerts = vehicleAlerts(data, vehicle.id);
  const name = `${vehicle.brand} ${vehicle.model}`.trim();

  async function changeStatus(status: VehicleStatus): Promise<void> {
    if (repositories === null || status === vehicle.status) return;
    setBusy(true);
    try {
      await repositories.vehicles.setStatus(vehicle.id, status, now());
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View>
      {vehicle.photoFileId === null ? null : (
        <Card padded={false} style={styles.photoCard}>
          {photo.uri === null ? (
            <View style={[styles.photoPlaceholder, { backgroundColor: colors.surfaceSunken }]}>
              <AppText variant="caption" color="textMuted">
                {photo.loading ? 'Déchiffrement…' : (photo.error ?? 'Photo indisponible')}
              </AppText>
            </View>
          ) : (
            <Image source={{ uri: photo.uri }} style={styles.photo} resizeMode="cover" />
          )}
        </Card>
      )}

      {alerts.length === 0 ? null : (
        <Card style={{ marginBottom: spacing.lg, borderColor: colors.warning }}>
          <SectionHeader title="À traiter" icon="alert-circle" />
          {alerts.map((alert, index) => (
            <View key={`${alert.kind}-${index}`} style={styles.alertRow}>
              <Icon
                name={alert.tone === 'danger' ? 'alert-circle' : 'clock'}
                size={15}
                color={alert.tone === 'danger' ? colors.danger : colors.warning}
                strokeWidth={2}
              />
              <AppText
                variant="small"
                color={alert.tone === 'danger' ? 'danger' : 'warning'}
                style={{ marginLeft: 6, flex: 1 }}
              >
                {alert.message}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.identity}>
          <View style={{ flex: 1 }}>
            <AppText variant="heading" numberOfLines={1}>
              {name === '' ? vehicle.plate || 'Véhicule' : name}
            </AppText>
            <AppText variant="small" color="textMuted">
              {[vehicle.trim, vehicle.year === null ? '' : String(vehicle.year)]
                .filter((part) => part !== '')
                .join(' · ')}
            </AppText>
          </View>
          <Badge {...VEHICLE_STATUS_LABELS[vehicle.status]} />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <KeyValue label="Immatriculation" value={vehicle.plate === '' ? '—' : vehicle.plate} mono />
          <KeyValue label="Numéro de châssis" value={vehicle.vin === '' ? '—' : vehicle.vin} mono />
          <KeyValue label="Énergie" value={FUEL_TYPE_LABELS[vehicle.fuelType]} />
          <KeyValue
            label="Date d’achat"
            value={vehicle.purchaseDate === null ? '—' : formatLongFr(vehicle.purchaseDate)}
          />
          <KeyValue label="Prix d’achat" value={formatMoney(vehicle.purchasePriceCents)} mono />
          <KeyValue label="Frais d’acquisition" value={formatMoney(vehicle.purchaseFeesCents)} mono />
          <KeyValue label="Km à l’achat" value={formatKm(vehicle.purchaseMileageKm)} mono />
          <KeyValue label="Km actuel" value={formatKm(vehicle.currentMileageKm)} mono />
          <KeyValue
            label="Amortissement"
            value={`${vehicle.amortizationMonths} mois · ${AMORTIZATION_METHOD_LABELS[vehicle.amortizationMethod].toLowerCase()}`}
          />
        </View>

        {vehicle.notes.trim() === '' ? null : (
          <View style={[styles.notes, { borderTopColor: colors.separator }]}>
            <AppText variant="small" color="textMuted">
              {vehicle.notes}
            </AppText>
          </View>
        )}
      </Card>

      <SectionHeader title="État du véhicule" />
      <View style={styles.chips}>
        {VEHICLE_STATUSES.map((status) => (
          <Chip
            key={status}
            label={VEHICLE_STATUS_LABELS[status].label}
            selected={vehicle.status === status}
            onPress={() => void changeStatus(status)}
          />
        ))}
      </View>
      {busy ? (
        <AppText variant="caption" color="textFaint">
          Enregistrement…
        </AppText>
      ) : null}

      <SectionHeader title="Actions" />
      <Button
        label="Modifier la fiche"
        icon="edit"
        variant="secondary"
        block
        style={{ marginBottom: spacing.sm }}
        onPress={() => router.push(`/ajout/vehicule?id=${vehicle.id}`)}
      />
      <Button
        label="Relever le kilométrage"
        icon="gauge"
        variant="secondary"
        block
        style={{ marginBottom: spacing.sm }}
        onPress={() => router.push(`/ajout/kilometrage?vehicleId=${vehicle.id}`)}
      />
      <Button
        label="Nouvelle location"
        icon="key"
        variant="secondary"
        block
        style={{ marginBottom: spacing.sm }}
        onPress={() => router.push(`/ajout/location?vehicleId=${vehicle.id}`)}
      />
      <Button
        label="Ajouter un document"
        icon="folder"
        variant="secondary"
        block
        onPress={() => router.push(`/ajout/document?vehicleId=${vehicle.id}`)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Location en cours
// ---------------------------------------------------------------------------

export function VehicleRentalSection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data, today } = useApp();
  const router = useRouter();
  const todayIso = today();

  const rental = currentRentalForVehicle(data, vehicle.id);

  if (rental === null) {
    const past = data.rentals.filter(
      (candidate) => candidate.vehicleId === vehicle.id && candidate.status === 'terminee',
    );
    return (
      <View>
        <Card>
          <EmptyState
            icon="key"
            title="Aucune location en cours"
            message={
              past.length === 0
                ? 'Ce véhicule n’a jamais été loué.'
                : `${past.length} location${past.length > 1 ? 's' : ''} terminée${past.length > 1 ? 's' : ''} dans l’historique.`
            }
            action={
              <Button
                label="Créer une location"
                icon="plus"
                onPress={() => router.push(`/ajout/location?vehicleId=${vehicle.id}`)}
              />
            }
          />
        </Card>
      </View>
    );
  }

  const payments = data.payments.filter((payment) => payment.rentalId === rental.id);
  const next = payments
    .filter((payment) => payment.receivedCents < payment.expectedCents && payment.status !== 'annule')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const usage = rentalKmUsage(rental, vehicle.currentMileageKm);

  return (
    <View>
      <Card style={{ marginBottom: spacing.lg }} onPress={() => router.push(`/location/${rental.id}`)}>
        <View style={styles.identity}>
          <View style={{ flex: 1 }}>
            <AppText variant="title" numberOfLines={1}>
              {tenantName(data, rental.tenantId)}
            </AppText>
            <AppText variant="small" color="textMuted">
              {rental.openEnded || rental.endDate === null
                ? `Depuis le ${formatFr(rental.startDate)}, sans date de fin`
                : `Du ${formatFr(rental.startDate)} au ${formatFr(rental.endDate)}`}
            </AppText>
          </View>
          <Badge label="En cours" tone="accent" />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <KeyValue
            label="Loyer"
            value={`${formatMoney(rental.rentAmountCents)} · ${FREQUENCY_LABELS[rental.frequency].toLowerCase()}`}
            mono
          />
          <KeyValue label="Échéance" value={scheduleLabel(rental)} />
          <KeyValue label="Caution" value={formatMoney(rental.depositCents)} mono />
          <KeyValue
            label="Kilométrage autorisé"
            value={rental.allowedKm === null ? 'Illimité' : formatKm(rental.allowedKm)}
            mono
          />
        </View>
      </Card>

      <SectionHeader title="Kilométrage de la location" />
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.kmRow}>
          <KmStat label="Au départ" value={formatKm(usage.startKm)} />
          <KmStat label="Aujourd’hui" value={formatKm(usage.currentKm)} />
          <KmStat label="Parcourus" value={formatKm(usage.drivenKm)} />
        </View>
        {usage.allowedKm === null ? (
          <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
            Kilométrage illimité sur cette location.
          </AppText>
        ) : (
          <View style={{ marginTop: spacing.md }}>
            <ProgressBar
              ratio={usage.percentUsed === null ? 0 : usage.percentUsed / 100}
              tone={usage.exceededKm > 0 ? 'danger' : 'accent'}
            />
            <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
              {usage.exceededKm > 0
                ? `Dépassement de ${formatKm(usage.exceededKm)} — ${formatMoney(usage.excessCostCents)} à facturer.`
                : `${formatKm(usage.remainingKm ?? 0)} restants sur ${formatKm(usage.allowedKm)}.`}
            </AppText>
          </View>
        )}
      </Card>

      <SectionHeader title="Prochaine échéance" />
      {next === undefined ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Toutes les échéances de cette location sont soldées.
          </AppText>
        </Card>
      ) : (
        <Card
          style={{ marginBottom: spacing.lg }}
          onPress={() => router.push(`/ajout/paiement?paymentId=${next.id}`)}
        >
          <KeyValue label="Échéance du" value={formatFr(next.dueDate)} mono />
          <KeyValue label="Attendu" value={formatMoney(next.expectedCents)} mono />
          <KeyValue
            label="Reste dû"
            value={formatMoney(Math.max(0, next.expectedCents - next.receivedCents))}
            valueColor={next.dueDate < todayIso ? 'danger' : 'text'}
            mono
          />
        </Card>
      )}

      <Button
        label="Voir la location"
        icon="chevron-right"
        variant="secondary"
        block
        style={{ marginBottom: spacing.sm }}
        onPress={() => router.push(`/location/${rental.id}`)}
      />
      <Button
        label="Terminer la location"
        icon="check-circle"
        variant="secondary"
        block
        onPress={() => router.push(`/retour/${rental.id}`)}
      />
      <View style={{ height: spacing.sm }} />
      <AppText variant="caption" color="textFaint">
        {`Contrat, états des lieux et documents : voir la fiche de la location.`}
      </AppText>
    </View>
  );
}

function KmStat({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="caption" color="textFaint">
        {label}
      </AppText>
      <AppText variant="title" tabular style={{ marginTop: 2 }} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Finances
// ---------------------------------------------------------------------------

export function VehicleFinanceSection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data } = useApp();
  const { colors } = useTheme();
  const financials = vehicleFinancials(data, vehicle.id);

  if (financials === null) {
    return (
      <Card>
        <EmptyState icon="chart-bar" title="Pas encore de données" message="Ce véhicule est introuvable." />
      </Card>
    );
  }

  const { amortization, recovery } = financials;

  return (
    <View>
      <View style={styles.tiles}>
        <StatTile
          label="Encaissé"
          value={formatMoney(financials.revenueCents, { currency: '' }).trim()}
          icon="wallet"
          tone="ok"
        />
        <StatTile
          label="Dépenses"
          value={formatMoney(financials.expenseCents, { currency: '' }).trim()}
          icon="receipt"
          tone="warn"
        />
      </View>
      <View style={[styles.tiles, { marginTop: spacing.sm }]}>
        <StatTile
          label="Résultat net"
          value={formatMoney(financials.netCents, { currency: '' }).trim()}
          icon="trending-up"
          tone={financials.netCents >= 0 ? 'ok' : 'danger'}
        />
        <StatTile
          label="Coût / km"
          value={`${(financials.costPerKmCents / 100).toFixed(2).replace('.', ',')} €`}
          icon="gauge"
        />
      </View>

      <SectionHeader title="Récupération de l’investissement" icon="percent" />
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.recovery}>
          <ProgressRing
            ratio={recovery.progressPercent / 100}
            label={formatPercent(recovery.progressPercent, 0)}
            caption={recovery.recovered ? 'Investissement remboursé' : 'en cours de remboursement'}
            color={recovery.recovered ? colors.success : colors.primary}
          />
          <View style={{ flex: 1, marginLeft: spacing.lg }}>
            <KeyValue label="Investissement" value={formatMoney(recovery.investmentCents)} mono />
            <KeyValue label="Revenus" value={formatMoney(recovery.revenueCents)} mono />
            <KeyValue label="Dépenses" value={formatMoney(recovery.expenseCents)} mono />
            <KeyValue
              label="Récupéré"
              value={formatMoney(recovery.recoveredCents)}
              valueColor="success"
              mono
            />
            <KeyValue
              label="Reste à récupérer"
              value={formatMoney(recovery.remainingCents)}
              valueColor={recovery.remainingCents > 0 ? 'warning' : 'text'}
              mono
            />
          </View>
        </View>
        {recovery.recoveredPercent !== null && recovery.recoveredPercent > 100 ? (
          <AppText variant="caption" color="success" style={{ marginTop: spacing.sm }}>
            {`Récupéré à ${formatPercent(recovery.recoveredPercent)} : le véhicule a rapporté plus que son prix.`}
          </AppText>
        ) : null}
      </Card>

      <SectionHeader title="Amortissement" icon="trending-up" />
      <Card style={{ marginBottom: spacing.lg }}>
        <KeyValue label="Base amortissable" value={formatMoney(amortization.basisCents)} mono />
        <KeyValue label="Dotation mensuelle" value={formatMoney(amortization.monthlyCents)} mono />
        <KeyValue label="Déjà amorti" value={formatMoney(amortization.cumulativeCents)} mono />
        <KeyValue
          label="Reste à amortir"
          value={formatMoney(amortization.remainingCents)}
          valueColor={amortization.remainingCents > 0 ? 'text' : 'success'}
          mono
        />
        <KeyValue label="Fin prévue" value={formatLongFr(amortization.endDate)} />
        <View style={{ marginTop: spacing.md }}>
          <ProgressBar ratio={amortization.progressPercent / 100} tone={amortization.finished ? 'ok' : 'accent'} />
          <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
            {`${amortization.elapsedMonths} mois sur ${vehicle.amortizationMonths} · ${formatPercent(amortization.progressPercent, 0)}`}
          </AppText>
        </View>
      </Card>

      <SectionHeader title="Moyennes mensuelles" icon="chart-line" />
      <Card style={{ marginBottom: spacing.lg }}>
        <KeyValue label="Revenus" value={`${formatMoney(financials.monthlyRevenueCents)} / mois`} mono />
        <KeyValue label="Dépenses" value={`${formatMoney(financials.monthlyExpenseCents)} / mois`} mono />
        <KeyValue
          label="Résultat"
          value={`${formatMoney(financials.monthlyNetCents)} / mois`}
          valueColor={financials.monthlyNetCents >= 0 ? 'success' : 'danger'}
          mono
        />
        <KeyValue label="Entretien cumulé" value={formatMoney(financials.maintenanceCents)} mono />
        <KeyValue label="Kilomètres parcourus" value={formatKm(financials.kmDriven)} mono />
        <KeyValue
          label="Rendement sur prix d’achat"
          value={
            financials.yieldOnPurchasePercent === null
              ? '—'
              : formatPercent(financials.yieldOnPurchasePercent)
          }
          mono
        />
        <KeyValue
          label="Rendement annualisé"
          value={
            financials.annualizedYieldPercent === null
              ? '—'
              : formatPercent(financials.annualizedYieldPercent)
          }
          mono
        />
      </Card>

      <View style={[styles.note, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
        <AppText variant="caption" color="textMuted">
          Les revenus comptent l’argent réellement reçu, pas ce qui est facturé : un loyer
          impayé n’a pas remboursé l’investissement. Les dépenses d’entretien sont reconnues à
          leur catégorie.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photoCard: { marginBottom: spacing.lg, overflow: 'hidden' },
  photo: { width: '100%', height: 180 },
  photoPlaceholder: { height: 180, alignItems: 'center', justifyContent: 'center' },
  identity: { flexDirection: 'row', alignItems: 'center' },
  alertRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  notes: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  kmRow: { flexDirection: 'row' },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  recovery: { flexDirection: 'row', alignItems: 'center' },
  note: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
