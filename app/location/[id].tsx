/**
 * Fiche d'une location.
 *
 * ## Le centre de gravité : l'échéancier
 *
 * Une location, c'est d'abord une suite d'échéances à encaisser. L'écran les montre toutes,
 * de la plus ancienne à la plus récente, avec pour chacune ce qui était attendu, ce qui a
 * été reçu et ce qui reste. Une échéance se règle en un tapotement depuis cette liste :
 * c'est le geste qui revient tous les mois, et il ne doit pas demander de naviguer.
 *
 * ## Ce qui n'est pas encore commencé
 *
 * Une location « prévue » n'a pas d'échéances et son véhicule est toujours disponible. Elle
 * s'active depuis cet écran, ou depuis le contrat après signature. Activer marque le
 * véhicule « loué » et engendre l'échéancier d'un seul coup — les trois écritures sont dans
 * une transaction, sinon une location active sans échéances passerait inaperçue.
 *
 * ## Les états des lieux
 *
 * Le départ et le retour sont deux documents distincts, et leur comparaison est ce qui
 * permet d'imputer un dommage. L'écran montre lequel manque : un retour sans état des lieux
 * de départ ne se conteste pas.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  CONTRACT_STATUS_LABELS,
  DEPOSIT_OUTCOME_LABELS,
  FREQUENCY_LABELS,
  PAYMENT_STATUS_LABELS,
  RENTAL_STATUS_LABELS,
} from '@/domain/catalog';
import { formatFr, formatLongFr } from '@/domain/dates';
import { formatKm, formatMoney, formatPercent } from '@/domain/money';
import {
  effectivePaymentStatus,
  nextUnsettledPayment,
  openEndedHorizon,
  paymentBalance,
  rentalKmUsage,
  rentalPaymentTotals,
  scheduleLabel,
} from '@/domain/rental';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import {
  Badge,
  Card,
  DetailTitle,
  EmptyState,
  KeyValue,
  ProgressBar,
  Screen,
  SectionHeader,
} from '@/ui/components/base';
import { Button, MenuRow } from '@/ui/components/button';
import { DamageLine, PaymentLine } from '@/ui/lines';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

export default function RentalDetailScreen(): ReactElement {
  const { data, repositories, refresh, now, today } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const todayIso = today();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rental = data.rentals.find((candidate) => candidate.id === params.id) ?? null;

  const payments = useMemo(
    () =>
      data.payments
        .filter((payment) => payment.rentalId === rental?.id)
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [data.payments, rental?.id],
  );

  const contracts = useMemo(
    () =>
      data.contracts
        .filter((contract) => contract.rentalId === rental?.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.contracts, rental?.id],
  );

  const damages = data.damages.filter((damage) => damage.rentalId === rental?.id);
  const expenses = data.expenses.filter((expense) => expense.rentalId === rental?.id);
  const inspections = data.inspections.filter((inspection) => inspection.rentalId === rental?.id);
  const departure = inspections.find((inspection) => inspection.kind === 'depart') ?? null;
  const returnInspection = inspections.find((inspection) => inspection.kind === 'retour') ?? null;

  if (rental === null) {
    return (
      <Screen>
        <DetailTitle title="Location" onBack={() => router.back()} />
        <Card>
          <EmptyState
            icon="key"
            title="Location introuvable"
            message="Cette location a peut-être été supprimée."
            action={<Button label="Voir les locations" onPress={() => router.replace('/locations')} />}
          />
        </Card>
      </Screen>
    );
  }

  const vehicle = data.vehicles.find((candidate) => candidate.id === rental.vehicleId) ?? null;
  const totals = rentalPaymentTotals(payments, todayIso);
  const nextPayment = nextUnsettledPayment(payments, todayIso);
  const kmUsage =
    vehicle === null
      ? null
      : rentalKmUsage(rental, vehicle.currentMileageKm);
  const expensesTotal = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
  const horizon = rental.endDate ?? openEndedHorizon(rental.startDate, 12);

  /**
   * Ce que les fonctions internes ont besoin de savoir, figé après la garde.
   *
   * Elles sont déclarées par `function`, donc **hissées** : TypeScript ne peut pas prouver
   * qu'elles s'exécutent après la garde ci-dessus, et redemande une vérification de nullité
   * à chaque usage — vérification impossible à satisfaire, puisque le retour anticipé a
   * déjà eu lieu. Mesuré : le narrowing traverse une fonction fléchée `const`, pas une
   * déclaration `function`.
   */
  const currentRental = rental;

  async function activate(): Promise<void> {
    if (repositories === null) return;
    setBusy(true);
    setError(null);
    try {
      await repositories.rentals.activate({
        id: currentRental.id,
        until: horizon,
        methodId: data.paymentMethods[0]?.id ?? null,
        now: now(),
      });
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Annuler une location marque aussi ses échéances « annulées ».
   *
   * Les laisser en attente ferait apparaître un montant dû sur un contrat qui n'existe
   * plus : le tableau de bord réclamerait un loyer que personne ne doit.
   */
  async function cancelRental(): Promise<void> {
    if (repositories === null) return;
    setBusy(true);
    setError(null);
    try {
      const timestamp = now();
      await repositories.rentals.update({
        ...currentRental,
        status: 'annulee',
        updatedAt: timestamp,
      });
      for (const payment of payments) {
        if (payment.status === 'annule') continue;
        if (paymentBalance(payment).settled) continue;
        await repositories.payments.update({ ...payment, status: 'annule', updatedAt: timestamp });
      }
      if (vehicle !== null && vehicle.status === 'loue') {
        await repositories.vehicles.setStatus(vehicle.id, 'disponible', timestamp);
      }
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const overdueCount = payments.filter((payment) => {
    const status = effectivePaymentStatus(payment, todayIso);
    return status === 'retard' || status === 'impaye';
  }).length;

  return (
    <Screen>
      <DetailTitle
        title={tenantName(data, rental.tenantId)}
        subtitle={`${vehicleName(data, rental.vehicleId)}${vehicle === null ? '' : ` · ${vehicle.plate}`}`}
        onBack={() => router.back()}
      />

      <View style={styles.statusRow}>
        <Badge {...RENTAL_STATUS_LABELS[rental.status]} />
        {rental.status === 'active' ? (
          <AppText variant="caption" color="textMuted" style={{ marginLeft: spacing.sm }}>
            {`Depuis le ${formatFr(rental.startDate)}`}
          </AppText>
        ) : null}
        {overdueCount > 0 ? (
          <AppText variant="caption" color="danger" style={{ marginLeft: spacing.sm }}>
            {`${overdueCount} échéance${overdueCount > 1 ? 's' : ''} en retard`}
          </AppText>
        ) : null}
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Ce qu'il y a à faire maintenant                                     */}
      {/* ------------------------------------------------------------------ */}

      {rental.status === 'prevue' ? (
        <Card style={{ marginBottom: spacing.lg, borderColor: colors.primary }}>
          <AppText variant="small" color="textMuted">
            Location prévue : le véhicule est toujours disponible et aucune échéance n’est
            encore programmée. L’activation marque le véhicule « loué » et engendre
            l’échéancier.
          </AppText>
          <View style={{ height: spacing.md }} />
          <Button
            label="Activer la location"
            icon="check-circle"
            loading={busy}
            block
            onPress={() => void activate()}
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label="Préparer le contrat"
            variant="secondary"
            icon="file-text"
            block
            onPress={() => router.push(`/contrat/${rental.id}`)}
          />
        </Card>
      ) : null}

      {rental.status === 'active' && nextPayment !== null ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {`Prochaine échéance : ${formatFr(nextPayment.dueDate)}`}
          </AppText>
          <View style={{ height: spacing.sm }} />
          <Button
            label={`Encaisser ${formatMoney(nextPayment.expectedCents - nextPayment.receivedCents)}`}
            icon="banknote"
            block
            onPress={() => router.push(`/ajout/paiement?paymentId=${nextPayment.id}`)}
          />
        </Card>
      ) : null}

      {rental.status === 'active' ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {`États des lieux — départ : ${departure === null ? 'absent' : formatFr(departure.date)} · retour : ${returnInspection === null ? 'absent' : formatFr(returnInspection.date)}`}
          </AppText>
          <View style={{ height: spacing.md }} />
          <Button
            label="Enregistrer le retour"
            icon="rotate"
            block
            onPress={() => router.push(`/retour/${rental.id}`)}
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label={departure === null ? 'Faire l’état des lieux de départ' : 'Revoir l’état des lieux de départ'}
            variant="secondary"
            icon="clipboard"
            block
            onPress={() => router.push(`/etat-lieux/${rental.id}?kind=depart`)}
          />
        </Card>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Conditions                                                          */}
      {/* ------------------------------------------------------------------ */}

      <SectionHeader title="Conditions" icon="key" />
      <Card>
        <KeyValue
          label="Durée"
          value={
            rental.openEnded || rental.endDate === null
              ? `Sans date de fin, depuis le ${formatFr(rental.startDate)}`
              : `Du ${formatFr(rental.startDate)} au ${formatFr(rental.endDate)}`
          }
        />
        <KeyValue label="Loyer" value={`${formatMoney(rental.rentAmountCents)} ${FREQUENCY_LABELS[rental.frequency].toLowerCase()}`} mono />
        <KeyValue label="Échéance" value={scheduleLabel(rental)} />
        <KeyValue label="Dépôt de garantie" value={formatMoney(rental.depositCents)} mono />
        <KeyValue
          label="Kilométrage au départ"
          value={formatKm(rental.startMileageKm)}
          mono
        />
        <KeyValue
          label="Kilométrage autorisé"
          value={rental.allowedKm === null ? 'Illimité' : formatKm(rental.allowedKm)}
          mono
        />
        <KeyValue
          label="Kilomètre supplémentaire"
          value={
            rental.excessKmPriceCents === 0
              ? 'Non facturé'
              : `${formatMoney(rental.excessKmPriceCents)} / km`
          }
          mono
        />
        <KeyValue
          label="Frais annexes"
          value={rental.feesCents === 0 ? 'Aucun' : formatMoney(rental.feesCents)}
          mono
        />
        {rental.notes === '' ? null : (
          <AppText variant="small" color="textMuted" style={{ marginTop: spacing.md }}>
            {rental.notes}
          </AppText>
        )}
      </Card>

      {kmUsage === null ? null : (
        <>
          <SectionHeader title="Kilométrage" icon="gauge" />
          <Card>
            <View style={styles.headerRow}>
              <AppText variant="small" color="textMuted" style={{ flex: 1 }}>
                {rental.allowedKm === null
                  ? 'Kilométrage illimité'
                  : `${formatKm(kmUsage.drivenKm)} parcourus sur ${formatKm(rental.allowedKm)}`}
              </AppText>
              {kmUsage.percentUsed === null ? null : (
                <AppText variant="title" tabular>
                  {formatPercent(kmUsage.percentUsed, 0)}
                </AppText>
              )}
            </View>
            {kmUsage.percentUsed === null ? null : (
              <View style={{ marginTop: spacing.sm }}>
                <ProgressBar
                  ratio={kmUsage.percentUsed / 100}
                  tone={kmUsage.percentUsed >= 100 ? 'danger' : kmUsage.percentUsed >= 80 ? 'warn' : 'accent'}
                />
              </View>
            )}
            <View style={{ marginTop: spacing.md }}>
              {kmUsage.remainingKm === null ? null : (
                <KeyValue label="Reste autorisé" value={formatKm(kmUsage.remainingKm)} mono />
              )}
              {kmUsage.exceededKm > 0 ? (
                <KeyValue
                  label="Dépassement facturable"
                  value={formatMoney(kmUsage.excessCostCents)}
                  valueColor="danger"
                  mono
                />
              ) : null}
            </View>
          </Card>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Échéancier                                                          */}
      {/* ------------------------------------------------------------------ */}

      <SectionHeader
        title={`Échéancier (${payments.length})`}
        icon="banknote"
        action={
          payments.length === 0 ? null : (
            <AppText variant="caption" color="textMuted">
              {`${formatMoney(totals.receivedCents, { currency: '' }).trim()} reçus`}
            </AppText>
          )
        }
      />

      {payments.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {rental.status === 'prevue'
              ? 'Aucune échéance : elles sont engendrées à l’activation.'
              : 'Aucune échéance sur cette location.'}
          </AppText>
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          {payments.map((payment, index) => (
            <View key={payment.id}>
              {index > 0 ? (
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
              ) : null}
              <PaymentLine
                payment={payment}
                today={todayIso}
                title={formatFr(payment.dueDate)}
                subtitle={PAYMENT_STATUS_LABELS[effectivePaymentStatus(payment, todayIso)].label}
                onPress={() => router.push(`/ajout/paiement?paymentId=${payment.id}`)}
              />
            </View>
          ))}
        </Card>
      )}

      {totals.lateCents > 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg, borderColor: colors.danger }}>
          <AppText variant="small" color="danger">
            {`Reste dû sur des échéances échues : ${formatMoney(totals.lateCents)} (${totals.lateCount} échéance${totals.lateCount > 1 ? 's' : ''}).`}
          </AppText>
        </Card>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Contrat                                                             */}
      {/* ------------------------------------------------------------------ */}

      <SectionHeader title={`Contrat (${contracts.length})`} icon="file-text" />
      {contracts.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Aucun contrat préparé. Le contrat reprend le loueur, le locataire, le véhicule et
            les conditions, puis se signe à l’écran.
          </AppText>
          <View style={{ height: spacing.md }} />
          <Button
            label="Préparer le contrat"
            variant="secondary"
            block
            onPress={() => router.push(`/contrat/${rental.id}`)}
          />
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          {contracts.map((contract, index) => (
            <View key={contract.id}>
              {index > 0 ? (
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
              ) : null}
              <MenuRow
                label={contract.reference}
                value={
                  contract.signedAt === null
                    ? undefined
                    : `signé le ${formatFr(contract.signedAt.slice(0, 10))}`
                }
                icon="file-text"
                onPress={() => router.push(`/contrat/${rental.id}`)}
                right={
                  <View style={{ marginRight: spacing.sm }}>
                    <Badge {...CONTRACT_STATUS_LABELS[contract.status]} />
                  </View>
                }
              />
            </View>
          ))}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Dommages et dépenses                                                */}
      {/* ------------------------------------------------------------------ */}

      {damages.length === 0 ? null : (
        <>
          <SectionHeader title={`Dommages rattachés (${damages.length})`} icon="alert-triangle" />
          <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
            {damages.map((damage, index) => (
              <View key={damage.id}>
                {index > 0 ? (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                ) : null}
                <DamageLine damage={damage} />
              </View>
            ))}
          </Card>
        </>
      )}

      <SectionHeader title="Compte de la location" icon="receipt" />
      <Card>
        <KeyValue label="Encaissé" value={formatMoney(totals.receivedCents)} mono />
        <KeyValue label="Dépenses rattachées" value={formatMoney(expensesTotal)} mono />
        <KeyValue
          label="Résultat"
          value={formatMoney(totals.receivedCents - expensesTotal)}
          valueColor={totals.receivedCents - expensesTotal >= 0 ? 'success' : 'danger'}
          mono
        />
        <KeyValue label="Dépenses comptées" value={String(expenses.length)} mono />
      </Card>

      {rental.status === 'terminee' ? (
        <>
          <SectionHeader title="Fin de location" icon="check-circle" />
          <Card>
            <KeyValue
              label="Terminée le"
              value={rental.endDate === null ? '—' : formatLongFr(rental.endDate)}
            />
            <KeyValue
              label="Kilométrage rendu"
              value={rental.endMileageKm === null ? '—' : formatKm(rental.endMileageKm)}
              mono
            />
            <KeyValue
              label="Caution"
              value={
                rental.depositOutcome === null
                  ? '—'
                  : (DEPOSIT_OUTCOME_LABELS[rental.depositOutcome] ?? rental.depositOutcome)
              }
            />
            <KeyValue
              label="Caution restituée"
              value={formatMoney(rental.depositReturnedCents)}
              mono
            />
          </Card>
        </>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Actions                                                             */}
      {/* ------------------------------------------------------------------ */}

      <SectionHeader title="Actions" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <MenuRow
          label="Ajouter une dépense sur cette location"
          icon="receipt"
          onPress={() => router.push('/ajout/depense')}
        />
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <MenuRow
          label="Fiche du locataire"
          icon="user"
          onPress={() => router.push(`/locataire/${rental.tenantId}`)}
        />
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <MenuRow
          label="Fiche du véhicule"
          icon="car"
          onPress={() => router.push(`/vehicule/${rental.vehicleId}`)}
        />
        {rental.status === 'active' || rental.status === 'prevue' ? (
          <>
            <View style={[styles.separator, { backgroundColor: colors.separator }]} />
            <MenuRow label="Annuler cette location" icon="x-circle" danger onPress={() => void cancelRental()} />
          </>
        ) : null}
      </Card>

      {error === null ? null : (
        <Card sunken style={{ marginTop: spacing.lg }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}

      <View style={{ height: spacing.lg }} />
      <AppText variant="caption" color="textFaint">
        {`Échéancier calculé jusqu’au ${formatFr(horizon)}. Une location sans date de fin est prolongée au fil de l’eau.`}
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  separator: { height: StyleSheet.hairlineWidth },
});
