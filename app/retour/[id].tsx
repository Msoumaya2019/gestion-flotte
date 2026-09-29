/**
 * Retour du véhicule — clôture d'une location.
 *
 * ## Ce que cet écran engage
 *
 * La clôture écrit quatre choses d'un coup : la location (statut, date de fin, kilométrage,
 * sort de la caution), le véhicule (compteur et statut), un relevé de kilométrage, et
 * éventuellement une échéance de frais. C'est `rentals.close()` qui porte les trois
 * premières dans une seule transaction — l'écran ne les réécrit pas lui-même, sans quoi une
 * panne au milieu laisserait une location close sur un véhicule toujours marqué « loué ».
 *
 * ## L'ordre des écritures, et ce qui se passe si la seconde échoue
 *
 * Les frais de restitution sont une échéance **supplémentaire** due par le locataire : ils
 * sont écrits **avant** la clôture. Si la clôture échoue ensuite, l'échéance est retirée
 * (archivée) pour ne pas laisser une facture orpheline sur une location qui court toujours.
 * L'inverse — clôturer puis facturer — perdrait les frais en silence, et personne ne s'en
 * apercevrait avant de chercher pourquoi le compte ne tombe pas juste.
 *
 * ## Ce qui n'est pas bloquant
 *
 * Des échéances impayées, un état des lieux de retour absent, un compteur inférieur au
 * départ : les trois sont signalés, aucun n'empêche de clôturer. Une location se termine
 * dans la vraie vie avec un litige en cours ; refuser la clôture obligerait à mentir sur
 * les dates pour sortir du blocage.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DEPOSIT_OUTCOME_LABELS, VEHICLE_STATUS_LABELS } from '@/domain/catalog';
import { formatFr, todayIso } from '@/domain/dates';
import { formatKm, formatMoney } from '@/domain/money';
import {
  effectivePaymentStatus,
  nextUnsettledPayment,
  paymentBalance,
  rentalKmUsage,
  rentalPaymentTotals,
} from '@/domain/rental';
import type { Cents, DepositOutcome, Payment, VehicleStatus } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import {
  Card,
  DetailTitle,
  EmptyState,
  KeyValue,
  ProgressBar,
  Screen,
  SectionHeader,
} from '@/ui/components/base';
import { Button, SegmentedControl } from '@/ui/components/button';
import { DateField, MoneyField, NumberField, SelectField, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';

/**
 * Statuts proposés au retour.
 *
 * `loue` est absent par construction — le véhicule est précisément en train d'être rendu —
 * et `vendu` aussi : une vente se décide ailleurs, pas au moment où l'on récupère les clés.
 */
const RETURN_STATUSES: readonly VehicleStatus[] = [
  'disponible',
  'entretien',
  'reparation',
  'indisponible',
];

