/**
 * Fiche d'un véhicule — création et modification.
 *
 * ## Ce que la fiche doit permettre de retrouver
 *
 * Le prix d'achat et les frais d'acquisition ne sont pas décoratifs : c'est d'eux que se
 * déduit l'amortissement, puis le seuil de rentabilité, puis la part d'investissement
 * récupérée. Un prix d'achat saisi à zéro ne provoque aucune erreur — il rend simplement le
 * véhicule infiniment rentable, ce qui est le pire des silences. Le champ est donc marqué
 * obligatoire et le récapitulatif montre ce qui en découle.
 *
 * ## Le kilométrage d'achat et le kilométrage courant
 *
 * Les deux existent, et ils ne sont pas interchangeables : le premier sert de point de
 * départ au calcul du coût au kilomètre, le second pilote les échéances d'entretien. À la
 * création ils sont égaux, et le second suit le premier tant qu'on ne l'a pas modifié
 * lui-même — sans quoi une voiture achetée à 80 000 km et relevée à 121 000 exigerait de
 * saisir deux fois la même chose.
 *
 * ## La photo
 *
 * Elle est déposée dans le coffre chiffré, comme les documents. Une photo de véhicule n'est
 * pas un secret, mais elle vit dans le même dossier que les pièces d'identité : deux
 * régimes de stockage à maintenir, c'est deux occasions d'en oublier un.
 */

