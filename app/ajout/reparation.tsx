/**
 * Enregistrer une réparation.
 *
 * ## Réparation n'est pas entretien
 *
 * Un entretien est **prévu** : il a un type, un intervalle, et il recule une échéance. Une
 * réparation ne se prévoit pas — elle constate une panne ou un dommage, et son coût est une
 * dépense qui pèse sur la rentabilité du véhicule sans rien reprogrammer. Les confondre
 * ferait apparaître une « prochaine vidange » après un changement de pare-chocs.
 *
 * ## Le lien avec un dommage déclaré
 *
 * Une réparation règle souvent un dommage déjà constaté. La rattacher met à jour son coût
 * réel et le marque réparé, en une seule saisie — sans quoi il faudrait retourner sur la
 * fiche du véhicule corriger le dommage à la main, et on ne le ferait pas.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DAMAGE_TYPE_LABELS, SOURCE_LABELS } from '@/domain/catalog';
import { formatFr, todayIso } from '@/domain/dates';
import { formatKm, formatMoney } from '@/domain/money';
import type { Expense } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import { Card, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { DateField, MoneyField, NumberField, SelectField, SwitchRow, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';

/** Libellés de catégories qui relèvent d'une réparation, pour préselectionner la bonne. */
const REPAIR_HINTS = ['carrosserie', 'mécanique', 'sinistre', 'dépannage', 'imprévu'];

