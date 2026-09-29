/**
 * Relever le kilométrage.
 *
 * C'est le geste le plus anodin de l'application, et l'un des plus utiles : un compteur à
 * jour fait bouger les échéances d'entretien, le coût au kilomètre et la projection de la
 * prochaine intervention. Le formulaire tient donc en trois champs, et il prévient quand le
 * relevé **recule** — un compteur ne recule pas, et accepter une saisie inférieure
 * fausserait toutes les échéances sans rien signaler.
 */

import { useState, type ReactElement } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { todayIso } from '@/domain/dates';
import { formatKm, formatNumberFr } from '@/domain/money';
import { useApp } from '@/state/app-context';
import { vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import { Card, Screen, ScreenTitle } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { DateField, NumberField, SelectField, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';

export default function MileageFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string }>();

  // La fiche véhicule ouvre ce formulaire en désignant déjà le véhicule : le champ reste
  // modifiable, mais on ne le fait pas choisir deux fois.
  const [vehicleId, setVehicleId] = useState<string | null>(
    params.vehicleId ?? data.vehicles[0]?.id ?? null,
  );
  const [date, setDate] = useState<string | null>(todayIso());
  const [km, setKm] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId);
  const goesBackward = vehicle !== undefined && km !== null && km < vehicle.currentMileageKm;

  async function save(): Promise<void> {
    if (repositories === null) return;
    if (vehicleId === null || date === null || km === null) {
      setError('Véhicule, date et kilométrage sont nécessaires.');
      return;
    }
    if (goesBackward) {
      setError(
        `Le compteur ne peut pas reculer : il est déjà à ${formatNumberFr(vehicle?.currentMileageKm ?? 0)} km.`,
      );
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      await repositories.mileageRecords.insert({
        id: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        vehicleId,
        date,
        km,
        source: 'manuel',
        rentalId: null,
        comment: notes,
      });
      // `updateMileage` ignore de lui-même une valeur inférieure : la garde est ici **et**
      // dans la requête, parce que deux écrans peuvent saisir en même temps.
      await repositories.vehicles.updateMileage(vehicleId, km, timestamp);
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
        <ScreenTitle title="Kilométrage" />
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
          label="Enregistrer le relevé"
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null || km === null || goesBackward}
          block
        />
      }
    >
      <ScreenTitle title="Kilométrage" subtitle="Met à jour les échéances d’entretien" />

      <SelectField
        label="Véhicule"
        required
        value={vehicleId}
        options={data.vehicles
          .filter((candidate) => candidate.status !== 'vendu')
          .map((candidate) => ({
            value: candidate.id,
            label: vehicleName(data, candidate.id),
            hint: formatKm(candidate.currentMileageKm),
          }))}
        onChange={(value) => {
          setVehicleId(value);
          setKm(null);
        }}
      />

      <NumberField
        label="Kilométrage relevé"
        required
        value={km}
        onChange={setKm}
        suffix="km"
        error={goesBackward ? 'Inférieur au compteur actuel.' : null}
        hint={
          vehicle === undefined ? undefined : `Compteur actuel : ${formatKm(vehicle.currentMileageKm)}`
        }
      />

      {vehicle !== undefined && km !== null && !goesBackward && km > vehicle.currentMileageKm ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {`Ce relevé ajoute ${formatKm(km - vehicle.currentMileageKm)} au compteur.`}
          </AppText>
        </Card>
      ) : null}

      <DateField label="Date du relevé" required value={date} onChange={setDate} />

      <TextField
        label="Note"
        value={notes}
        onChange={setNotes}
        placeholder="Relevé mensuel, retour de location…"
        multiline
      />

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
