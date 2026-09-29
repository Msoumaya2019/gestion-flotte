/**
 * Déclarer un incident ou un dommage.
 *
 * ## Pourquoi une photo, et pourquoi chiffrée
 *
 * Un dommage se constate une fois et se conteste des mois plus tard. La photo est la seule
 * pièce qui tranche, et elle est prise sur le véhicule — donc souvent avec la plaque, la
 * rue, parfois le locataire dans le cadre. Elle est déposée dans le coffre comme les
 * documents, pour la même raison : rien de ce qui touche à un locataire ne quitte
 * l'appareil.
 *
 * ## Rattachement automatique à la location en cours
 *
 * Un incident survenu pendant une location doit être imputable à cette location. Le
 * formulaire cherche donc la location active du véhicule et la propose ; c'est ce lien qui
 * permet, à la restitution, de retrouver les dommages à imputer au locataire. Sans lui, le
 * dommage existerait sans responsable.
 */

import { useState, type ReactElement } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { DAMAGE_TYPE_LABELS } from '@/domain/catalog';
import { formatFr, todayIso } from '@/domain/dates';
import { formatKm, formatMoney } from '@/domain/money';
import { DAMAGE_TYPES, type Damage, type DamageType } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { vehicleName } from '@/state/use-derived';
import { storeAttachmentFromUri } from '@/services/attachments';
import { AppText } from '@/ui/components/text';
import { Icon } from '@/ui/components/icons';
import { Card, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { DateField, MoneyField, SelectField, SwitchRow, TextField } from '@/ui/components/fields';
import { radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { useVaultImage } from '@/ui/use-vault-image';

export default function IncidentFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId, vault } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string; rentalId?: string }>();

  const [vehicleId, setVehicleId] = useState<string | null>(
    params.vehicleId ?? data.vehicles[0]?.id ?? null,
  );
  const [type, setType] = useState<DamageType>('rayure');
  const [zone, setZone] = useState('');
  const [date, setDate] = useState<string | null>(todayIso());
  const [comment, setComment] = useState('');
  const [estimatedCostCents, setEstimatedCostCents] = useState<number | null>(null);
  const [actualCostCents, setActualCostCents] = useState<number | null>(null);
  const [repaired, setRepaired] = useState(false);
  const [photoFileId, setPhotoFileId] = useState<string | null>(null);
  const [attachToRental, setAttachToRental] = useState(true);
  const [setVehicleInRepair, setSetVehicleInRepair] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const photo = useVaultImage(photoFileId);

  const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId) ?? null;
  const currentRental =
    data.rentals.find((rental) => rental.vehicleId === vehicleId && rental.status === 'active') ??
    null;
  const rentalId = attachToRental
    ? (params.rentalId ?? currentRental?.id ?? null)
    : null;

  async function pickPhoto(): Promise<void> {
    setError(null);
    if (vault === null || repositories === null) {
      setError('Le coffre est indisponible : la photo ne peut pas être enregistrée.');
      return;
    }
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

    try {
      const stored = await storeAttachmentFromUri({
        vault,
        repositories,
        kind: 'photo',
        uri: asset.uri,
        fileName: asset.fileName ?? `dommage-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setPhotoFileId(stored.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function save(): Promise<void> {
    if (repositories === null) return;
    if (vehicleId === null) {
      setError('Choisissez le véhicule concerné.');
      return;
    }
    if (date === null) {
      setError('La date du constat est nécessaire.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      const damage: Damage = {
        id: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        vehicleId,
        rentalId,
        inspectionId: null,
        origin: 'incident',
        type,
        zone: zone.trim(),
        date,
        comment,
        estimatedCostCents: estimatedCostCents ?? 0,
        actualCostCents: actualCostCents ?? 0,
        photoFileId,
        repaired,
      };
      await repositories.damages.insert(damage);

      if (setVehicleInRepair && vehicle !== null && vehicle.status !== 'vendu') {
        await repositories.vehicles.setStatus(vehicleId, 'reparation', timestamp);
      }

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
        <ScreenTitle title="Incident" />
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
          label="Enregistrer l’incident"
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null}
          block
        />
      }
    >
      <ScreenTitle title="Incident ou dommage" subtitle="Constaté hors état des lieux" />

      <SelectField
        label="Véhicule"
        required
        value={vehicleId}
        options={data.vehicles
          .filter((candidate) => candidate.status !== 'vendu')
          .map((candidate) => ({
            value: candidate.id,
            label: vehicleName(data, candidate.id),
            hint: `${candidate.plate} · ${formatKm(candidate.currentMileageKm)}`,
          }))}
        onChange={setVehicleId}
      />

      <SelectField
        label="Nature du dommage"
        value={type}
        options={DAMAGE_TYPES.map((value) => ({ value, label: DAMAGE_TYPE_LABELS[value] ?? value }))}
        onChange={setType}
        grid
      />

      <TextField
        label="Localisation"
        value={zone}
        onChange={setZone}
        placeholder="Aile avant droite, pare-chocs arrière…"
      />
      <DateField label="Date du constat" required value={date} onChange={setDate} />

      <SectionHeader title="Photo" />
      <Card>
        {photo.uri === null ? (
          <View style={[styles.photoPlaceholder, { borderColor: colors.border }]}>
            <Icon name="camera" size={22} color={colors.textFaint} strokeWidth={1.8} />
            <AppText variant="caption" color="textFaint" style={{ marginTop: 4 }}>
              Aucune photo
            </AppText>
          </View>
        ) : (
          <Pressable onPress={() => void pickPhoto()}>
            <Image source={{ uri: photo.uri }} style={styles.photoImage} resizeMode="cover" />
          </Pressable>
        )}
        {photo.error === null ? null : (
          <AppText variant="caption" color="danger" style={{ marginTop: spacing.xs }}>
            {photo.error}
          </AppText>
        )}
        <View style={{ height: spacing.md }} />
        <Button
          label={photoFileId === null ? 'Prendre ou choisir une photo' : 'Remplacer la photo'}
          variant="secondary"
          icon="camera"
          onPress={() => void pickPhoto()}
        />
        <View style={{ height: spacing.sm }} />
        <AppText variant="caption" color="textFaint">
          La photo est chiffrée et conservée sur cet appareil. C’est la pièce qui tranche
          lorsqu’un dommage est contesté.
        </AppText>
      </Card>

      <SectionHeader title="Coût" />
      <MoneyField
        label="Coût estimé"
        cents={estimatedCostCents}
        onCents={setEstimatedCostCents}
        hint="Ce que la réparation devrait coûter."
      />
      <MoneyField
        label="Coût réel"
        cents={actualCostCents}
        onCents={setActualCostCents}
        hint="À remplir une fois la réparation faite."
      />
      <Card>
        <SwitchRow
          label="Dommage réparé"
          hint="Un dommage non réparé reste signalé sur la fiche du véhicule."
          value={repaired}
          onChange={setRepaired}
        />
      </Card>

      <SectionHeader title="Rattachement" />
      <Card>
        {currentRental === null && params.rentalId === undefined ? (
          <AppText variant="small" color="textMuted">
            Ce véhicule n’a pas de location en cours : le dommage sera rattaché au véhicule
            seul. Il pourra être imputé plus tard, depuis la location concernée.
          </AppText>
        ) : (
          <>
            <SwitchRow
              label="Rattacher à la location en cours"
              hint={`Du ${formatFr(currentRental?.startDate ?? todayIso())} — sans ce lien, le dommage ne peut pas être imputé au locataire à la restitution.`}
              value={attachToRental}
              onChange={setAttachToRental}
            />
            <View style={{ height: spacing.sm }} />
            <SwitchRow
              label="Passer le véhicule en réparation"
              hint="Le sort des locations à venir : il n’apparaîtra plus comme disponible."
              value={setVehicleInRepair}
              onChange={setSetVehicleInRepair}
            />
          </>
        )}
      </Card>

      <SectionHeader title="Commentaire" />
      <TextField
        label="Circonstances"
        value={comment}
        onChange={setComment}
        multiline
        placeholder="Ce qui s’est passé, constat amiable, tiers impliqué…"
      />

      {estimatedCostCents === null || estimatedCostCents === 0 ? null : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {`Coût estimé : ${formatMoney(estimatedCostCents)}. Ce montant n’est pas enregistré comme dépense : saisissez la facture dans « Réparation » le jour où elle est payée.`}
          </AppText>
        </Card>
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

const styles = StyleSheet.create({
  photoPlaceholder: {
    height: 120,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: { width: '100%', height: 180, borderRadius: radius.md },
});
