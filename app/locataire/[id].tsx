/**
 * Fiche d'un locataire.
 *
 * ## Ce qu'on vient y chercher
 *
 * Trois choses, dans cet ordre : ses coordonnées pour l'appeler, l'état de son dossier de
 * documents, et ce qu'il doit. Le reste — locations passées, contrats, dommages — est de
 * l'historique, consulté le jour où il y a un litige.
 *
 * ## Le dossier de documents est en haut
 *
 * C'est la partie qui a une conséquence : un permis expiré ou une carte VTC manquante doit
 * se voir avant de louer, pas après. La fiche le dit en une phrase, et chaque document
 * s'ouvre d'un tapotement — déchiffré à la volée, remis au système, puis la copie en clair
 * est effacée.
 *
 * ## L'appeler, sans recopier le numéro
 *
 * Le numéro est enregistré : le geste utile est de composer. Un bouton lance l'appel, un
 * autre ouvre le courriel. Ce sont les deux seules actions qu'on fait depuis cette fiche
 * sans rien saisir.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  CONTRACT_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  RENTAL_STATUS_LABELS,
} from '@/domain/catalog';
import { formatDateTimeFr, formatFr } from '@/domain/dates';
import { checkRentalEligibility } from '@/domain/eligibility';
import { formatKm, formatMoney } from '@/domain/money';
import {
  effectivePaymentStatus,
  nextUnsettledPayment,
  rentalPaymentTotals,
  scheduleLabel,
} from '@/domain/rental';
import { useApp } from '@/state/app-context';
import { vehicleName } from '@/state/use-derived';
import { openAttachment } from '@/services/open-attachment';
import { AppText } from '@/ui/components/text';
import {
  Badge,
  Card,
  DetailTitle,
  EmptyState,
  KeyValue,
  Screen,
  SectionHeader,
} from '@/ui/components/base';
import { Button, MenuRow } from '@/ui/components/button';
import { DamageLine, DocumentLine, PaymentLine } from '@/ui/lines';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

export default function TenantDetailScreen(): ReactElement {
  const { data, vault, repositories, today } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const todayIso = today();

  const [error, setError] = useState<string | null>(null);

  const tenant = data.tenants.find((candidate) => candidate.id === params.id) ?? null;

  const rentals = useMemo(
    () =>
      data.rentals
        .filter((rental) => rental.tenantId === tenant?.id)
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [data.rentals, tenant?.id],
  );

  const documents = useMemo(
    () =>
      data.tenantDocuments
        .filter((document) => document.tenantId === tenant?.id)
        .sort((a, b) => (a.expiryDate ?? '9999').localeCompare(b.expiryDate ?? '9999')),
    [data.tenantDocuments, tenant?.id],
  );

  const payments = useMemo(
    () =>
      data.payments
        .filter((payment) => payment.tenantId === tenant?.id)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
    [data.payments, tenant?.id],
  );

  const eligibility = useMemo(() => {
    if (tenant === null) return null;
    const requirements = data.settings.requiredDocumentTypeIds
      .map((typeId) => data.documentTypes.find((type) => type.id === typeId))
      .filter((type): type is NonNullable<typeof type> => type !== undefined)
      .map((type) => ({ typeId: type.id, label: type.label }));

    return checkRentalEligibility({
      requirements,
      documents: documents.map((document) => ({
        id: document.id,
        typeId: document.typeId,
        expiryDate: document.expiryDate,
      })),
      today: todayIso,
      warningDays: data.settings.documentWarningDays,
    });
  }, [data.documentTypes, data.settings.requiredDocumentTypeIds, data.settings.documentWarningDays, documents, tenant, todayIso]);

  if (tenant === null) {
    return (
      <Screen>
        <DetailTitle title="Locataire" onBack={() => router.back()} />
        <Card>
          <EmptyState
            icon="users"
            title="Fiche introuvable"
            message="Ce locataire a peut-être été archivé ou supprimé."
            action={<Button label="Voir la liste" onPress={() => router.replace('/locataire')} />}
          />
        </Card>
      </Screen>
    );
  }

  const name = `${tenant.firstName} ${tenant.lastName}`.trim();
  const activeRental = rentals.find((rental) => rental.status === 'active') ?? null;
  const activeRentalTotals =
    activeRental === null
      ? null
      : rentalPaymentTotals(
          payments.filter((payment) => payment.rentalId === activeRental.id),
          todayIso,
        );
  const nextPayment =
    activeRental === null
      ? null
      : nextUnsettledPayment(
          payments.filter((payment) => payment.rentalId === activeRental.id),
          todayIso,
        );

  let owedCents = 0;
  for (const payment of payments) {
    const status = effectivePaymentStatus(payment, todayIso);
    if (status === 'retard' || status === 'impaye') {
      owedCents += payment.expectedCents - payment.receivedCents;
    }
  }

  const contracts = data.contracts
    .filter((contract) => rentals.some((rental) => rental.id === contract.rentalId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const damages = data.damages
    .filter((damage) => rentals.some((rental) => rental.id === damage.rentalId))
    .sort((a, b) => b.date.localeCompare(a.date));

  async function openDocument(fileId: string | null, label: string): Promise<void> {
    setError(null);
    try {
      await openAttachment({
        vault,
        repositories,
        fileId,
        dialogTitle: `${label} — ${name}`,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <Screen>
      <DetailTitle
        title={name === '' ? 'Locataire sans nom' : name}
        subtitle={[tenant.phone, tenant.vtcNumber === '' ? '' : `VTC ${tenant.vtcNumber}`]
          .filter((part) => part !== '')
          .join(' · ')}
        onBack={() => router.back()}
        action={
          <Button
            label="Modifier"
            variant="ghost"
            icon="edit"
            onPress={() => router.push(`/ajout/locataire?id=${tenant.id}`)}
          />
        }
      />

      {tenant.archivedAt === null ? null : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {`Fiche archivée le ${formatDateTimeFr(tenant.archivedAt).split(' à ')[0] ?? ''}. L’historique reste consultable.`}
          </AppText>
        </Card>
      )}

      {owedCents > 0 ? (
        <Card style={{ marginBottom: spacing.lg, borderColor: colors.danger }}>
          <AppText variant="small" color="danger">
            {`Reste dû sur des échéances échues : ${formatMoney(owedCents)}.`}
          </AppText>
        </Card>
      ) : null}

      <Card>
        {tenant.phone === '' ? null : (
          <View style={styles.actions}>
            <Button
              label="Appeler"
              icon="user"
              variant="secondary"
              onPress={() => void Linking.openURL(`tel:${tenant.phone.replace(/\s/g, '')}`)}
            />
            <View style={{ width: spacing.sm }} />
            {tenant.email === '' ? null : (
              <Button
                label="Écrire"
                icon="file-text"
                variant="secondary"
                onPress={() => void Linking.openURL(`mailto:${tenant.email}`)}
              />
            )}
          </View>
        )}
      </Card>

      <SectionHeader title="Coordonnées" icon="user" />
      <Card>
        <KeyValue label="Téléphone" value={tenant.phone === '' ? '—' : tenant.phone} />
        <KeyValue label="Courriel" value={tenant.email === '' ? '—' : tenant.email} />
        <KeyValue
          label="Date de naissance"
          value={tenant.birthDate === null ? '—' : formatFr(tenant.birthDate)}
        />
        <KeyValue label="Adresse" value={tenant.address === '' ? '—' : tenant.address} />
        <KeyValue
          label="Permis"
          value={tenant.licenseNumber === '' ? '—' : tenant.licenseNumber}
          mono
        />
        <KeyValue
          label="Délivré le"
          value={tenant.licenseDate === null ? '—' : formatFr(tenant.licenseDate)}
        />
        <KeyValue label="Carte VTC" value={tenant.vtcNumber === '' ? '—' : tenant.vtcNumber} mono />
        {tenant.notes === '' ? null : (
          <AppText variant="small" color="textMuted" style={{ marginTop: spacing.md }}>
            {tenant.notes}
          </AppText>
        )}
      </Card>

      <SectionHeader title={`Dossier de documents (${documents.length})`} icon="folder" />
      {eligibility !== null && eligibility.items.length > 0 ? (
        <Card
          sunken
          style={
            eligibility.satisfied
              ? { marginBottom: spacing.md }
              : { marginBottom: spacing.md, borderColor: colors.warning }
          }
        >
          <AppText variant="small" color={eligibility.satisfied ? 'success' : 'warning'}>
            {eligibility.satisfied
              ? 'Dossier complet : tous les documents exigés sont présents et utilisables.'
              : eligibility.message}
          </AppText>
          <View style={{ height: spacing.sm }} />
          {eligibility.items.map((item) => (
            <View key={item.typeId} style={styles.eligibilityRow}>
              <AppText variant="small" style={{ flex: 1 }}>
                {item.label}
              </AppText>
              <Badge {...DOCUMENT_STATUS_LABELS[item.status]} />
            </View>
          ))}
        </Card>
      ) : null}

      {documents.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Aucun document. Permis, pièce d’identité, carte VTC, attestation d’assurance : les
            fichiers sont chiffrés et conservés uniquement sur cet appareil.
          </AppText>
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          {documents.map((document, index) => {
            const type = data.documentTypes.find((candidate) => candidate.id === document.typeId);
            return (
              <View key={document.id}>
                {index > 0 ? (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                ) : null}
                <DocumentLine
                  label={type?.label ?? 'Document'}
                  number={document.number}
                  expiryDate={document.expiryDate}
                  today={todayIso}
                  warningDays={data.settings.documentWarningDays}
                  hasExpiry={type?.hasExpiry ?? true}
                  icon="file-check"
                  onPress={() => void openDocument(document.fileId, type?.label ?? 'Document')}
                />
              </View>
            );
          })}
        </Card>
      )}

      <Button
        label="Ajouter un document"
        icon="plus"
        variant="secondary"
        block
        onPress={() => router.push(`/ajout/document?tenantId=${tenant.id}`)}
      />

      <SectionHeader title="Location en cours" icon="key" />
      {activeRental === null ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Aucune location en cours pour ce locataire.
          </AppText>
        </Card>
      ) : (
        <Card style={{ marginBottom: spacing.lg }} onPress={() => router.push(`/location/${activeRental.id}`)}>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <AppText variant="title" numberOfLines={1}>
                {vehicleName(data, activeRental.vehicleId)}
              </AppText>
              <AppText variant="small" color="textMuted">
                {`Depuis le ${formatFr(activeRental.startDate)} · ${scheduleLabel(activeRental)}`}
              </AppText>
            </View>
            <Badge {...RENTAL_STATUS_LABELS[activeRental.status]} />
          </View>

          <View style={{ marginTop: spacing.md }}>
            <KeyValue label="Loyer" value={formatMoney(activeRental.rentAmountCents)} mono />
            {activeRentalTotals === null ? null : (
              <>
                <KeyValue
                  label="Encaissé"
                  value={formatMoney(activeRentalTotals.receivedCents)}
                  mono
                />
                {activeRentalTotals.lateCents > 0 ? (
                  <KeyValue
                    label="En retard"
                    value={formatMoney(activeRentalTotals.lateCents)}
                    valueColor="danger"
                    mono
                  />
                ) : null}
              </>
            )}
          </View>

          {nextPayment === null ? null : (
            <View style={{ marginTop: spacing.md }}>
              <Button
                label={`Encaisser ${formatMoney(nextPayment.expectedCents - nextPayment.receivedCents)}`}
                icon="banknote"
                block
                onPress={() => router.push(`/ajout/paiement?paymentId=${nextPayment.id}`)}
              />
            </View>
          )}
        </Card>
      )}

      <SectionHeader title={`Paiements (${payments.length})`} icon="banknote" />
      {payments.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Aucun paiement enregistré pour ce locataire.
          </AppText>
        </Card>
      ) : (
        <Card padded={false} style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.lg }}>
          {payments.slice(0, 12).map((payment, index) => (
            <View key={payment.id}>
              {index > 0 ? (
                <View style={[styles.separator, { backgroundColor: colors.separator }]} />
              ) : null}
              <PaymentLine
                payment={payment}
                today={todayIso}
                title={formatFr(payment.dueDate)}
                subtitle={vehicleName(data, payment.vehicleId)}
                onPress={() => router.push(`/ajout/paiement?paymentId=${payment.id}`)}
              />
            </View>
          ))}
          {payments.length > 12 ? (
            <AppText variant="caption" color="textFaint" style={{ paddingVertical: spacing.md }}>
              {`… et ${payments.length - 12} autres échéances plus anciennes.`}
            </AppText>
          ) : null}
        </Card>
      )}

      <SectionHeader title={`Locations (${rentals.length})`} icon="car" />
      {rentals.length === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Ce locataire n’a jamais loué de véhicule.
          </AppText>
        </Card>
      ) : (
        rentals.map((rental) => {
          const totals = rentalPaymentTotals(
            payments.filter((payment) => payment.rentalId === rental.id),
            todayIso,
          );
          const km = data.mileageRecords
            .filter((record) => record.rentalId === rental.id)
            .sort((a, b) => b.date.localeCompare(a.date))[0];

          return (
            <Card
              key={rental.id}
              style={{ marginBottom: spacing.md }}
              onPress={() => router.push(`/location/${rental.id}`)}
            >
              <View style={styles.headerRow}>
                <View style={{ flex: 1 }}>
                  <AppText variant="title" numberOfLines={1}>
                    {vehicleName(data, rental.vehicleId)}
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
                {totals.lateCents > 0 ? (
                  <KeyValue
                    label="Reste dû"
                    value={formatMoney(totals.lateCents)}
                    valueColor="danger"
                    mono
                  />
                ) : null}
                {rental.endMileageKm === null ? null : (
                  <KeyValue
                    label="Kilométrage rendu"
                    value={formatKm(rental.endMileageKm)}
                    mono
                  />
                )}
                {km === undefined ? null : (
                  <KeyValue label="Dernier relevé" value={formatFr(km.date)} />
                )}
              </View>
            </Card>
          );
        })
      )}

      {contracts.length === 0 ? null : (
        <>
          <SectionHeader title={`Contrats (${contracts.length})`} icon="file-text" />
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
              </View>
            ))}
          </Card>
        </>
      )}

      {damages.length === 0 ? null : (
        <>
          <SectionHeader title={`Incidents rattachés (${damages.length})`} icon="alert-triangle" />
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

      <SectionHeader title="Actions" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
        <MenuRow
          label="Nouvelle location pour ce locataire"
          icon="key"
          onPress={() => router.push('/ajout/location')}
        />
        <View style={[styles.separator, { backgroundColor: colors.separator }]} />
        <MenuRow
          label="Modifier la fiche"
          icon="edit"
          onPress={() => router.push(`/ajout/locataire?id=${tenant.id}`)}
        />
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
        Les documents de ce locataire sont chiffrés et conservés uniquement sur cet appareil.
        Ils ne sont ni synchronisés, ni envoyés à un serveur.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  separator: { height: StyleSheet.hairlineWidth },
  eligibilityRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
});
