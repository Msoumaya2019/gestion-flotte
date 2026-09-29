/**
 * Enregistrer un entretien.
 *
 * ## Un seul geste, trois conséquences
 *
 * Noter une intervention doit à la fois : l'inscrire à l'historique, **reculer l'échéance**
 * du plan correspondant, et créer la dépense qui va avec. Faire saisir la même chose deux
 * fois — une fois en entretien, une fois en dépense — garantirait qu'on en oublie une, et
 * le coût d'exploitation du véhicule deviendrait faux.
 *
 * ## L'échéance repart de l'intervention, pas du compteur
 *
 * Le nouveau point de départ est la date **et le kilométrage de l'intervention**, pas le
 * compteur actuel du véhicule. Une vidange faite à 125 000 km et saisie une semaine plus
 * tard, véhicule entre-temps à 125 400 km, doit repartir de 125 000 : sinon chaque retard
 * de saisie décalerait l'échéance suivante d'autant.
 */

import { useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { todayIso } from '@/domain/dates';
import { formatKm } from '@/domain/money';
import { intervalLabel } from '@/domain/maintenance';
import { useApp } from '@/state/app-context';
import { vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import { Card, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { DateField, MoneyField, NumberField, SelectField, SwitchRow, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';

export default function MaintenanceFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string }>();

  const [vehicleId, setVehicleId] = useState<string | null>(
    params.vehicleId ?? data.vehicles[0]?.id ?? null,
  );
  const [typeId, setTypeId] = useState<string | null>(data.maintenanceTypes[0]?.id ?? null);
  const [date, setDate] = useState<string | null>(todayIso());
  const [mileageKm, setMileageKm] = useState<number | null>(null);
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [supplier, setSupplier] = useState('');
  const [comment, setComment] = useState('');
  const [partsChanged, setPartsChanged] = useState('');
  const [createExpense, setCreateExpense] = useState(true);
  const [updatePlan, setUpdatePlan] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId);
  const type = data.maintenanceTypes.find((candidate) => candidate.id === typeId);
  const existingPlan = data.maintenancePlans.find(
    (plan) => plan.vehicleId === vehicleId && plan.typeId === typeId,
  );

  async function save(): Promise<void> {
    if (repositories === null) return;
    if (vehicleId === null || typeId === null || date === null || mileageKm === null) {
      setError('Véhicule, type, date et kilométrage sont nécessaires.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      const recordId = newId();

      await repositories.maintenanceRecords.insert({
        id: recordId,
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        vehicleId,
        planId: existingPlan?.id ?? null,
        typeId,
        date,
        mileageKm,
        amountCents: amountCents ?? 0,
        supplier,
        comment,
        partsChanged,
        invoiceFileId: null,
        photoFileId: null,
      });

      // Le compteur avance : une intervention se fait rarement à un kilométrage inférieur
      // à celui déjà connu.
      await repositories.vehicles.updateMileage(vehicleId, mileageKm, timestamp);

      if (updatePlan) {
        if (existingPlan === undefined) {
          // Pas encore de plan : on en crée un à partir des valeurs par défaut du type
          // d'entretien, et l'intervention qui vient d'être saisie en devient le point de
          // départ.
          if (type !== undefined) {
            await repositories.maintenancePlans.upsertPlan({
              id: newId(),
              createdAt: timestamp,
              updatedAt: timestamp,
              archivedAt: null,
              vehicleId,
              typeId,
              intervalMode: type.intervalMode,
              intervalKm: type.intervalKm,
              intervalMonths: type.intervalMonths,
              lastKm: mileageKm,
              lastDate: date,
              active: true,
              notes: '',
            });
          }
        } else {
          await repositories.maintenancePlans.applyIntervention(
            existingPlan.id,
            date,
            mileageKm,
            timestamp,
          );
        }
      }

      if (createExpense && amountCents !== null && amountCents > 0) {
        const category =
          data.expenseCategories.find((candidate) =>
            candidate.label.trim().toLowerCase().startsWith('entretien'),
          ) ?? data.expenseCategories[0];

        if (category !== undefined) {
          await repositories.expenses.insert({
            id: newId(),
            createdAt: timestamp,
            updatedAt: timestamp,
            archivedAt: null,
            vehicleId,
            rentalId: null,
            date,
            amountCents,
            categoryId: category.id,
            mileageKm,
            supplier,
            comment: comment === '' ? (type?.label ?? 'Entretien') : comment,
            invoiceFileId: null,
            photoFileId: null,
            maintenanceRecordId: recordId,
            damageId: null,
          });
        }
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
        <ScreenTitle title="Entretien" />
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
          label="Enregistrer l’entretien"
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null || mileageKm === null}
          block
        />
      }
    >
      <ScreenTitle title="Entretien effectué" subtitle="Historique, échéance et dépense en une fois" />

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
          setMileageKm(null);
        }}
      />

      <SelectField
        label="Type d’entretien"
        required
        value={typeId}
        options={data.maintenanceTypes.map((candidate) => ({
          value: candidate.id,
          label: candidate.label,
          hint: intervalLabel(candidate.intervalMode, candidate.intervalKm, candidate.intervalMonths),
        }))}
        onChange={setTypeId}
        grid
      />

      <DateField label="Date de l’intervention" required value={date} onChange={setDate} quick={false} />

      <NumberField
        label="Kilométrage à l’intervention"
        required
        value={mileageKm}
        onChange={setMileageKm}
        suffix="km"
        hint={
          vehicle === undefined
            ? undefined
            : `Compteur actuel : ${formatKm(vehicle.currentMileageKm)}. L’échéance suivante repartira de la valeur saisie ici.`
        }
      />

      <MoneyField label="Montant" cents={amountCents} onCents={setAmountCents} />

      <TextField
        label="Garage"
        value={supplier}
        onChange={setSupplier}
        placeholder="Nom du garage"
        autoCapitalize="words"
      />

      <TextField
        label="Pièces changées"
        value={partsChanged}
        onChange={setPartsChanged}
        placeholder="Filtre à huile, joint de bouchon…"
      />

      <TextField
        label="Commentaire"
        value={comment}
        onChange={setComment}
        multiline
        placeholder="Observations, préconisations du garagiste…"
      />

      <SectionHeader title="Conséquences" />
      <Card>
        <SwitchRow
          label="Mettre à jour l’échéance"
          hint={
            existingPlan === undefined
              ? 'Aucun plan pour ce type : il sera créé avec les valeurs par défaut.'
              : `Prochain seuil actuel : ${existingPlan.lastKm === null ? 'non renseigné' : formatKm(existingPlan.lastKm)}`
          }
          value={updatePlan}
          onChange={setUpdatePlan}
        />
        <View style={{ height: spacing.sm }} />
        <SwitchRow
          label="Créer la dépense correspondante"
          hint="Pour que le coût d’exploitation du véhicule reste juste."
          value={createExpense}
          onChange={setCreateExpense}
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
