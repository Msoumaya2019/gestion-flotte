/**
 * État des lieux — départ ou retour.
 *
 * ## Deux documents, une comparaison
 *
 * Un état des lieux isolé ne prouve rien. Ce qui tranche, c'est l'écart entre le départ et
 * le retour : une rayure présente au départ n'est pas imputable au locataire, la même
 * apparue au retour l'est. L'écran rappelle donc, quand on fait le retour, ce qui avait été
 * constaté au départ — sans quoi il faudrait ouvrir deux écrans et comparer de mémoire.
 *
 * ## Le carburant en huitièmes
 *
 * C'est l'unité des états des lieux papier, et elle est suffisante : une jauge se lit au
 * huitième, pas au pour cent. Une unité plus fine donnerait une fausse impression de
 * précision et personne ne saurait la remplir.
 *
 * ## Les photos, par emplacement
 *
 * Elles sont rangées par emplacement nommé — avant, arrière, gauche, droite, intérieur,
 * compteur — plutôt qu'en vrac. C'est ce qui permet, des mois plus tard, de retrouver le
 * pare-chocs arrière sans ouvrir les huit photos une par une.
 */

import { useState, type ReactElement } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';

import { formatFr, todayIso } from '@/domain/dates';
import { formatKm } from '@/domain/money';
import type { Inspection, InspectionPhoto } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
import { storeAttachmentFromUri } from '@/services/attachments';
import { AppText } from '@/ui/components/text';
import { Icon } from '@/ui/components/icons';
import { Card, DetailTitle, EmptyState, Screen, SectionHeader } from '@/ui/components/base';
import { Button, SegmentedControl } from '@/ui/components/button';
import { DateField, NumberField, TextField } from '@/ui/components/fields';
import { SignaturePad } from '@/ui/components/signature';
import { radius, spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { useVaultImage } from '@/ui/use-vault-image';

/** Emplacements proposés. L'ordre suit le tour du véhicule, comme sur un formulaire papier. */
const PHOTO_SLOTS: readonly { slot: string; label: string }[] = [
  { slot: 'avant', label: 'Avant' },
  { slot: 'arriere', label: 'Arrière' },
  { slot: 'gauche', label: 'Côté gauche' },
  { slot: 'droite', label: 'Côté droit' },
  { slot: 'jantes', label: 'Jantes' },
  { slot: 'interieur', label: 'Intérieur' },
  { slot: 'compteur', label: 'Compteur' },
];

export default function InspectionScreen(): ReactElement {
  const { data, repositories, refresh, now, newId, vault } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ rentalId?: string; kind?: string }>();

  const rental = data.rentals.find((candidate) => candidate.id === params.rentalId) ?? null;
  const kind: Inspection['kind'] = params.kind === 'retour' ? 'retour' : 'depart';

  const existing =
    rental === null
      ? null
      : (data.inspections.find(
          (inspection) => inspection.rentalId === rental.id && inspection.kind === kind,
        ) ?? null);

  const other =
    rental === null
      ? null
      : (data.inspections.find(
          (inspection) => inspection.rentalId === rental.id && inspection.kind !== kind,
        ) ?? null);

  const vehicle = rental === null ? null : (data.vehicles.find((v) => v.id === rental.vehicleId) ?? null);

  const [date, setDate] = useState<string | null>(existing?.date ?? todayIso());
  const [mileageKm, setMileageKm] = useState<number | null>(
    existing?.mileageKm ?? vehicle?.currentMileageKm ?? rental?.startMileageKm ?? null,
  );
  const [fuelEighths, setFuelEighths] = useState<number | null>(existing?.fuelEighths ?? 8);
  const [interiorState, setInteriorState] = useState(existing?.interiorState ?? '');
  const [exteriorState, setExteriorState] = useState(existing?.exteriorState ?? '');
  const [observations, setObservations] = useState(existing?.observations ?? '');
  const [photos, setPhotos] = useState<InspectionPhoto[]>(existing?.photos ?? []);
  const [signature, setSignature] = useState<string | null>(existing?.tenantSignature ?? null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (rental === null || vehicle === null) {
    return (
      <Screen>
        <DetailTitle title="État des lieux" onBack={() => router.back()} />
        <Card>
          <EmptyState
            icon="clipboard"
            title="Location introuvable"
            message="Cet état des lieux ne peut pas être rattaché à une location."
            action={<Button label="Retour" onPress={() => router.back()} />}
          />
        </Card>
      </Screen>
    );
  }

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
  const vehicleId = vehicle.id;
  const vehicleMileageKm = vehicle.currentMileageKm;

  async function pickPhoto(slot: string): Promise<void> {
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
      quality: 0.7,
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
        fileName: asset.fileName ?? `${slot}-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setPhotos((previous) => [
        ...previous.filter((photo) => photo.slot !== slot),
        { slot, fileId: stored.id },
      ]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function save(): Promise<void> {
    if (repositories === null) return;
    if (date === null || mileageKm === null) {
      setError('La date et le kilométrage sont nécessaires.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      const inspection: Inspection = {
        id: existing?.id ?? newId(),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        rentalId,
        vehicleId,
        kind,
        date,
        mileageKm,
        fuelEighths: fuelEighths ?? 8,
        interiorState,
        exteriorState,
        observations,
        photos,
        tenantSignature: signature,
      };

      if (existing === null) await repositories.inspections.insert(inspection);
      else await repositories.inspections.update(inspection);

      // Le compteur avance, et le relevé porte sa source : un relevé d'état des lieux se
      // distingue d'une saisie manuelle quand on relit l'historique du kilométrage.
      if (mileageKm > vehicleMileageKm) {
        await repositories.mileageRecords.insert({
          id: newId(),
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null,
          vehicleId,
          date,
          km: mileageKm,
          source: 'etat_des_lieux',
          rentalId,
          comment: kind === 'depart' ? 'État des lieux de départ' : 'État des lieux de retour',
        });
        await repositories.vehicles.updateMileage(vehicleId, mileageKm, timestamp);
      }

      await refresh();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  const photoOf = (slot: string) => photos.find((photo) => photo.slot === slot) ?? null;
  const missingPhotos = PHOTO_SLOTS.filter((entry) => photoOf(entry.slot) === null).length;

  return (
    <Screen
      footer={
        <Button
          label={existing === null ? 'Enregistrer l’état des lieux' : 'Mettre à jour'}
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null}
          block
        />
      }
    >
      <DetailTitle
        title={kind === 'depart' ? 'État des lieux de départ' : 'État des lieux de retour'}
        subtitle={`${vehicleName(data, vehicle.id)} · ${tenantName(data, rental.tenantId)}`}
        onBack={() => router.back()}
      />

      <Card style={{ marginBottom: spacing.lg }}>
        <SegmentedControl
          options={[
            { value: 'depart', label: 'Départ' },
            { value: 'retour', label: 'Retour' },
          ]}
          value={kind}
          onChange={(value) => router.replace(`/etat-lieux/${rental.id}?kind=${value}`)}
        />
        <View style={{ height: spacing.md }} />
        <AppText variant="caption" color="textFaint">
          {existing === null
            ? 'Aucun état des lieux enregistré pour cette étape.'
            : `Enregistré le ${formatFr(existing.date)}.`}
        </AppText>
      </Card>

      {other === null ? (
        <Card sunken style={{ marginBottom: spacing.lg, borderColor: colors.warning }}>
          <AppText variant="small" color="warning">
            {kind === 'retour'
              ? 'Aucun état des lieux de départ : sans lui, un dommage constaté au retour ne peut pas être imputé au locataire.'
              : 'Aucun état des lieux de retour pour l’instant. C’est la comparaison des deux qui tranche en cas de litige.'}
          </AppText>
        </Card>
      ) : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {`Constaté au ${other.kind === 'depart' ? 'départ' : 'retour'} le ${formatFr(other.date)} : ${formatKm(other.mileageKm)}, carburant ${other.fuelEighths}/8.`}
          </AppText>
          {other.exteriorState === '' ? null : (
            <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
              {`Extérieur : ${other.exteriorState}`}
            </AppText>
          )}
          {other.interiorState === '' ? null : (
            <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
              {`Intérieur : ${other.interiorState}`}
            </AppText>
          )}
          {other.photos.length === 0 ? null : (
            <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
              {`${other.photos.length} photo${other.photos.length > 1 ? 's' : ''} au ${other.kind === 'depart' ? 'départ' : 'retour'}.`}
            </AppText>
          )}
        </Card>
      )}

      <SectionHeader title="Relevé" />
      <DateField label="Date du constat" required value={date} onChange={setDate} />
      <NumberField
        label="Kilométrage relevé"
        required
        value={mileageKm}
        onChange={setMileageKm}
        suffix="km"
        hint={`Compteur actuel : ${formatKm(vehicle.currentMileageKm)}`}
      />
      <NumberField
        label="Carburant"
        value={fuelEighths}
        onChange={setFuelEighths}
        suffix="/ 8"
        hint="Jauge en huitièmes, comme sur un état des lieux papier."
      />

      <SectionHeader title="État constaté" />
      <TextField
        label="Extérieur"
        value={exteriorState}
        onChange={setExteriorState}
        multiline
        placeholder="Rayures, bosses, état des jantes, propreté de la carrosserie…"
      />
      <TextField
        label="Intérieur"
        value={interiorState}
        onChange={setInteriorState}
        multiline
        placeholder="Sellerie, tapis, odeurs, équipements présents…"
      />
      <TextField
        label="Observations"
        value={observations}
        onChange={setObservations}
        multiline
        placeholder="Accessoires remis, remarques du locataire…"
      />

      <SectionHeader title={`Photos (${photos.length}/${PHOTO_SLOTS.length})`} icon="camera" />
      <Card>
        <View style={styles.grid}>
          {PHOTO_SLOTS.map((entry) => {
            const photo = photoOf(entry.slot);
            return (
              <Pressable
                key={entry.slot}
                onPress={() => void pickPhoto(entry.slot)}
                style={styles.cell}
              >
                <SlotPhoto fileId={photo?.fileId ?? null} />
                <AppText
                  variant="caption"
                  color={photo === null ? 'textFaint' : 'success'}
                  style={{ marginTop: 4 }}
                  numberOfLines={1}
                >
                  {entry.label}
                </AppText>
              </Pressable>
            );
          })}
        </View>
        <View style={{ height: spacing.sm }} />
        <AppText variant="caption" color="textFaint">
          {missingPhotos === 0
            ? 'Les sept emplacements sont renseignés. Les photos sont chiffrées sur cet appareil.'
            : `${missingPhotos} emplacement${missingPhotos > 1 ? 's' : ''} sans photo. Aucun n’est obligatoire, mais une photo vaut mieux qu’une description contestée.`}
        </AppText>
      </Card>

      <SectionHeader title="Signature du locataire" />
      <Card>
        <SignaturePad
          label="Lu et approuvé"
          value={signature}
          onChange={setSignature}
          height={160}
        />
      </Card>

      <SectionHeader title="Dommages" />
      <Card>
        <AppText variant="small" color="textMuted">
          Un dommage constaté pendant l’état des lieux se déclare séparément : il porte une
          photo dédiée, une localisation et un coût estimé, et il est rattaché à cette
          location.
        </AppText>
        <View style={{ height: spacing.md }} />
        <Button
          label="Déclarer un dommage"
          variant="secondary"
          icon="alert-triangle"
          block
          onPress={() =>
            router.push(`/ajout/incident?vehicleId=${vehicle.id}&rentalId=${rental.id}`)
          }
        />
      </Card>

      {error === null ? null : (
        <Card sunken style={{ marginTop: spacing.lg }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}
    </Screen>
  );
}

/** Vignette d'un emplacement : la photo déchiffrée, ou un cadre vide à remplir. */
function SlotPhoto({ fileId }: { fileId: string | null }): ReactElement {
  const { colors } = useTheme();
  const photo = useVaultImage(fileId);

  if (photo.uri === null) {
    return (
      <View style={[styles.cellFrame, { borderColor: colors.border }]}>
        <Icon name="camera" size={18} color={colors.textFaint} strokeWidth={1.8} />
      </View>
    );
  }
  return <Image source={{ uri: photo.uri }} style={styles.cellImage} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '31%', marginRight: '3.5%', marginBottom: spacing.md },
  cellFrame: {
    height: 68,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellImage: { width: '100%', height: 68, borderRadius: radius.md },
});