export default function ReturnScreen(): ReactElement {
  const { data, repositories, refresh, now, newId } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const rental = data.rentals.find((candidate) => candidate.id === params.id) ?? null;
  const vehicle = rental === null ? null : (data.vehicles.find((v) => v.id === rental.vehicleId) ?? null);

  const today = todayIso();

  const rentalPayments = useMemo(
    () => (rental === null ? [] : data.payments.filter((payment) => payment.rentalId === rental.id)),
    [data.payments, rental],
  );

  const [endDate, setEndDate] = useState<string | null>(today);
  const [endMileageKm, setEndMileageKm] = useState<number | null>(vehicle?.currentMileageKm ?? null);
  const [fuelEighths, setFuelEighths] = useState<number | null>(8);
  const [vehicleStatus, setVehicleStatus] = useState<VehicleStatus>('disponible');
  const [depositOutcome, setDepositOutcome] = useState<DepositOutcome>('restituee');
  const [depositReturnedCents, setDepositReturnedCents] = useState<Cents | null>(
    rental?.depositCents ?? 0,
  );
  const [chargeExcess, setChargeExcess] = useState(true);
  const [extraFeesCents, setExtraFeesCents] = useState<Cents | null>(0);
  const [feesReason, setFeesReason] = useState('Frais de restitution');
  const [note, setNote] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rental === null || vehicle === null) {
    return (
      <Screen>
        <DetailTitle title="Retour du véhicule" onBack={() => router.back()} />
        <Card>
          <EmptyState
            icon="key"
            title="Location introuvable"
            message="Cette location n’existe plus : le retour ne peut pas être enregistré."
            action={<Button label="Retour" onPress={() => router.back()} />}
          />
        </Card>
      </Screen>
    );
  }

  if (rental.status !== 'active') {
    return (
      <Screen>
        <DetailTitle title="Retour du véhicule" onBack={() => router.back()} />
        <Card>
          <EmptyState
            icon="check-circle"
            title="Cette location n’est plus en cours"
            message="Le retour a déjà été enregistré, ou la location a été annulée. Rien à clôturer."
            action={<Button label="Voir la location" onPress={() => router.replace(`/location/${rental.id}`)} />}
          />
        </Card>
      </Screen>
    );
  }

  const mileage = endMileageKm ?? vehicle.currentMileageKm;
  const usage = rentalKmUsage(rental, mileage);
  const totals = rentalPaymentTotals(rentalPayments, today);
  const nextDue = nextUnsettledPayment(rentalPayments, today);
  const excessFeesCents = chargeExcess ? usage.excessCostCents : 0;
  const totalFeesCents = excessFeesCents + (extraFeesCents ?? 0);

  const returnedCents = depositReturnedCents ?? 0;
  const retainedCents = Math.max(0, rental.depositCents - returnedCents);

  const returnInspection =
    data.inspections.find(
      (inspection) => inspection.rentalId === rental.id && inspection.kind === 'retour',
    ) ?? null;

  // Un compteur qui recule n'est presque jamais vrai : c'est une faute de frappe. On le
  // signale sans l'interdire, parce qu'un remplacement de moteur ou de compteur existe.
  const mileageGoesBackwards = mileage < rental.startMileageKm;

  const depositInconsistent =
    depositOutcome === 'restituee' && returnedCents !== rental.depositCents;
  const depositOverflow = returnedCents > rental.depositCents;

  const canClose =
    repositories !== null &&
    endDate !== null &&
    endMileageKm !== null &&
    !depositOverflow &&
    !saving;

  /**
   * Ce que les fonctions internes ont besoin de savoir, figé après la garde.
   *
   * Elles sont déclarées par `function`, donc **hissées** : TypeScript ne peut pas prouver
   * qu'elles s'exécutent après la garde ci-dessus, et redemande une vérification de nullité
   * à chaque usage — vérification impossible à satisfaire, puisque le retour anticipé a
   * déjà eu lieu. Mesuré : le narrowing traverse une fonction fléchée `const`, pas une
   * déclaration `function`.
   */
  const rentalId = rental.id;
  const rentalVehicleId = rental.vehicleId;
  const rentalTenantId = rental.tenantId;

  async function closeRental(): Promise<void> {
    if (repositories === null || endDate === null || endMileageKm === null) return;

    setSaving(true);
    setError(null);

    const timestamp = now();
    let feePaymentId: string | null = null;
    let closed = false;

    try {
      if (totalFeesCents > 0) {
        feePaymentId = newId();
        const fee: Payment = {
          id: feePaymentId,
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null,
          rentalId,
          vehicleId: rentalVehicleId,
          tenantId: rentalTenantId,
          dueDate: endDate,
          expectedCents: totalFeesCents,
          receivedCents: 0,
          paidDate: null,
          methodId: null,
          // Le débiteur attendu est le locataire. Qui paiera réellement sera saisi au
          // moment de l'encaissement — l'application ne présume pas que c'est lui.
          payerType: 'locataire',
          payerName: '',
          comment: feesReason.trim() === '' ? 'Frais de restitution' : feesReason.trim(),
          proofFileId: null,
          status: 'a_venir',
        };
        await repositories.payments.insert(fee);
      }

      await repositories.rentals.close({
        id: rentalId,
        endDate,
        endMileageKm,
        depositOutcome,
        depositReturnedCents: returnedCents,
        vehicleStatus,
        mileageRecordId: newId(),
        now: timestamp,
      });
      closed = true;
    } catch (caught) {
      // La clôture a échoué : la location court toujours. On retire l'échéance de frais
      // pour ne pas laisser une facture sur une location ouverte.
      if (!closed && feePaymentId !== null) {
        try {
          await repositories.payments.archive(feePaymentId, now());
        } catch {
          // Le retrait lui-même échoue : on le dit plutôt que de le taire, car une
          // échéance en trop est visible dans l'échéancier et se annule à la main.
          setError(
            'La clôture a échoué et les frais de restitution n’ont pas pu être retirés. Vérifiez l’échéancier de la location.',
          );
          setSaving(false);
          return;
        }
      }
      setError(
        `La location n’a pas été clôturée : ${
          caught instanceof Error ? caught.message : String(caught)
        }`,
      );
      setSaving(false);
      return;
    }

    await refresh();
    setSaving(false);
    router.replace(`/location/${rentalId}`);
  }

  return (
    <Screen
      footer={
        <Button
          label="Clôturer la location"
          onPress={() => void closeRental()}
          loading={saving}
          disabled={!canClose}
          block
        />
      }
    >
      <DetailTitle
        title="Retour du véhicule"
        subtitle={`${vehicleName(data, vehicle.id)} · ${tenantName(data, rental.tenantId)}`}
        onBack={() => router.back()}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Ce qui reste dû : le premier chiffre à voir avant de rendre les clés */}
      {/* ------------------------------------------------------------------ */}
      <Card style={{ marginBottom: spacing.lg }}>
        <KeyValue label="Location en cours depuis le" value={formatFr(rental.startDate)} />
        <KeyValue
          label="Loyer"
          value={`${formatMoney(rental.rentAmountCents)} — ${rental.frequency === 'mensuel' ? 'par mois' : 'selon l’échéancier'}`}
        />
        <KeyValue
          label="Encaissé sur la location"
          value={formatMoney(totals.receivedCents)}
          valueColor="text"
        />
        {totals.lateCents > 0 ? (
          <>
            <View style={{ height: spacing.sm }} />
            <AppText variant="small" color="danger">
              {`${formatMoney(totals.lateCents)} restent dus sur ${totals.lateCount} échéance${
                totals.lateCount > 1 ? 's' : ''
              } échue${totals.lateCount > 1 ? 's' : ''}.`}
            </AppText>
          </>
        ) : null}
        {nextDue === null ? null : (
          <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
            {`Prochaine échéance : ${formatFr(nextDue.dueDate)} — ${formatMoney(
              paymentBalance(nextDue).remainingCents,
            )} (${
              effectivePaymentStatus(nextDue, today) === 'retard' ? 'en retard' : 'à venir'
            }).`}
          </AppText>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* État des lieux de retour                                            */}
      {/* ------------------------------------------------------------------ */}
      {returnInspection === null ? (
        <Card sunken style={{ marginBottom: spacing.lg, borderColor: '#E0B040' }}>
          <AppText variant="small" color="warning">
            Aucun état des lieux de retour n’a été enregistré. Ce n’est pas obligatoire, mais
            c’est lui qui rend un dommage imputable au locataire — sans photo ni relevé
            contresigné, la retenue sur caution se discute.
          </AppText>
          <View style={{ height: spacing.md }} />
          <Button
            label="Faire l’état des lieux de retour"
            variant="secondary"
            icon="clipboard"
            block
            onPress={() => router.push(`/etat-lieux/${rental.id}?kind=retour`)}
          />
        </Card>
      ) : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="success">
            {`État des lieux de retour enregistré le ${formatFr(returnInspection.date)} — ${formatKm(
              returnInspection.mileageKm,
            )}, carburant ${returnInspection.fuelEighths}/8, ${returnInspection.photos.length} photo${
              returnInspection.photos.length > 1 ? 's' : ''
            }.`}
          </AppText>
          <View style={{ height: spacing.sm }} />
          <Button
            label="Modifier l’état des lieux"
            variant="ghost"
            onPress={() => router.push(`/etat-lieux/${rental.id}?kind=retour`)}
          />
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Relevé de restitution                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Relevé de restitution" icon="gauge" />
      <DateField label="Date de restitution" required value={endDate} onChange={setEndDate} />
      <NumberField
        label="Kilométrage au retour"
        required
        value={endMileageKm}
        onChange={setEndMileageKm}
        suffix="km"
        hint={`Compteur au départ : ${formatKm(rental.startMileageKm)}`}
        error={
          mileageGoesBackwards
            ? `Inférieur au kilométrage de départ (${formatKm(rental.startMileageKm)}). Vérifiez la saisie : le compteur du véhicule ne sera pas reculé.`
            : null
        }
      />
      <NumberField
        label="Carburant au retour"
        value={fuelEighths}
        onChange={setFuelEighths}
        suffix="/ 8"
        hint="Servira à l’état des lieux si vous le faites après ce formulaire."
      />

      {/* ------------------------------------------------------------------ */}
      {/* Kilométrage parcouru                                                */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Kilométrage parcouru" />
      <Card>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <AppText variant="caption" color="textMuted">
              Parcouru
            </AppText>
            <AppText variant="heading">{formatKm(usage.drivenKm)}</AppText>
          </View>
          <View style={styles.metric}>
            <AppText variant="caption" color="textMuted">
              Autorisé
            </AppText>
            <AppText variant="heading">
              {usage.allowedKm === null ? 'Illimité' : formatKm(usage.allowedKm)}
            </AppText>
          </View>
          <View style={styles.metric}>
            <AppText variant="caption" color="textMuted">
              Dépassement
            </AppText>
            <AppText variant="heading" color={usage.exceededKm > 0 ? 'danger' : 'success'}>
              {usage.exceededKm > 0 ? formatKm(usage.exceededKm) : '—'}
            </AppText>
          </View>
        </View>

        {usage.allowedKm === null ? null : (
          <>
            <View style={{ height: spacing.md }} />
            <ProgressBar
              ratio={(usage.percentUsed ?? 0) / 100}
              tone={usage.exceededKm > 0 ? 'danger' : (usage.percentUsed ?? 0) > 85 ? 'warn' : 'ok'}
            />
          </>
        )}

        {usage.exceededKm === 0 ? null : (
          <>
            <View style={{ height: spacing.md }} />
            <AppText variant="small" color="textMuted">
              {`${formatKm(usage.exceededKm)} au-delà du forfait, à ${formatMoney(
                rental.excessKmPriceCents,
              )} le kilomètre : ${formatMoney(usage.excessCostCents)}.`}
            </AppText>
          </>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Frais de restitution                                                */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Frais de restitution" icon="receipt" />
      <Card>
        <AppText variant="small" color="textMuted">
          Ces frais deviennent une échéance due par le locataire, en plus de l’échéancier de
          la location. Ils n’entrent pas dans vos recettes tant qu’ils ne sont pas encaissés.
        </AppText>

        {usage.excessCostCents > 0 ? (
          <>
            <View style={{ height: spacing.md }} />
            <SegmentedControl
              options={[
                { value: 'oui', label: `Facturer ${formatMoney(usage.excessCostCents)}` },
                { value: 'non', label: 'Ne pas facturer' },
              ]}
              value={chargeExcess ? 'oui' : 'non'}
              onChange={(value) => setChargeExcess(value === 'oui')}
            />
          </>
        ) : null}

        <View style={{ height: spacing.md }} />
        <MoneyField
          label="Autres frais"
          cents={extraFeesCents}
          onCents={setExtraFeesCents}
          hint="Nettoyage, carburant manquant, amende, franchise…"
        />
        <TextField
          label="Motif porté sur l’échéance"
          value={feesReason}
          onChange={setFeesReason}
          placeholder="Frais de restitution"
        />

        <View style={{ height: spacing.md }} />
        <KeyValue label="Total facturé au locataire" value={formatMoney(totalFeesCents)} />
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Dépôt de garantie                                                   */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Dépôt de garantie" icon="shield" />
      <Card>
        <KeyValue label="Dépôt encaissé au départ" value={formatMoney(rental.depositCents)} />
        <View style={{ height: spacing.md }} />
        <SegmentedControl
          options={[
            { value: 'restituee', label: 'Restituée' },
            { value: 'partielle', label: 'Partielle' },
            { value: 'retenue', label: 'Retenue' },
          ]}
          value={depositOutcome}
          onChange={setDepositOutcome}
        />
        <View style={{ height: spacing.md }} />
        <MoneyField
          label="Montant rendu au locataire"
          cents={depositReturnedCents}
          onCents={setDepositReturnedCents}
          error={depositOverflow ? 'Supérieur au dépôt encaissé.' : null}
          hint={`Dépôt encaissé : ${formatMoney(rental.depositCents)}`}
        />
        {retainedCents > 0 ? (
          <>
            <View style={{ height: spacing.sm }} />
            <KeyValue
              label="Retenu"
              value={formatMoney(retainedCents)}
              valueColor="warning"
            />
            <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
              Une retenue n’est pas une recette : c’est l’indemnisation d’un dommage. Elle
              reste hors du compte de la location.
            </AppText>
          </>
        ) : null}
        {depositInconsistent ? (
          <AppText variant="caption" color="warning" style={{ marginTop: spacing.sm }}>
            {`Caution marquée « restituée » mais ${formatMoney(
              Math.abs(rental.depositCents - returnedCents),
            )} ${returnedCents < rental.depositCents ? 'manquent' : 'excèdent'} au remboursement.`}
          </AppText>
        ) : null}
        <View style={{ height: spacing.sm }} />
        <AppText variant="caption" color="textFaint">
          {DEPOSIT_OUTCOME_LABELS[depositOutcome]}
        </AppText>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Après la restitution                                                */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Après la restitution" icon="car" />
      <SelectField
        label="Statut du véhicule"
        value={vehicleStatus}
        options={RETURN_STATUSES.map((status) => ({
          value: status,
          label: VEHICLE_STATUS_LABELS[status].label,
        }))}
        onChange={setVehicleStatus}
        hint="Le véhicule repasse « disponible » par défaut. Choisissez « en entretien » s’il part à l’atelier."
        grid
      />

      <SectionHeader title="Note de fin de location" />
      <TextField
        label="Observation"
        value={note}
        onChange={setNote}
        multiline
        placeholder="État d’esprit du locataire, promesse de régler le solde, état des pneus…"
      />

      {/* ------------------------------------------------------------------ */}
      {/* Récapitulatif                                                       */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Récapitulatif" icon="list" />
      <Card sunken>
        <KeyValue label="Véhicule rendu le" value={endDate === null ? '—' : formatFr(endDate)} />
        <KeyValue label="Kilométrage de fin" value={formatKm(mileage)} />
        <KeyValue label="Distance parcourue" value={formatKm(usage.drivenKm)} />
        <KeyValue label="Échéances soldées" value={String(totals.paidCount)} />
        <KeyValue
          label="Reste dû sur échéances"
          value={formatMoney(totals.lateCents)}
          valueColor={totals.lateCents > 0 ? 'danger' : 'text'}
        />
        <KeyValue label="Frais ajoutés" value={formatMoney(totalFeesCents)} />
        <KeyValue label="Dépôt restitué" value={formatMoney(returnedCents)} />
        <KeyValue
          label="Dépôt retenu"
          value={formatMoney(retainedCents)}
          valueColor={retainedCents > 0 ? 'warning' : 'text'}
        />
        <KeyValue label="Statut du véhicule" value={VEHICLE_STATUS_LABELS[vehicleStatus].label} />
      </Card>

      <SectionHeader title="Dommages" icon="alert-triangle" />
      <Card>
        <AppText variant="small" color="textMuted">
          Un dommage constaté au retour se déclare ici. Il porte sa photo et son coût, et il
          reste rattaché à cette location — c’est ce qui permet de justifier une retenue sur
          caution des mois plus tard.
        </AppText>
        <View style={{ height: spacing.md }} />
        <Button
          label="Déclarer un dommage constaté"
          variant="secondary"
          icon="alert-triangle"
          block
          onPress={() =>
            router.push(`/ajout/incident?vehicleId=${vehicle.id}&rentalId=${rental.id}`)
          }
        />
      </Card>

      {error === null ? null : (
        <Card sunken style={{ marginTop: spacing.lg, borderColor: '#D06060' }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { flexDirection: 'row' },
  metric: { flex: 1 },
  warnRow: { flexDirection: 'row' },
});
