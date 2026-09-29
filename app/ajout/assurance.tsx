/**
 * Assurance d'un véhicule — création et modification.
 *
 * ## Pourquoi l'assurance est une entité à part
 *
 * L'assurance produit deux choses de natures différentes : une **dépense récurrente** — la
 * prime, qui pèse sur la rentabilité — et une **échéance** — la date de fin de contrat,
 * dont le dépassement laisse le véhicule non couvert. La ranger dans les dépenses perdrait
 * la date de fin ; la ranger dans les documents perdrait la prime. Elle a donc sa fiche, et
 * la pièce justificative s'y rattache.
 *
 * ## Le montant n'est pas dupliqué dans les dépenses
 *
 * Enregistrer la prime ici **ne crée pas** de dépense automatiquement : une assurance se
 * paie mensuellement ou annuellement, et l'application ne sait pas quand le prélèvement a
 * lieu. Créer une dépense à la place de l'utilisateur produirait un chiffre faux dans la
 * rentabilité — le seul endroit où un chiffre faux ne se voit pas. Le récapitulatif
 * ci-dessous rappelle donc le montant annuel, à saisir en dépense au rythme réel.
 */

import { useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';

import { FREQUENCY_LABELS } from '@/domain/catalog';
import { addMonths, todayIso } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { PAYMENT_FREQUENCIES, type Insurance, type PaymentFrequency } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { removeAttachment, storeAttachmentFromUri } from '@/services/attachments';
import { AppText } from '@/ui/components/text';
import { Card, DetailTitle, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { DateField, MoneyField, SelectField, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';
import { vehicleName } from '@/state/use-derived';

/**
 * Nombre d'échéances par an, pour ramener une prime à l'année.
 *
 * `personnalisee` vaut `null`, et non une valeur approchante : une assurance n'a pas
 * d'intervalle en jours, donc rien ne permet de savoir combien d'échéances tombent dans
 * l'année. Multiplier par 12 donnerait un total annuel plausible et faux — exactement ce
 * qu'on ne veut pas afficher à côté d'un chiffre financier.
 */
const PER_YEAR: Record<PaymentFrequency, number | null> = {
  hebdomadaire: 52,
  bimensuel: 26,
  mensuel: 12,
  personnalisee: null,
};

export default function InsuranceFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId, vault } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; vehicleId?: string }>();

  const existing = data.insurances.find((candidate) => candidate.id === params.id) ?? null;
  const isEdit = existing !== null;

  const [vehicleId, setVehicleId] = useState<string | null>(
    existing?.vehicleId ?? params.vehicleId ?? data.vehicles[0]?.id ?? null,
  );
  const [company, setCompany] = useState(existing?.company ?? '');
  const [contractNumber, setContractNumber] = useState(existing?.contractNumber ?? '');
  const [amountCents, setAmountCents] = useState<number | null>(
    existing === null ? null : existing.amountCents,
  );
  const [frequency, setFrequency] = useState<PaymentFrequency>(existing?.frequency ?? 'mensuel');
  const [startDate, setStartDate] = useState<string | null>(existing?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState<string | null>(
    existing?.endDate ?? addMonths(todayIso(), 12),
  );
  const [documentFileId, setDocumentFileId] = useState<string | null>(
    existing?.documentFileId ?? null,
  );
  const [documentName, setDocumentName] = useState('');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const endBeforeStart = endDate !== null && startDate !== null && endDate < startDate;
  const perYear = PER_YEAR[frequency];
  const annualCents = amountCents === null || perYear === null ? null : amountCents * perYear;
  const monthlyEquivalent = annualCents === null ? null : Math.round(annualCents / 12);

  async function attachDocument(): Promise<void> {
    setError(null);
    if (vault === null || repositories === null) {
      setError('Le coffre est indisponible : la pièce ne peut pas être enregistrée.');
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;

    try {
      const stored = await storeAttachmentFromUri({
        vault,
        repositories,
        kind: 'document',
        uri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? 'application/pdf',
        notes: `Assurance ${company}`.trim(),
      });
      const previous = documentFileId;
      setDocumentFileId(stored.id);
      setDocumentName(stored.fileName);
      if (previous !== null) {
        const previousFile = await repositories.files.get(previous);
        if (previousFile !== null) {
          await removeAttachment({ vault, repositories, file: previousFile, now: now() });
        }
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function detachDocument(): Promise<void> {
    if (documentFileId === null || vault === null || repositories === null) {
      setDocumentFileId(null);
      setDocumentName('');
      return;
    }
    const stored = await repositories.files.get(documentFileId);
    if (stored !== null) {
      await removeAttachment({ vault, repositories, file: stored, now: now() });
    }
    setDocumentFileId(null);
    setDocumentName('');
  }

  async function save(): Promise<void> {
    if (repositories === null) return;
    if (vehicleId === null) {
      setError('Choisissez le véhicule assuré.');
      return;
    }
    if (company.trim() === '') {
      setError('Le nom de l’assureur est nécessaire.');
      return;
    }
    if (endBeforeStart) {
      setError('La date de fin précède la date de début.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      const insurance: Insurance = {
        id: existing?.id ?? newId(),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        archivedAt: existing?.archivedAt ?? null,
        vehicleId,
        company: company.trim(),
        contractNumber: contractNumber.trim(),
        amountCents: amountCents ?? 0,
        frequency,
        startDate,
        endDate,
        documentFileId,
        notes,
      };

      if (existing === null) await repositories.insurances.insert(insurance);
      else await repositories.insurances.update(insurance);

      await refresh();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function archive(): Promise<void> {
    if (repositories === null || existing === null) return;
    setSaving(true);
    try {
      await repositories.insurances.archive(existing.id, now());
      await refresh();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  if (data.vehicles.length === 0) {
    return (
      <Screen>
        <ScreenTitle title="Assurance" />
        <Card>
          <AppText variant="body">Ajoutez d’abord un véhicule.</AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label={isEdit ? 'Enregistrer les modifications' : 'Enregistrer l’assurance'}
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null}
          block
        />
      }
    >
      {isEdit ? (
        <DetailTitle
          title="Modifier l’assurance"
          subtitle={existing === null ? undefined : existing.company}
          onBack={() => router.back()}
        />
      ) : (
        <ScreenTitle title="Assurance" subtitle="Prime, échéance et pièce justificative" />
      )}

      <SelectField
        label="Véhicule"
        required
        value={vehicleId}
        options={data.vehicles.map((vehicle) => ({
          value: vehicle.id,
          label: vehicleName(data, vehicle.id),
          hint: vehicle.plate,
        }))}
        onChange={setVehicleId}
      />

      <TextField
        label="Assureur"
        required
        value={company}
        onChange={setCompany}
        placeholder="Nom de la compagnie"
        autoCapitalize="words"
      />
      <TextField
        label="Numéro de contrat"
        value={contractNumber}
        onChange={setContractNumber}
        autoCapitalize="characters"
      />

      <MoneyField
        label="Prime"
        cents={amountCents}
        onCents={setAmountCents}
        hint="Le montant d’une échéance, pas le total annuel."
      />
      <SelectField
        label="Périodicité de la prime"
        value={frequency}
        options={PAYMENT_FREQUENCIES.map((value) => ({
          value,
          label: FREQUENCY_LABELS[value],
        }))}
        onChange={setFrequency}
        grid
      />

      {amountCents === null ? null : annualCents === null ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Périodicité personnalisée : l’équivalent annuel ne peut pas être estimé, faute de
            savoir combien d’échéances tombent dans l’année.
          </AppText>
        </Card>
      ) : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {`Soit ${formatMoney(annualCents)} par an, environ ${formatMoney(monthlyEquivalent ?? 0)} par mois. Ce montant n’est pas enregistré comme dépense : saisissez chaque prime au moment où elle est prélevée, pour que la rentabilité reste juste.`}
          </AppText>
        </Card>
      )}

      <DateField label="Début du contrat" value={startDate} onChange={setStartDate} />
      <DateField
        label="Fin du contrat"
        value={endDate}
        onChange={setEndDate}
        error={endBeforeStart ? 'Antérieure au début.' : null}
        hint="Un rappel est posé avant cette date."
      />

      <SectionHeader title="Pièce justificative" />
      <Card>
        {documentFileId === null ? (
          <AppText variant="small" color="textMuted">
            Aucune pièce jointe. L’attestation est conservée chiffrée sur cet appareil, comme
            tous les documents.
          </AppText>
        ) : (
          <AppText variant="small" color="success">
            {`Pièce jointe : ${documentName === '' ? 'document enregistré' : documentName}`}
          </AppText>
        )}
        <View style={{ height: spacing.md }} />
        <View style={{ flexDirection: 'row' }}>
          <Button
            label={documentFileId === null ? 'Joindre un fichier' : 'Remplacer'}
            variant="secondary"
            icon="upload"
            onPress={() => void attachDocument()}
          />
          {documentFileId === null ? null : (
            <View style={{ marginLeft: spacing.sm }}>
              <Button label="Retirer" variant="ghost" onPress={() => void detachDocument()} />
            </View>
          )}
        </View>
      </Card>

      <SectionHeader title="Notes" />
      <TextField
        label="Observations"
        value={notes}
        onChange={setNotes}
        multiline
        placeholder="Franchise, garanties optionnelles, interlocuteur…"
      />

      {error === null ? null : (
        <Card sunken style={{ marginTop: spacing.lg }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}

      {isEdit ? (
        <>
          <SectionHeader title="Retirer cette assurance" />
          <Card>
            <AppText variant="small" color="textMuted">
              Un contrat remplacé par un autre s’archive : l’échéance cesse d’être surveillée,
              et l’historique reste consultable.
            </AppText>
            <View style={{ height: spacing.md }} />
            <Button
              label="Archiver cette assurance"
              variant="secondary"
              block
              onPress={() => void archive()}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
