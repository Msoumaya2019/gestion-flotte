/**
 * Fiche véhicule — documents, contrats, historique, incidents.
 *
 * ## Ce que ces blocs ont en commun
 *
 * Ce sont les **traces** du véhicule : ce qui a été signé, ce qui a été constaté, ce qui a
 * été payé. Elles ne se modifient pas tous les jours, mais elles doivent être retrouvables
 * en une seconde — c'est le jour où un locataire conteste une rayure qu'on ouvre cet écran.
 *
 * ## Les documents ne quittent pas l'appareil
 *
 * Les fichiers sont chiffrés dans le coffre de l'application. Aucun n'est envoyé nulle part,
 * et aucun n'est exposé dans l'application Fichiers. L'écran le dit, parce que c'est la
 * question qu'on se pose en y déposant un permis de conduire.
 */

import { useMemo, type ReactElement } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { CONTRACT_STATUS_LABELS, RENTAL_STATUS_LABELS } from '@/domain/catalog';
import { formatDateTimeFr, formatFr } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { rentalPaymentTotals } from '@/domain/rental';
import type { Vehicle } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { tenantName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import { Badge, Card, EmptyState, KeyValue, SectionHeader } from '@/ui/components/base';
import { Button, MenuRow } from '@/ui/components/button';
import { DamageLine, DocumentLine, InsuranceLine } from '@/ui/lines';
import { Separator } from '@/ui/vehicle/activity';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

// ---------------------------------------------------------------------------
// Documents et assurance
// ---------------------------------------------------------------------------

export function VehicleDocumentsSection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data, today, vault, vaultError } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const todayIso = today();

  const documents = useMemo(
    () =>
      data.vehicleDocuments
        .filter((document) => document.vehicleId === vehicle.id)
        .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')),
    [data.vehicleDocuments, vehicle.id],
  );

  const insurances = data.insurances.filter((insurance) => insurance.vehicleId === vehicle.id);
  const typeOf = (typeId: string) => data.documentTypes.find((type) => type.id === typeId);

  return (
    <View>
      {vault === null ? (
        <Card sunken style={{ marginBottom: spacing.lg, borderColor: colors.warning }}>
          <AppText variant="small" color="warning">
            {`Le coffre est indisponible : les documents ne peuvent être ni ouverts ni ajoutés. ${vaultError ?? ''}`}
          </AppText>
        </Card>
      ) : null}

      <SectionHeader title={`Documents du véhicule (${documents.length})`} icon="folder" />
      {documents.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Carte grise, assurance, contrôle technique, factures : les fichiers sont chiffrés
            et conservés uniquement sur cet appareil.
          </AppText>
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          {documents.map((document, index) => {
            const type = typeOf(document.typeId);
            return (
              <View key={document.id}>
                {index > 0 ? <Separator /> : null}
                <DocumentLine
                  label={type?.label ?? 'Document'}
                  number={document.number}
                  expiryDate={document.expiryDate}
                  today={todayIso}
                  warningDays={data.settings.documentWarningDays}
                  hasExpiry={type?.hasExpiry ?? true}
                  icon={type?.scope === 'vehicule' ? 'file-text' : 'folder'}
                  onPress={() => router.push(`/documents?vehicleId=${vehicle.id}`)}
                />
              </View>
            );
          })}
        </Card>
      )}

      <SectionHeader title={`Assurances (${insurances.length})`} icon="shield" />
      {insurances.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Aucune assurance enregistrée pour ce véhicule.
          </AppText>
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          {insurances.map((insurance, index) => (
            <View key={insurance.id}>
              {index > 0 ? <Separator /> : null}
              <InsuranceLine
                insurance={insurance}
                vehicleLabel={`${vehicle.brand} ${vehicle.model}`.trim()}
                today={todayIso}
                warningDays={data.settings.documentWarningDays}
                onPress={() => router.push(`/ajout/assurance?id=${insurance.id}&vehicleId=${vehicle.id}`)}
              />
            </View>
          ))}
        </Card>
      )}

      <Button
        label="Ajouter un document"
        icon="plus"
        variant="secondary"
        block
        style={{ marginBottom: spacing.sm }}
        onPress={() => router.push(`/ajout/document?vehicleId=${vehicle.id}`)}
      />
      <Button
        label="Ajouter une assurance"
        icon="shield"
        variant="secondary"
        block
        onPress={() => router.push(`/ajout/assurance?vehicleId=${vehicle.id}`)}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contrats
// ---------------------------------------------------------------------------