export default function RepairFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string; damageId?: string }>();

  const preselectedDamage =
    data.damages.find((candidate) => candidate.id === params.damageId) ?? null;

  const [vehicleId, setVehicleId] = useState<string | null>(
    params.vehicleId ?? preselectedDamage?.vehicleId ?? data.vehicles[0]?.id ?? null,
  );
  const [date, setDate] = useState<string | null>(todayIso());
  const [amountCents, setAmountCents] = useState<number | null>(
    preselectedDamage === null || preselectedDamage.estimatedCostCents === 0
      ? null
      : preselectedDamage.estimatedCostCents,
  );
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState('');
  const [mileageKm, setMileageKm] = useState<number | null>(null);
  const [description, setDescription] = useState(
    preselectedDamage === null
      ? ''
      : `${DAMAGE_TYPE_LABELS[preselectedDamage.type] ?? 'Dommage'}${preselectedDamage.zone === '' ? '' : ` — ${preselectedDamage.zone}`}`,
  );
  const [damageId, setDamageId] = useState<string | null>(preselectedDamage?.id ?? null);
  const [markRepaired, setMarkRepaired] = useState(preselectedDamage !== null);
  const [setVehicleInRepair, setSetVehicleInRepair] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId) ?? null;

  /** Dommages non réparés du véhicule, plus celui éventuellement présélectionné. */
  const openDamages = useMemo(() => {
    return data.damages
      .filter((damage) => damage.vehicleId === vehicleId && (!damage.repaired || damage.id === damageId))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data.damages, vehicleId, damageId]);

  /** Catégorie présélectionnée : la première qui évoque une réparation. */
  const defaultCategoryId = useMemo(() => {
    for (const hint of REPAIR_HINTS) {
      const found = data.expenseCategories.find((category) =>
        category.label.toLowerCase().includes(hint),
      );
      if (found !== undefined) return found.id;
    }
    return data.expenseCategories[0]?.id ?? null;
  }, [data.expenseCategories]);

  const effectiveCategoryId = categoryId ?? defaultCategoryId;

  async function save(): Promise<void> {
    if (repositories === null) return;
    if (vehicleId === null) {
      setError('Choisissez le véhicule réparé.');
      return;
    }
    if (date === null) {
      setError('La date de la réparation est nécessaire.');
      return;
    }
    if (effectiveCategoryId === null) {
      setError('Aucune catégorie de dépense disponible.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      const expense: Expense = {
        id: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
        vehicleId,
        rentalId: null,
        date,
        amountCents: amountCents ?? 0,
        categoryId: effectiveCategoryId,
        mileageKm,
        supplier: supplier.trim(),
        comment: description,
        invoiceFileId: null,
        photoFileId: null,
        maintenanceRecordId: null,
        damageId,
      };
      await repositories.expenses.insert(expense);

      if (damageId !== null && markRepaired) {
        const damage = data.damages.find((candidate) => candidate.id === damageId);
        if (damage !== undefined) {
          await repositories.damages.update({
            ...damage,
            repaired: true,
            actualCostCents: amountCents ?? damage.actualCostCents,
            updatedAt: timestamp,
          });
        }
      }

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
        <ScreenTitle title="Réparation" />
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
          label="Enregistrer la réparation"
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null}
          block
        />
      }
    >
      <ScreenTitle title="Réparation" subtitle="Panne, carrosserie, sinistre" />

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
        onChange={(value) => {
          setVehicleId(value);
          // Un dommage appartient à un véhicule : en changer invaliderait le lien.
          setDamageId(null);
          setMarkRepaired(false);
        }}
      />

      <DateField label="Date de la réparation" required value={date} onChange={setDate} />

      <MoneyField
        label="Montant payé"
        required
        cents={amountCents}
        onCents={setAmountCents}
        hint="Le montant de la facture. Il compte dans la rentabilité du véhicule."
      />

      <SelectField
        label="Catégorie de dépense"
        required
        value={effectiveCategoryId}
        options={data.expenseCategories.map((category) => ({
          value: category.id,
          label: category.label,
        }))}
        onChange={setCategoryId}
        grid
        hint="Les catégories d’entretien alimentent le poste « coût d’entretien »."
      />

      <TextField
        label="Garage ou fournisseur"
        value={supplier}
        onChange={setSupplier}
        autoCapitalize="words"
        placeholder="Nom du garage"
      />

      <NumberField
        label="Kilométrage"
        value={mileageKm}
        onChange={setMileageKm}
        suffix="km"
        hint={
          vehicle === null
            ? undefined
            : `Compteur actuel : ${formatKm(vehicle.currentMileageKm)}`
        }
      />

      <TextField
        label="Description"
        value={description}
        onChange={setDescription}
        multiline
        placeholder="Ce qui a été fait, pièces remplacées…"
      />

      {openDamages.length === 0 ? null : (
        <>
          <SectionHeader title="Dommage réglé par cette réparation" />
          <SelectField
            label="Dommage déclaré"
            value={damageId}
            options={openDamages.map((damage) => ({
              value: damage.id,
              label: `${DAMAGE_TYPE_LABELS[damage.type] ?? 'Dommage'}${damage.zone === '' ? '' : ` — ${damage.zone}`}`,
              hint: `constaté le ${formatFr(damage.date)}${damage.estimatedCostCents === 0 ? '' : ` · estimé ${formatMoney(damage.estimatedCostCents)}`}`,
            }))}
            onChange={setDamageId}
            hint="Rattacher met à jour le coût réel du dommage."
          />
          {damageId === null ? null : (
            <Card>
              <SwitchRow
                label="Marquer le dommage comme réparé"
                hint="Il cesse d’apparaître dans les dommages en attente sur la fiche du véhicule."
                value={markRepaired}
                onChange={setMarkRepaired}
              />
            </Card>
          )}
        </>
      )}

      <SectionHeader title="État du véhicule" />
      <Card>
        <SwitchRow
          label="Passer le véhicule en réparation"
          hint="Tant qu’il est dans cet état, il n’apparaît plus comme disponible pour une location."
          value={setVehicleInRepair}
          onChange={setSetVehicleInRepair}
        />
      </Card>

      <Card sunken style={{ marginTop: spacing.lg }}>
        <AppText variant="small" color="textMuted">
          {`Une réparation est enregistrée comme dépense (${SOURCE_LABELS.manuel?.toLowerCase() ?? 'saisie manuelle'}), pas comme entretien : elle ne reprogramme aucune échéance.`}
        </AppText>
      </Card>

      {error === null ? null : (
        <Card sunken style={{ marginTop: spacing.md }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}
    </Screen>
  );
}