import { useState, type ReactElement } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import {
  AMORTIZATION_METHOD_LABELS,
  FUEL_TYPE_LABELS,
  VEHICLE_STATUS_LABELS,
} from '@/domain/catalog';
import { todayIso } from '@/domain/dates';
import { formatKm, formatMoney } from '@/domain/money';
import {
  AMORTIZATION_METHODS,
  FUEL_TYPES,
  VEHICLE_STATUSES,
  type AmortizationMethod,
  type FuelType,
  type Vehicle,
  type VehicleStatus,
} from '@/domain/types';
import { useApp } from '@/state/app-context';
import { removeAttachment, storeAttachmentFromUri } from '@/services/attachments';
import { AppText } from '@/ui/components/text';
import { Icon } from '@/ui/components/icons';
import { Card, DetailTitle, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import {
  DateField,
  MoneyField,
  NumberField,
  SelectField,
  TextField,
} from '@/ui/components/fields';
import { radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { useVaultImage } from '@/ui/use-vault-image';

/** Durée d'amortissement proposée par défaut, en mois. */
const DEFAULT_AMORTIZATION_MONTHS = 48;

export default function VehicleFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId, vault } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const existing = data.vehicles.find((candidate) => candidate.id === params.id) ?? null;
  const isEdit = existing !== null;

  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [model, setModel] = useState(existing?.model ?? '');
  const [trim, setTrim] = useState(existing?.trim ?? '');
  const [year, setYear] = useState<number | null>(existing?.year ?? null);
  const [plate, setPlate] = useState(existing?.plate ?? '');
  const [vin, setVin] = useState(existing?.vin ?? '');
  const [fuelType, setFuelType] = useState<FuelType>(existing?.fuelType ?? 'essence');
  const [status, setStatus] = useState<VehicleStatus>(existing?.status ?? 'disponible');
  const [purchaseDate, setPurchaseDate] = useState<string | null>(
    existing?.purchaseDate ?? todayIso(),
  );
  const [purchasePriceCents, setPurchasePriceCents] = useState<number | null>(
    existing === null ? null : existing.purchasePriceCents,
  );
  const [purchaseFeesCents, setPurchaseFeesCents] = useState<number | null>(
    existing === null ? null : existing.purchaseFeesCents,
  );
  const [purchaseMileageKm, setPurchaseMileageKm] = useState<number | null>(
    existing?.purchaseMileageKm ?? null,
  );
  const [currentMileageKm, setCurrentMileageKm] = useState<number | null>(
    existing?.currentMileageKm ?? null,
  );
  const [amortizationMonths, setAmortizationMonths] = useState<number | null>(
    existing?.amortizationMonths ?? DEFAULT_AMORTIZATION_MONTHS,
  );
  const [amortizationMethod, setAmortizationMethod] = useState<AmortizationMethod>(
    existing?.amortizationMethod ?? 'lineaire',
  );
  const [photoFileId, setPhotoFileId] = useState<string | null>(existing?.photoFileId ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const photo = useVaultImage(photoFileId);

  const priceTotalCents = (purchasePriceCents ?? 0) + (purchaseFeesCents ?? 0);
  const plateIsDuplicate = data.vehicles.some(
    (candidate) =>
      candidate.id !== existing?.id &&
      candidate.plate !== '' &&
      candidate.plate.toUpperCase().replace(/[\s-]/g, '') === plate.toUpperCase().replace(/[\s-]/g, ''),
  );
  const mileageIsInconsistent =
    purchaseMileageKm !== null && currentMileageKm !== null && currentMileageKm < purchaseMileageKm;

  /**
   * Le compteur courant suit le compteur d'achat tant que l'utilisateur ne l'a pas
   * touché lui-même. Le drapeau évite d'écraser une valeur saisie exprès.
   */
  function onPurchaseMileageChange(value: number | null): void {
    setPurchaseMileageKm(value);
    if (currentMileageKm === null || currentMileageKm === purchaseMileageKm) {
      setCurrentMileageKm(value);
    }
  }

  async function pickPhoto(): Promise<void> {
    setError(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('L’accès à la photothèque a été refusé. Autorisez-le dans les réglages du système.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;

    if (vault === null || repositories === null) {
      setError('Le coffre est indisponible : la photo ne peut pas être enregistrée.');
      return;
    }

    try {
      const stored = await storeAttachmentFromUri({
        vault,
        repositories,
        kind: 'photo',
        uri: asset.uri,
        fileName: asset.fileName ?? `vehicule-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      // L'ancienne photo n'est retirée qu'une fois la nouvelle en place : l'inverse
      // laisserait l'utilisateur sans photo du tout si la seconde échouait.
      const previous = photoFileId;
      setPhotoFileId(stored.id);
      if (previous !== null) {
        const previousFile = await repositories.files.get(previous);
        if (previousFile !== null) {
          await removeAttachment({ vault, repositories, file: previousFile, now: now() });
        }
      }
      setNotice('Photo enregistrée dans le coffre chiffré.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function clearPhoto(): Promise<void> {
    if (photoFileId === null || vault === null || repositories === null) {
      setPhotoFileId(null);
      return;
    }
    const stored = await repositories.files.get(photoFileId);
    if (stored !== null) {
      await removeAttachment({ vault, repositories, file: stored, now: now() });
    }
    setPhotoFileId(null);
  }

  async function save(): Promise<void> {
    if (repositories === null) return;

    if (brand.trim() === '' || model.trim() === '' || plate.trim() === '') {
      setError('Marque, modèle et immatriculation sont nécessaires.');
      return;
    }
    if (plateIsDuplicate) {
      setError('Cette immatriculation est déjà utilisée par un autre véhicule.');
      return;
    }
    if (mileageIsInconsistent) {
      setError('Le compteur actuel ne peut pas être inférieur au kilométrage d’achat.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      const vehicle: Vehicle = {
        id: existing?.id ?? newId(),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        archivedAt: existing?.archivedAt ?? null,
        brand: brand.trim(),
        model: model.trim(),
        trim: trim.trim(),
        year,
        plate: plate.trim().toUpperCase(),
        vin: vin.trim().toUpperCase(),
        fuelType,
        status,
        purchaseDate,
        purchasePriceCents: purchasePriceCents ?? 0,
        purchaseFeesCents: purchaseFeesCents ?? 0,
        purchaseMileageKm: purchaseMileageKm ?? 0,
        currentMileageKm: currentMileageKm ?? purchaseMileageKm ?? 0,
        amortizationMonths: amortizationMonths ?? DEFAULT_AMORTIZATION_MONTHS,
        amortizationMethod,
        photoFileId,
        notes,
      };

      if (existing === null) {
        await repositories.vehicles.insert(vehicle);
        // Le relevé d'achat n'existe que s'il y a un kilométrage : sans lui, il n'y a rien
        // à comparer plus tard, et une ligne à zéro fausserait la consommation moyenne.
        if (purchaseMileageKm !== null && purchaseMileageKm > 0) {
          await repositories.mileageRecords.insert({
            id: newId(),
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: null,
            vehicleId: vehicle.id,
            date: purchaseDate ?? timestamp.slice(0, 10),
            km: purchaseMileageKm,
            source: 'achat',
            rentalId: null,
            comment: 'Kilométrage à l’achat',
          });
        }
      } else {
        await repositories.vehicles.update(vehicle);
      }

      await refresh();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  /**
   * Retirer un véhicule de la liste est un **archivage**. Les locations, les paiements et
   * les dépenses qui s'y rattachent restent en base : ils portent les chiffres d'années
   * passées, et une suppression réelle les rendrait orphelins.
   */
  async function archive(): Promise<void> {
    if (repositories === null || existing === null) return;
    const active = data.rentals.some(
      (rental) => rental.vehicleId === existing.id && rental.status === 'active',
    );
    if (active) {
      setError('Ce véhicule a une location en cours : terminez-la avant de l’archiver.');
      return;
    }
    setSaving(true);
    try {
      await repositories.vehicles.archive(existing.id, now());
      await refresh();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      footer={
        <Button
          label={isEdit ? 'Enregistrer les modifications' : 'Ajouter le véhicule'}
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null}
          block
        />
      }
    >
      {isEdit ? (
        <DetailTitle
          title="Modifier le véhicule"
          subtitle={existing === null ? undefined : `${existing.brand} ${existing.model}`.trim()}
          onBack={() => router.back()}
        />
      ) : (
        <ScreenTitle title="Nouveau véhicule" subtitle="Carte grise, prix d’achat, amortissement" />
      )}

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.photoRow}>
          <Pressable onPress={() => void pickPhoto()} style={styles.photoFrame}>
            {photo.uri === null ? (
              <View style={[styles.photoPlaceholder, { borderColor: colors.border }]}>
                <Icon name="camera" size={22} color={colors.textFaint} strokeWidth={1.8} />
                <AppText variant="caption" color="textFaint" style={{ marginTop: 4 }}>
                  Photo
                </AppText>
              </View>
            ) : (
              <Image source={{ uri: photo.uri }} style={styles.photoImage} resizeMode="cover" />
            )}
          </Pressable>
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <AppText variant="small" color="textMuted">
              Conservée chiffrée sur cet appareil, comme les documents. Elle sert de vignette
              dans la liste des véhicules.
            </AppText>
            {photo.error === null ? null : (
              <AppText variant="caption" color="danger" style={{ marginTop: spacing.xs }}>
                {photo.error}
              </AppText>
            )}
            <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
              <Pressable onPress={() => void pickPhoto()} hitSlop={8}>
                <AppText variant="small" color="primary">
                  {photoFileId === null ? 'Choisir une photo' : 'Remplacer'}
                </AppText>
              </Pressable>
              {photoFileId === null ? null : (
                <Pressable
                  onPress={() => void clearPhoto()}
                  hitSlop={8}
                  style={{ marginLeft: spacing.lg }}
                >
                  <AppText variant="small" color="danger">
                    Retirer
                  </AppText>
                </Pressable>
              )}
            </View>
          </View>
        </View>
        {notice === null ? null : (
          <AppText variant="caption" color="success" style={{ marginTop: spacing.sm }}>
            {notice}
          </AppText>
        )}
      </Card>

      <SectionHeader title="Identification" />
      <TextField
        label="Marque"
        required
        value={brand}
        onChange={setBrand}
        placeholder="Toyota"
        autoCapitalize="words"
      />
      <TextField
        label="Modèle"
        required
        value={model}
        onChange={setModel}
        placeholder="Corolla"
        autoCapitalize="words"
      />
      <TextField
        label="Finition"
        value={trim}
        onChange={setTrim}
        placeholder="Touring Sports"
        autoCapitalize="words"
        hint="Apparaît dans le contrat, à côté du modèle."
      />
      <NumberField
        label="Année"
        value={year}
        onChange={setYear}
        suffix=""
        hint="Année de première mise en circulation."
      />
      <TextField
        label="Immatriculation"
        required
        value={plate}
        onChange={setPlate}
        placeholder="AB-123-CD"
        autoCapitalize="characters"
        error={plateIsDuplicate ? 'Déjà utilisée par un autre véhicule.' : null}
      />
      <TextField
        label="Numéro de châssis (VIN)"
        value={vin}
        onChange={setVin}
        placeholder="17 caractères"
        autoCapitalize="characters"
        hint="Figure sur la carte grise et dans le contrat."
      />

      <SelectField
        label="Énergie"
        value={fuelType}
        options={FUEL_TYPES.map((value) => ({ value, label: FUEL_TYPE_LABELS[value] }))}
        onChange={setFuelType}
        grid
      />

      <SectionHeader title="Achat" />
      <DateField label="Date d’achat" value={purchaseDate} onChange={setPurchaseDate} />
      <MoneyField
        label="Prix d’achat"
        required
        cents={purchasePriceCents}
        onCents={setPurchasePriceCents}
        hint="Sert de base à l’amortissement et au calcul de rentabilité."
      />
      <MoneyField
        label="Frais d’acquisition"
        cents={purchaseFeesCents}
        onCents={setPurchaseFeesCents}
        hint="Carte grise, transport, remise en état initiale."
      />
      <NumberField
        label="Kilométrage à l’achat"
        value={purchaseMileageKm}
        onChange={onPurchaseMileageChange}
        suffix="km"
      />
      <NumberField
        label="Kilométrage actuel"
        value={currentMileageKm}
        onChange={setCurrentMileageKm}
        suffix="km"
        error={mileageIsInconsistent ? 'Inférieur au kilométrage d’achat.' : null}
        hint="Pilote les échéances d’entretien. Se met à jour à chaque relevé."
      />

      {priceTotalCents === 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="warning">
            Sans prix d’achat, la rentabilité de ce véhicule sera affichée comme si
            l’investissement était nul : le taux de récupération perdrait tout sens.
          </AppText>
        </Card>
      ) : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {`Investissement total : ${formatMoney(priceTotalCents)}. Compteur retenu : ${formatKm(currentMileageKm ?? 0)}.`}
          </AppText>
        </Card>
      )}

      <SectionHeader title="Amortissement" />
      <NumberField
        label="Durée d’amortissement"
        value={amortizationMonths}
        onChange={setAmortizationMonths}
        suffix="mois"
        hint="Vous choisissez la durée : aucune n’est imposée."
      />
      <SelectField
        label="Méthode"
        value={amortizationMethod}
        options={AMORTIZATION_METHODS.map((value) => ({
          value,
          label: AMORTIZATION_METHOD_LABELS[value],
          hint: value === 'lineaire' ? 'Parts égales chaque mois' : 'Charges plus fortes au début',
        }))}
        onChange={setAmortizationMethod}
        grid
      />

      <SectionHeader title="État" />
      <SelectField
        label="Statut du véhicule"
        value={status}
        options={VEHICLE_STATUSES.map((value) => ({
          value,
          label: VEHICLE_STATUS_LABELS[value].label,
        }))}
        onChange={setStatus}
        grid
        hint="Le statut passe automatiquement à « Loué » quand une location démarre."
      />
      <TextField
        label="Notes"
        value={notes}
        onChange={setNotes}
        multiline
        placeholder="Particularités, accessoires, historique connu…"
      />

      {error === null ? null : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}

      {isEdit ? (
        <>
          <SectionHeader title="Retirer de la flotte" />
          <Card>
            <AppText variant="small" color="textMuted">
              Archiver conserve les locations, les paiements et les dépenses déjà
              enregistrés : les chiffres des années passées restent justes. Le véhicule
              sort simplement des listes.
            </AppText>
            <View style={{ height: spacing.md }} />
            <Button
              label="Archiver ce véhicule"
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

const styles = StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center' },
  photoFrame: { width: 96, height: 72, borderRadius: radius.md, overflow: 'hidden' },
  photoPlaceholder: {
    flex: 1,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoImage: { width: '100%', height: '100%' },
});