export function VehicleContractsSection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data } = useApp();
  const router = useRouter();

  const rentalIds = new Set(data.rentals.filter((rental) => rental.vehicleId === vehicle.id).map((rental) => rental.id));
  const contracts = useMemo(
    () =>
      data.contracts
        .filter((contract) => rentalIds.has(contract.rentalId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    // `rentalIds` est reconstruit à chaque rendu ; la dépendance utile est la liste des locations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.contracts, data.rentals, vehicle.id],
  );

  if (contracts.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="file-text"
          title="Aucun contrat"
          message="Un contrat se prépare depuis une location : il reprend le loueur, le locataire et le véhicule, puis se signe à l’écran."
          action={
            <Button
              label="Voir les locations"
              variant="secondary"
              onPress={() => router.push('/locations')}
            />
          }
        />
      </Card>
    );
  }

  return (
    <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
      {contracts.map((contract, index) => {
        const rental = data.rentals.find((candidate) => candidate.id === contract.rentalId);
        return (
          <View key={contract.id}>
            {index > 0 ? <Separator /> : null}
            <MenuRow
              label={contract.reference}
              value={
                contract.signedAt === null
                  ? undefined
                  : `signé le ${formatDateTimeFr(contract.signedAt).split(' à ')[0] ?? ''}`
              }
              icon="file-text"
              onPress={() => router.push(`/contrat/${contract.rentalId}`)}
              right={
                <View style={{ marginRight: spacing.sm }}>
                  <Badge {...CONTRACT_STATUS_LABELS[contract.status]} />
                </View>
              }
            />
            {rental === undefined ? null : (
              <AppText variant="caption" color="textFaint" style={{ marginBottom: spacing.sm }}>
                {`${tenantName(data, rental.tenantId)} · du ${formatFr(rental.startDate)}${rental.endDate === null ? '' : ` au ${formatFr(rental.endDate)}`}`}
              </AppText>
            )}
          </View>
        );
      })}
      <View style={{ height: spacing.sm }} />
      <AppText variant="caption" color="textFaint">
        Référence et date de signature sont figées : un contrat signé ne bouge plus, même si
        la fiche du locataire est modifiée ensuite.
      </AppText>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Historique des locations
// ---------------------------------------------------------------------------

export function VehicleHistorySection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data, today } = useApp();
  const router = useRouter();
  const todayIso = today();

  const rentals = useMemo(
    () =>
      data.rentals
        .filter((rental) => rental.vehicleId === vehicle.id)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [data.rentals, vehicle.id],
  );

  if (rentals.length === 0) {
    return (
      <Card>
        <EmptyState icon="key" title="Aucune location" message="Ce véhicule n’a jamais été loué." />
      </Card>
    );
  }

  return (
    <View>
      {rentals.map((rental) => {
        const payments = data.payments.filter((payment) => payment.rentalId === rental.id);
        const totals = rentalPaymentTotals(payments, todayIso);
        const expenses = data.expenses.filter((expense) => expense.rentalId === rental.id);
        const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
        const inspections = data.inspections.filter((inspection) => inspection.rentalId === rental.id);
        const damages = data.damages.filter((damage) => damage.rentalId === rental.id);

        return (
          <Card
            key={rental.id}
            style={{ marginBottom: spacing.md }}
            onPress={() => router.push(`/location/${rental.id}`)}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <AppText variant="title" numberOfLines={1}>
                  {tenantName(data, rental.tenantId)}
                </AppText>
                <AppText variant="small" color="textMuted">
                  {rental.endDate === null
                    ? `Depuis le ${formatFr(rental.startDate)}`
                    : `Du ${formatFr(rental.startDate)} au ${formatFr(rental.endDate)}`}
                </AppText>
              </View>
              <Badge {...RENTAL_STATUS_LABELS[rental.status]} />
            </View>

            <View style={{ marginTop: spacing.md }}>
              <KeyValue label="Encaissé" value={formatMoney(totals.receivedCents)} mono />
              <KeyValue label="Dépenses rattachées" value={formatMoney(expenseTotal)} mono />
              <KeyValue
                label="Résultat"
                value={formatMoney(totals.receivedCents - expenseTotal)}
                valueColor={totals.receivedCents - expenseTotal >= 0 ? 'success' : 'danger'}
                mono
              />
              {totals.lateCents > 0 ? (
                <KeyValue
                  label="Reste dû"
                  value={formatMoney(totals.lateCents)}
                  valueColor="danger"
                  mono
                />
              ) : null}
              <KeyValue
                label="États des lieux"
                value={inspections.length === 0 ? 'aucun' : String(inspections.length)}
                mono
              />
              {damages.length === 0 ? null : (
                <KeyValue
                  label="Dommages constatés"
                  value={String(damages.length)}
                  valueColor="danger"
                  mono
                />
              )}
            </View>
          </Card>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Incidents et dommages
// ---------------------------------------------------------------------------

export function VehicleDamagesSection({ vehicle }: { vehicle: Vehicle }): ReactElement {
  const { data } = useApp();
  const router = useRouter();

  const damages = useMemo(
    () =>
      data.damages
        .filter((damage) => damage.vehicleId === vehicle.id)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [data.damages, vehicle.id],
  );

  const pending = damages.filter((damage) => !damage.repaired);
  const estimated = pending.reduce((sum, damage) => sum + damage.estimatedCostCents, 0);

  return (
    <View>
      {pending.length === 0 ? null : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="danger">
            {`${pending.length} dommage${pending.length > 1 ? 's' : ''} non réparé${pending.length > 1 ? 's' : ''}, coût estimé ${formatMoney(estimated)}.`}
          </AppText>
        </Card>
      )}

      <SectionHeader title={`Dommages et incidents (${damages.length})`} icon="alert-triangle" />
      {damages.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Aucun dommage constaté. Les dommages se relèvent aussi pendant un état des lieux,
            avec photo.
          </AppText>
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          {damages.map((damage, index) => (
            <View key={damage.id}>
              {index > 0 ? <Separator /> : null}
              <DamageLine damage={damage} />
            </View>
          ))}
        </Card>
      )}

      <Button
        label="Déclarer un incident"
        icon="plus"
        variant="secondary"
        block
        onPress={() => router.push(`/ajout/incident?vehicleId=${vehicle.id}`)}
      />
    </View>
  );
}
