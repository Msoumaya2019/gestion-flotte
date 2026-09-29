/**
 * Dépôt d'un document — locataire ou véhicule.
 *
 * ## Ce que ce formulaire doit dire, et pourquoi
 *
 * Y déposer un permis de conduire ou une carte grise est le geste le plus sensible de
 * l'application : c'est celui pour lequel l'utilisateur se demande où va le fichier. L'écran
 * l'écrit donc en clair, à l'endroit où l'on choisit le fichier — chiffré, sur cet appareil,
 * dans un dossier que l'application Fichiers ne montre pas, et absent de toute sauvegarde
 * en ligne. Un document n'est jamais envoyé nulle part.
 *
 * ## Les deux portées
 *
 * Un document appartient soit à un locataire, soit à un véhicule, et les types proposés
 * suivent cette portée : on ne propose pas « Carte VTC » pour une voiture. Le type choisi
 * commande aussi l'affichage des dates — un RIB n'a pas d'échéance, et afficher un champ
 * vide à remplir ferait croire qu'il manque quelque chose.
 *
 * ## Le fichier d'abord, la ligne ensuite
 *
 * Le contenu est écrit dans le coffre **avant** l'enregistrement en base. Si la ligne
 * échoue, le contenu est retiré : l'inverse laisserait un document qui s'ouvre sur une
 * erreur de déchiffrement, c'est-à-dire un document qui ment.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { documentValidity } from '@/domain/documents';
import { formatSize } from '@/services/output';
import { removeAttachment, storeAttachmentFromUri } from '@/services/attachments';
import { addMonths, todayIso } from '@/domain/dates';
import type { TenantDocument, VehicleDocument } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import { Badge, Card, DetailTitle, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button, SegmentedControl } from '@/ui/components/button';
import { DateField, SelectField, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';
import { DOCUMENT_STATUS_LABELS } from '@/domain/catalog';

type Scope = 'locataire' | 'vehicule';

interface PickedFile {
  uri: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number | null;
}

export default function DocumentFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId, vault, vaultError } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; vehicleId?: string; tenantId?: string }>();

  const existingTenantDocument =
    data.tenantDocuments.find((candidate) => candidate.id === params.id) ?? null;
  const existingVehicleDocument =
    data.vehicleDocuments.find((candidate) => candidate.id === params.id) ?? null;
  const isEdit = existingTenantDocument !== null || existingVehicleDocument !== null;

  const [scope, setScope] = useState<Scope>(
    existingTenantDocument !== null || params.tenantId !== undefined
      ? 'locataire'
      : 'vehicule',
  );
  const [tenantId, setTenantId] = useState<string | null>(
    existingTenantDocument?.tenantId ?? params.tenantId ?? data.tenants[0]?.id ?? null,
  );
  const [vehicleId, setVehicleId] = useState<string | null>(
    existingVehicleDocument?.vehicleId ?? params.vehicleId ?? data.vehicles[0]?.id ?? null,
  );
  const [typeId, setTypeId] = useState<string | null>(
    existingTenantDocument?.typeId ?? existingVehicleDocument?.typeId ?? null,
  );
  const [number, setNumber] = useState(
    existingTenantDocument?.number ?? existingVehicleDocument?.number ?? '',
  );
  const [issueDate, setIssueDate] = useState<string | null>(
    existingTenantDocument?.issueDate ?? existingVehicleDocument?.issueDate ?? null,
  );
  const [expiryDate, setExpiryDate] = useState<string | null>(
    existingTenantDocument?.expiryDate ?? existingVehicleDocument?.expiryDate ?? null,
  );
  const [comment, setComment] = useState(
    existingTenantDocument?.comment ?? existingVehicleDocument?.comment ?? '',
  );
  const [picked, setPicked] = useState<PickedFile | null>(null);
  const [fileId, setFileId] = useState<string | null>(
    existingTenantDocument?.fileId ?? existingVehicleDocument?.fileId ?? null,
  );
  const [storedName, setStoredName] = useState(
    existingTenantDocument?.fileName ?? existingVehicleDocument?.fileName ?? '',
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const types = useMemo(
    () => data.documentTypes.filter((type) => type.scope === scope),
    [data.documentTypes, scope],
  );
  const type = types.find((candidate) => candidate.id === typeId) ?? null;
  const hasExpiry = type?.hasExpiry ?? false;

  const validity = documentValidity(expiryDate, todayIso(), data.settings.documentWarningDays);

  function switchScope(next: Scope): void {
    setScope(next);
    setTypeId(null);
    setExpiryDate(null);
    setError(null);
  }

  async function chooseFile(from: 'fichier' | 'photo'): Promise<void> {
    setError(null);
    if (from === 'photo') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('L’accès à la photothèque a été refusé. Autorisez-le dans les réglages du système.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (asset === undefined) return;
      setPicked({
        uri: asset.uri,
        fileName: asset.fileName ?? `document-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        sizeBytes: asset.fileSize ?? null,
      });
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
    setPicked({
      uri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType ?? 'application/pdf',
      sizeBytes: asset.size ?? null,
    });
  }

  async function clearFile(): Promise<void> {
    setPicked(null);
    if (fileId === null || vault === null || repositories === null) {
      setFileId(null);
      setStoredName('');
      return;
    }
    const stored = await repositories.files.get(fileId);
    if (stored !== null) {
      await removeAttachment({ vault, repositories, file: stored, now: now() });
    }
    setFileId(null);
    setStoredName('');
  }

  async function save(): Promise<void> {
    if (repositories === null) return;
    if (typeId === null) {
      setError('Choisissez le type de document.');
      return;
    }
    if (scope === 'locataire' && tenantId === null) {
      setError('Choisissez le locataire concerné.');
      return;
    }
    if (scope === 'vehicule' && vehicleId === null) {
      setError('Choisissez le véhicule concerné.');
      return;
    }
    if (picked !== null && vault === null) {
      setError(
        `Le coffre est indisponible : le fichier ne peut pas être enregistré. ${vaultError ?? ''}`,
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      let nextFileId = fileId;
      let nextFileName = storedName;
      let nextMime = existingTenantDocument?.mimeType ?? existingVehicleDocument?.mimeType ?? '';
      let nextSize = existingTenantDocument?.sizeBytes ?? existingVehicleDocument?.sizeBytes ?? 0;

      if (picked !== null && vault !== null) {
        const stored = await storeAttachmentFromUri({
          vault,
          repositories,
          kind: 'document',
          uri: picked.uri,
          fileName: picked.fileName,
          mimeType: picked.mimeType,
        });
        // L'ancien contenu n'est retiré qu'une fois le nouveau écrit : si l'écriture échoue,
        // le document garde au moins son fichier précédent.
        const previous = fileId;
        nextFileId = stored.id;
        nextFileName = stored.fileName;
        nextMime = stored.mimeType;
        nextSize = stored.sizeBytes;
        if (previous !== null && previous !== stored.id) {
          const previousFile = await repositories.files.get(previous);
          if (previousFile !== null) {
            await removeAttachment({ vault, repositories, file: previousFile, now: timestamp });
          }
        }
      }

      const base = {
        id: existingTenantDocument?.id ?? existingVehicleDocument?.id ?? newId(),
        createdAt: existingTenantDocument?.createdAt ?? existingVehicleDocument?.createdAt ?? timestamp,
        updatedAt: timestamp,
        archivedAt: existingTenantDocument?.archivedAt ?? existingVehicleDocument?.archivedAt ?? null,
        typeId,
        number: number.trim(),
        issueDate,
        expiryDate: hasExpiry ? expiryDate : null,
        comment,
        fileId: nextFileId,
        mimeType: nextMime,
        fileName: nextFileName,
        sizeBytes: nextSize,
      };

      if (scope === 'locataire') {
        const document: TenantDocument = { ...base, tenantId: tenantId ?? '' };
        if (existingTenantDocument === null) await repositories.tenantDocuments.insert(document);
        else await repositories.tenantDocuments.update(document);
      } else {
        const document: VehicleDocument = { ...base, vehicleId: vehicleId ?? '' };
        if (existingVehicleDocument === null) await repositories.vehicleDocuments.insert(document);
        else await repositories.vehicleDocuments.update(document);
      }

      await refresh();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  const targetLabel =
    scope === 'locataire'
      ? tenantId === null
        ? 'aucun locataire'
        : tenantName(data, tenantId)
      : vehicleId === null
        ? 'aucun véhicule'
        : vehicleName(data, vehicleId);

  const nothingToAttachTo = scope === 'locataire' ? data.tenants.length === 0 : data.vehicles.length === 0;

  return (
    <Screen
      footer={
        <Button
          label={isEdit ? 'Enregistrer les modifications' : 'Enregistrer le document'}
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null || nothingToAttachTo}
          block
        />
      }
    >
      {isEdit ? (
        <DetailTitle
          title="Modifier le document"
          subtitle={type?.label ?? 'Document'}
          onBack={() => router.back()}
        />
      ) : (
        <ScreenTitle title="Document" subtitle="Chiffré et conservé sur cet appareil" />
      )}

      {nothingToAttachTo ? (
        <Card>
          <AppText variant="body">
            {scope === 'locataire'
              ? 'Ajoutez d’abord un locataire.'
              : 'Ajoutez d’abord un véhicule.'}
          </AppText>
        </Card>
      ) : (
        <>
          {isEdit ? (
            // Un document ne change pas de portée : le déplacer d'un locataire vers un
            // véhicule n'aurait pas de sens, et le laisser faire produirait une ligne dont
            // la cible ne correspond plus au type choisi.
            <Card sunken style={{ marginBottom: spacing.lg }}>
              <AppText variant="caption" color="textMuted">
                {scope === 'locataire' ? 'Document d’un locataire' : 'Document d’un véhicule'}
              </AppText>
              <AppText variant="body" style={{ marginTop: 2 }}>
                {targetLabel}
              </AppText>
            </Card>
          ) : (
            <>
              <SegmentedControl
                options={[
                  { value: 'locataire', label: 'Locataire' },
                  { value: 'vehicule', label: 'Véhicule' },
                ]}
                value={scope}
                onChange={switchScope}
              />
              <View style={{ height: spacing.lg }} />
            </>
          )}

          {isEdit ? null : scope === 'locataire' ? (
            <SelectField
              label="Locataire"
              required
              value={tenantId}
              options={data.tenants.map((tenant) => ({
                value: tenant.id,
                label: tenantName(data, tenant.id),
                hint: tenant.phone,
              }))}
              onChange={setTenantId}
            />
          ) : (
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
          )}

          <SelectField
            label="Type de document"
            required
            value={typeId}
            options={types.map((candidate) => ({
              value: candidate.id,
              label: candidate.label,
              hint: candidate.hasExpiry ? 'avec échéance' : 'sans échéance',
            }))}
            onChange={(value) => {
              setTypeId(value);
              const chosen = types.find((candidate) => candidate.id === value);
              if (chosen !== undefined && chosen.hasExpiry && expiryDate === null) {
                // Une échéance par défaut à un an : c'est la durée la plus courante, et un
                // champ vide se remplit plus tard ou jamais.
                setExpiryDate(addMonths(todayIso(), 12));
              }
            }}
            grid
          />

          <SectionHeader title="Contenu du coffre" />
          <Card>
            <AppText variant="caption" color="textFaint">
              {`${type?.label ?? 'Document'} — ${targetLabel}`}
            </AppText>
            <View style={{ height: spacing.md }} />
            {picked === null && fileId === null ? (
              <AppText variant="small" color="textMuted">
                Aucun fichier. Un document peut être enregistré sans pièce — pour noter un
                numéro et une échéance — puis complété plus tard.
              </AppText>
            ) : (
              <AppText variant="small" color="success">
                {`Fichier : ${picked === null ? storedName : picked.fileName}`}
                {picked !== null && picked.sizeBytes !== null
                  ? ` (${formatSize(picked.sizeBytes)})`
                  : ''}
              </AppText>
            )}
            <View style={{ height: spacing.md }} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              <Button
                label={picked === null && fileId === null ? 'Choisir un fichier' : 'Remplacer'}
                variant="secondary"
                icon="upload"
                onPress={() => void chooseFile('fichier')}
              />
              <View style={{ marginLeft: spacing.sm }}>
                <Button
                  label="Photographier"
                  variant="secondary"
                  icon="camera"
                  onPress={() => void chooseFile('photo')}
                />
              </View>
              {picked === null && fileId === null ? null : (
                <View style={{ marginLeft: spacing.sm }}>
                  <Button label="Retirer" variant="ghost" onPress={() => void clearFile()} />
                </View>
              )}
            </View>
            <View style={{ height: spacing.md }} />
            <AppText variant="caption" color="textFaint">
              Le fichier est chiffré (AES-256-GCM) et écrit dans le dossier privé de
              l’application. Il n’apparaît pas dans l’application Fichiers, n’est pas
              synchronisé, et n’est jamais envoyé à un serveur.
            </AppText>
            {vaultError === null ? null : (
              <AppText variant="caption" color="danger" style={{ marginTop: spacing.xs }}>
                {vaultError}
              </AppText>
            )}
          </Card>

          <SectionHeader title="Références" />
          <TextField
            label="Numéro du document"
            value={number}
            onChange={setNumber}
            autoCapitalize="characters"
            placeholder="Numéro figurant sur le document"
          />
          <DateField label="Date de délivrance" value={issueDate} onChange={setIssueDate} />

          {hasExpiry ? (
            <>
              <DateField
                label="Date d’expiration"
                value={expiryDate}
                onChange={setExpiryDate}
                hint="Un rappel est posé avant cette date, selon vos seuils."
              />
              <Card sunken style={{ marginBottom: spacing.lg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Badge {...DOCUMENT_STATUS_LABELS[validity.status]} />
                  <AppText variant="small" color="textMuted" style={{ marginLeft: spacing.sm }}>
                    {validity.daysRemaining === null
                      ? ''
                      : validity.daysRemaining < 0
                        ? `Expiré depuis ${Math.abs(validity.daysRemaining)} jours`
                        : `Encore ${validity.daysRemaining} jours`}
                  </AppText>
                </View>
              </Card>
            </>
          ) : (
            <Card sunken style={{ marginBottom: spacing.lg }}>
              <AppText variant="small" color="textMuted">
                Ce type de document n’a pas d’échéance : aucune date n’est demandée et aucun
                rappel ne sera posé.
              </AppText>
            </Card>
          )}

          <TextField
            label="Commentaire"
            value={comment}
            onChange={setComment}
            multiline
            placeholder="Précisions, références, remarques…"
          />
        </>
      )}

      {error === null ? null : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}
    </Screen>
  );
}
