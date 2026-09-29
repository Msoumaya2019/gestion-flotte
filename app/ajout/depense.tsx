/**
 * Enregistrer une dépense.
 *
 * Une dépense alimente trois choses à la fois : le résultat du mois, la rentabilité du
 * véhicule, et — si sa catégorie relève de l'entretien — le coût d'exploitation au
 * kilomètre. C'est pourquoi la catégorie n'est pas un détail : elle décide de la lecture
 * qu'on fera des chiffres six mois plus tard.
 *
 * La photo de la facture part dans le **coffre chiffré** de l'appareil, jamais sur un
 * serveur.
 */

import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { todayIso } from '@/domain/dates';
import { formatNumberFr } from '@/domain/money';
import { useApp } from '@/state/app-context';
import { vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import { Card, Screen, ScreenTitle } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { DateField, MoneyField, NumberField, SelectField, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';

export default function ExpenseFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId, vault } = useApp();
  const router = useRouter();

  const [vehicleId, setVehicleId] = useState<string | null>(data.vehicles[0]?.id ?? null);
  const [date, setDate] = useState<string | null>(todayIso());
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(data.expenseCategories[0]?.id ?? null);
  const [mileageKm, setMileageKm] = useState<number | null>(null);
  const [supplier, setSupplier] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId);

  async function save(): Promise<void> {
    if (repositories === null) return;
    if (vehicleId === null || date === null || amountCents === null || categoryId === null) {
      setError('Véhicule, date, montant et catégorie sont nécessaires.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      await repositories.expenses.insert({
        id: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        vehicleId,
        rentalId: null,
        date,
        amountCents,
        categoryId,
        mileageKm,
        supplier,
        comment,
        invoiceFileId: null,
        photoFileId: null,
        maintenanceRecordId: null,
        damageId: null,
      });

      // Un kilométrage saisi à l'occasion d'une dépense reste un relevé : il fait avancer
      // le compteur du véhicule, ce qui décale les échéances d'entretien en conséquence.
      if (mileageKm !== null) {
        await repositories.mileageRecords.insert({
          id: newId(),
          createdAt: timestamp,
          updatedAt: timestamp,
          archivedAt: null,
          vehicleId,
          date,
          km: mileageKm,
          source: 'manuel',
          rentalId: null,
          // `MileageRecord` n'a pas de champ `notes` : c'est `comment`.
          comment: 'Relevé lors d’une dépense',
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

  if (data.vehicles.length === 0) {
    return (
      <Screen>
        <ScreenTitle title="Dépense" />
        <Card>
          <AppText variant="body">
            Ajoutez d’abord un véhicule : une dépense se rattache toujours à un véhicule.
          </AppText>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label="Enregistrer la dépense"
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null || amountCents === null}
          block
        />
      }
    >
      <ScreenTitle title="Nouvelle dépense" subtitle="Elle alimente la rentabilité du véhicule" />

      <SelectField
        label="Véhicule"
        required
        value={vehicleId}
        options={data.vehicles.map((candidate) => ({
          value: candidate.id,
          label: vehicleName(data, candidate.id),
        }))}
        onChange={setVehicleId}
        grid
      />

      <MoneyField label="Montant" required cents={amountCents} onCents={setAmountCents} />

      <DateField label="Date" required value={date} onChange={setDate} />

      <SelectField
        label="Catégorie"
        required
        value={categoryId}
        options={data.expenseCategories.map((category) => ({
          value: category.id,
          label: category.label,
        }))}
        onChange={setCategoryId}
        grid
        hint="La catégorie décide si la dépense compte comme entretien dans le coût au kilomètre."
      />

      <NumberField
        label="Kilométrage au moment de la dépense"
        value={mileageKm}
        onChange={setMileageKm}
        suffix="km"
        hint={
          vehicle === undefined
            ? undefined
            : `Compteur actuel : ${formatNumberFr(vehicle.currentMileageKm)} km. Renseignez-le pour le faire avancer.`
        }
      />

      <TextField
        label="Garage ou fournisseur"
        value={supplier}
        onChange={setSupplier}
        placeholder="Nom du garage, de l’assureur…"
        autoCapitalize="words"
      />

      <TextField
        label="Commentaire"
        value={comment}
        onChange={setComment}
        placeholder="Détail, référence de facture…"
        multiline
      />

      {vault === null ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="warning">
            Le coffre local n’est pas disponible : les justificatifs ne pourront pas être
            joints. Le reste de la dépense s’enregistre normalement.
          </AppText>
        </Card>
      ) : null}

      {error === null ? null : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}

      <View style={styles.note}>
        <AppText variant="caption" color="textFaint">
          Les justificatifs photo seront ajoutés depuis la fiche du véhicule, une fois la
          dépense enregistrée.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: spacing.sm },
});
