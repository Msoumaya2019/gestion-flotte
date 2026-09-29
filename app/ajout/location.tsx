/**
 * Nouvelle location — véhicule, locataire, conditions, puis contrat.
 *
 * ## La fréquence de loyer est libre, et c'est structurant
 *
 * Un loyer n'est pas mensuel par nature. Un véhicule loué à un chauffeur VTC se règle
 * souvent à la semaine ; un autre se règle tous les quinze jours. Le formulaire propose donc
 * les quatre formes réelles — hebdomadaire, bimensuelle, mensuelle, personnalisée en jours —
 * et **montre l'échéancier qui en découle** avant d'enregistrer. C'est la seule façon de
 * vérifier qu'on a bien voulu « chaque lundi » et non « tous les 7 jours à partir
 * d'aujourd'hui », qui donnent des dates différentes.
 *
 * ## L'aperçu avant l'enregistrement
 *
 * Les premières échéances sont affichées avec leur date et leur montant. Une location mal
 * paramétrée se voit tout de suite, plutôt qu'à la première relance d'un locataire qui
 * n'était pas en retard.
 *
 * ## Le contrôle du dossier n'est pas bloquant
 *
 * Les documents exigés sont vérifiés et ce qui manque est nommé précisément. Mais refuser
 * une location parce qu'une attestation manque n'est pas au logiciel de décider : le
 * propriétaire peut forcer la validation, en connaissance de cause. Le message est alors
 * explicite, et le forçage est un geste conscient — pas un contournement silencieux.
 *
 * ## Le contrat vient après, et avant l'activation
 *
 * Enregistrer crée la location à l'état **prévue** et ouvre la préparation du contrat. Le
 * véhicule n'est marqué loué qu'à l'activation, qui suit la signature. C'est ce qui évite
 * qu'un véhicule disparaisse des disponibilités pour une location jamais signée.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DOCUMENT_STATUS_LABELS, FREQUENCY_LABELS } from '@/domain/catalog';
import { formatFr, todayIso, weekdayLabelFr } from '@/domain/dates';
import { checkRentalEligibility } from '@/domain/eligibility';
import { formatKm, formatMoney } from '@/domain/money';
import {
  openEndedHorizon,
  rentalKmUsage,
  scheduleDueDates,
  scheduleLabel,
  stepDays,
} from '@/domain/rental';
import {
  PAYMENT_FREQUENCIES,
  type PaymentFrequency,
  type Rental,
} from '@/domain/types';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import { Badge, Card, EmptyState, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import {
  DateField,
  MoneyField,
  NumberField,
  SelectField,
  SwitchRow,
  TextField,
} from '@/ui/components/fields';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Nombre d'échéances montrées dans l'aperçu. Au-delà, la liste n'apprend plus rien. */
const PREVIEW_COUNT = 6;

export default function RentalFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string }>();

  const today = todayIso();
  const firstVehicle =
    data.vehicles.find(
      (candidate) => candidate.id === params.vehicleId && candidate.status !== 'vendu',
    ) ?? data.vehicles.find((candidate) => candidate.status !== 'vendu') ?? null;

  const [vehicleId, setVehicleId] = useState<string | null>(firstVehicle?.id ?? null);
  const [tenantId, setTenantId] = useState<string | null>(data.tenants[0]?.id ?? null);
  const [startDate, setStartDate] = useState<string | null>(today);
  const [openEnded, setOpenEnded] = useState(true);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [rentAmountCents, setRentAmountCents] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<PaymentFrequency>('mensuel');
  const [intervalDays, setIntervalDays] = useState<number | null>(14);
  const [dueWeekday, setDueWeekday] = useState<number | null>(null);
  const [dueDayOfMonth, setDueDayOfMonth] = useState<number | null>(null);
  const [depositCents, setDepositCents] = useState<number | null>(null);
  const [startMileageKm, setStartMileageKm] = useState<number | null>(
    firstVehicle?.currentMileageKm ?? null,
  );
  const [allowedKm, setAllowedKm] = useState<number | null>(null);
  const [excessKmPriceCents, setExcessKmPriceCents] = useState<number | null>(null);
  const [feesCents, setFeesCents] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [force, setForce] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vehicle = data.vehicles.find((candidate) => candidate.id === vehicleId) ?? null;
  const tenant = data.tenants.find((candidate) => candidate.id === tenantId) ?? null;

  /**
   * Conditions telles qu'elles seront enregistrées. Construites ici, avant l'écriture,
   * pour que l'aperçu de l'échéancier et le contrôle du dossier portent **sur les mêmes
   * valeurs** que celles qui seront en base — un aperçu calculé à part finirait par mentir.
   */
  const draft = useMemo(
    () => ({
      startDate: startDate ?? today,
      endDate: openEnded ? null : endDate,
      openEnded,
      frequency,
      intervalDays: frequency === 'personnalisee' ? intervalDays : null,
      dueWeekday:
        frequency === 'hebdomadaire' || frequency === 'bimensuel' ? dueWeekday : null,
      dueDayOfMonth: frequency === 'mensuel' ? dueDayOfMonth : null,
    }),
    [startDate, openEnded, endDate, frequency, intervalDays, dueWeekday, dueDayOfMonth, today],
  );

  /** Horizon de l'aperçu : la date de fin, ou douze mois pour une location sans terme. */
  const horizon = draft.endDate ?? openEndedHorizon(draft.startDate, 12);

  const dueDates = useMemo(
    () =>
      scheduleDueDates({
        ...draft,
        until: horizon,
        // L'aperçu n'a pas besoin de l'échéancier complet : on borne le calcul.
        maxOccurrences: 400,
      }),
    [draft, horizon],
  );

  const previewDates = dueDates.slice(0, PREVIEW_COUNT);
  const previewTotal = rentAmountCents === null ? null : rentAmountCents * dueDates.length;

  const eligibility = useMemo(() => {
    if (tenant === null) return null;
    const requirements = data.settings.requiredDocumentTypeIds
      .map((typeId) => data.documentTypes.find((type) => type.id === typeId))
      .filter((type): type is NonNullable<typeof type> => type !== undefined)
      .map((type) => ({ typeId: type.id, label: type.label }));

    return checkRentalEligibility({
      requirements,
      documents: data.tenantDocuments
        .filter((document) => document.tenantId === tenant.id)
        .map((document) => ({
          id: document.id,
          typeId: document.typeId,
          expiryDate: document.expiryDate,
        })),
      today,
      warningDays: data.settings.documentWarningDays,
    });
  }, [data.documentTypes, data.settings, data.tenantDocuments, tenant, today]);

  const datesInvalid =
    !openEnded && endDate !== null && startDate !== null && endDate < startDate;
  const kmUsage =
    vehicle === null || startMileageKm === null
      ? null
      : rentalKmUsage(
          {
            startMileageKm,
            allowedKm,
            excessKmPriceCents: excessKmPriceCents ?? 0,
          },
          vehicle.currentMileageKm,
        );

  const blocked = eligibility !== null && !eligibility.satisfied && !force;
  /**
   * « Aucun véhicule louable » : tous sont vendus.
   *
   * La version précédente écrivait `every((v) => v.status !== 'vendu')` — soit **l'inverse**
   * de la question posée — et son nom ne correspondait pas à celui utilisé plus bas. Le
   * garde-fou n'aurait donc jamais affiché son écran, et un parc entièrement vendu aurait
   * laissé ouvrir un formulaire de location sans véhicule à choisir.
   *
   * Les véhicules archivés ne figurent pas dans la liste : « vendu » est le seul état qui
   * reste à écarter. Sur une liste vide, `every` rend `true`, ce qui est le comportement
   * voulu au premier lancement.
   */
  const noRentableVehicle = data.vehicles.every((candidate) => candidate.status === 'vendu');
  const canSave =
    repositories !== null &&
    vehicleId !== null &&
    tenantId !== null &&
    startDate !== null &&
    rentAmountCents !== null &&
    rentAmountCents > 0 &&
    !datesInvalid;

  function buildRental(id: string, timestamp: string, status: Rental['status']): Rental {
    return {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      vehicleId: vehicleId ?? '',
      tenantId: tenantId ?? '',
      startDate: draft.startDate,
      endDate: draft.endDate,
      openEnded: draft.openEnded,
      rentAmountCents: rentAmountCents ?? 0,
      frequency: draft.frequency,
      intervalDays: draft.intervalDays,
      dueWeekday: draft.dueWeekday,
      dueDayOfMonth: draft.dueDayOfMonth,
      depositCents: depositCents ?? 0,
      startMileageKm: startMileageKm ?? vehicle?.currentMileageKm ?? 0,
      endMileageKm: null,
      allowedKm,
      excessKmPriceCents: excessKmPriceCents ?? 0,
      feesCents: feesCents ?? 0,
      status,
      activatedAt: null,
      endedAt: null,
      depositOutcome: null,
      depositReturnedCents: 0,
      notes,
    };
  }

  /**
   * Crée la location. `activate` décide de la suite : contrat à préparer, ou mise en
   * service immédiate.
   */
  async function save(activateNow: boolean): Promise<void> {
    if (repositories === null || vehicleId === null || tenantId === null) return;

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      const id = newId();
      const rental = buildRental(id, timestamp, 'prevue');

      // Une location sur un véhicule déjà loué se verrait à l'écran suivant, mais mieux
      // vaut le dire avant : deux locations actives sur un même véhicule ne se rattrapent
      // pas après coup.
      const existingActive = data.rentals.find(
        (candidate) => candidate.vehicleId === vehicleId && candidate.status === 'active',
      );
      if (existingActive !== undefined) {
        setError(
          `Ce véhicule a déjà une location en cours depuis le ${formatFr(existingActive.startDate)}. Terminez-la d’abord.`,
        );
        setSaving(false);
        return;
      }

      await repositories.rentals.insert(rental);

      if (activateNow) {
        await repositories.rentals.activate({
          id,
          until: horizon,
          methodId: data.paymentMethods[0]?.id ?? null,
          now: timestamp,
        });
        await refresh();
        router.replace(`/location/${id}`);
        return;
      }

      await refresh();
      // Le contrat reprend les conditions qui viennent d'être enregistrées : c'est le
      // chemin décrit par l'application — véhicule, locataire, conditions, contrat,
      // signature, activation.
      router.replace(`/contrat/${id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  if (noRentableVehicle) {
    return (
      <Screen>
        <ScreenTitle title="Nouvelle location" />
        <Card>
          <EmptyState
            icon="car"
            title="Aucun véhicule louable"
            message="Tous vos véhicules sont vendus ou archivés. Ajoutez un véhicule disponible pour créer une location."
            action={
              <Button
                label="Ajouter un véhicule"
                onPress={() => router.replace('/ajout/vehicule')}
              />
            }
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <View>
          <Button
            label="Créer et préparer le contrat"
            onPress={() => void save(false)}
            loading={saving}
            disabled={!canSave}
            block
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label="Créer et activer sans contrat"
            variant="secondary"
            onPress={() => void save(true)}
            disabled={!canSave}
            block
          />
        </View>
      }
    >
      <ScreenTitle
        title="Nouvelle location"
        subtitle="Conditions, échéancier, contrat à signer"
      />

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
          const next = data.vehicles.find((candidate) => candidate.id === value);
          setStartMileageKm(next?.currentMileageKm ?? null);
        }}
      />

      {data.tenants.length === 0 ? (
        <Card style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="warning">
            Aucun locataire enregistré.
          </AppText>
          <View style={{ height: spacing.md }} />
          <Button
            label="Créer un locataire"
            variant="secondary"
            onPress={() => router.push('/ajout/locataire')}
          />
        </Card>
      ) : (
        <SelectField
          label="Locataire"
          required
          value={tenantId}
          options={data.tenants.map((candidate) => ({
            value: candidate.id,
            label: tenantName(data, candidate.id),
            hint: candidate.phone,
          }))}
          onChange={setTenantId}
        />
      )}

      {eligibility === null ? null : (
        <>
          <SectionHeader title="Dossier du locataire" />
          <Card
            sunken
            style={
              eligibility.satisfied
                ? { marginBottom: spacing.lg }
                : { marginBottom: spacing.lg, borderColor: colors.warning }
            }
          >
            {eligibility.items.length === 0 ? (
              <AppText variant="small" color="textMuted">
                Aucun type de document n’est exigé pour louer.
              </AppText>
            ) : (
              <>
                <AppText
                  variant="small"
                  color={eligibility.satisfied ? 'success' : 'warning'}
                >
                  {eligibility.satisfied
                    ? 'Dossier complet : tous les documents exigés sont présents et valides.'
                    : eligibility.message}
                </AppText>
                <View style={{ height: spacing.md }} />
                {eligibility.items.map((item) => (
                  <View
                    key={item.typeId}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}
                  >
                    <AppText variant="small" style={{ flex: 1 }}>
                      {item.label}
                    </AppText>
                    {item.expiryDate === null ? null : (
                      <AppText
                        variant="caption"
                        color="textFaint"
                        style={{ marginRight: spacing.sm }}
                      >
                        {formatFr(item.expiryDate)}
                      </AppText>
                    )}
                    <Badge {...DOCUMENT_STATUS_LABELS[item.status]} />
                  </View>
                ))}
                {eligibility.satisfied ? null : (
                  <>
                    <View style={{ height: spacing.sm }} />
                    <SwitchRow
                      label="Forcer la validation"
                      hint="La location sera créée malgré le dossier incomplet. C’est votre décision, et elle est assumée."
                      value={force}
                      onChange={setForce}
                    />
                  </>
                )}
              </>
            )}
          </Card>
        </>
      )}

      <SectionHeader title="Durée" />
      <DateField label="Début de la location" required value={startDate} onChange={setStartDate} />
      <Card style={{ marginBottom: spacing.lg }}>
        <SwitchRow
          label="Location sans date de fin"
          hint="L’échéancier est engendré sur douze mois et prolongé au fil de l’eau."
          value={openEnded}
          onChange={setOpenEnded}
        />
      </Card>
      {openEnded ? null : (
        <DateField
          label="Fin de la location"
          required
          value={endDate}
          onChange={setEndDate}
          error={datesInvalid ? 'Antérieure au début.' : null}
        />
      )}

      <SectionHeader title="Loyer" />
      <MoneyField
        label="Montant du loyer"
        required
        cents={rentAmountCents}
        onCents={setRentAmountCents}
        hint="Le montant d’une échéance, quelle que soit la fréquence."
      />
      <SelectField
        label="Fréquence"
        required
        value={frequency}
        options={PAYMENT_FREQUENCIES.map((value) => ({
          value,
          label: FREQUENCY_LABELS[value],
          hint: stepDays(value, intervalDays) === null ? undefined : `tous les ${stepDays(value, intervalDays)} jours`,
        }))}
        onChange={(value) => {
          setFrequency(value);
          setDueWeekday(null);
          setDueDayOfMonth(null);
        }}
      />

      {frequency === 'hebdomadaire' || frequency === 'bimensuel' ? (
        <SelectField
          label="Jour d’échéance"
          value={dueWeekday === null ? '' : String(dueWeekday)}
          options={[
            { value: '', label: 'À partir du début' },
            ...Array.from({ length: 7 }, (_, index) => ({
              value: String(index + 1),
              label: weekdayLabelFr(index + 1),
            })),
          ]}
          onChange={(value) => setDueWeekday(value === '' ? null : Number(value))}
          grid
          hint="Une location démarrée un mercredi avec une échéance le lundi voit sa première échéance le lundi suivant."
        />
      ) : null}

      {frequency === 'mensuel' ? (
        <NumberField
          label="Jour du mois"
          value={dueDayOfMonth}
          onChange={setDueDayOfMonth}
          suffix=""
          hint="Entre 1 et 31. Un mois trop court est ramené à son dernier jour."
        />
      ) : null}

      {frequency === 'personnalisee' ? (
        <NumberField
          label="Intervalle entre deux échéances"
          required
          value={intervalDays}
          onChange={setIntervalDays}
          suffix="jours"
        />
      ) : null}

      <SectionHeader title="Aperçu de l’échéancier" />
      <Card>
        <AppText variant="small" color="textMuted">
          {`${scheduleLabel(draft)} — ${dueDates.length} échéance${dueDates.length > 1 ? 's' : ''} jusqu’au ${formatFr(horizon)}`}
        </AppText>
        <View style={{ height: spacing.md }} />
        {dueDates.length === 0 ? (
          <AppText variant="small" color="danger">
            Aucune échéance ne tombe dans cet intervalle. Vérifiez les dates et la fréquence.
          </AppText>
        ) : (
          <>
            {previewDates.map((date) => (
              <View
                key={date}
                style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}
              >
                <AppText variant="small" color="textMuted">
                  {formatFr(date)}
                </AppText>
                <AppText variant="small" tabular>
                  {rentAmountCents === null ? '—' : formatMoney(rentAmountCents)}
                </AppText>
              </View>
            ))}
            {dueDates.length > previewDates.length ? (
              <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.xs }}>
                {`… et ${dueDates.length - previewDates.length} autres jusqu’au ${formatFr(horizon)}`}
              </AppText>
            ) : null}
            {previewTotal === null ? null : (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  marginTop: spacing.md,
                  paddingTop: spacing.md,
                  borderTopWidth: 1,
                  borderTopColor: colors.separator,
                }}
              >
                <AppText variant="label" color="textMuted">
                  Total facturé
                </AppText>
                <AppText variant="title" tabular>
                  {formatMoney(previewTotal)}
                </AppText>
              </View>
            )}
          </>
        )}
      </Card>

      <SectionHeader title="Caution et kilométrage" />
      <MoneyField
        label="Dépôt de garantie"
        cents={depositCents}
        onCents={setDepositCents}
        hint="Restitué à la fin, déduction faite des dommages et impayés."
      />
      <NumberField
        label="Kilométrage au départ"
        required
        value={startMileageKm}
        onChange={setStartMileageKm}
        suffix="km"
        hint={
          vehicle === null
            ? undefined
            : `Compteur actuel du véhicule : ${formatKm(vehicle.currentMileageKm)}`
        }
      />
      <NumberField
        label="Kilométrage autorisé"
        value={allowedKm}
        onChange={setAllowedKm}
        suffix="km"
        hint="Laisser vide pour un kilométrage illimité."
      />
      <MoneyField
        label="Prix du kilomètre supplémentaire"
        cents={excessKmPriceCents}
        onCents={setExcessKmPriceCents}
        hint="Facturé au-delà du kilométrage autorisé."
      />
      <MoneyField
        label="Frais annexes"
        cents={feesCents}
        onCents={setFeesCents}
        hint="Mise à disposition, nettoyage, préparation."
      />

      {kmUsage === null || allowedKm === null ? null : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {`Le véhicule a déjà parcouru ${formatKm(kmUsage.drivenKm)} depuis le compteur de départ. Il reste ${formatKm(kmUsage.remainingKm ?? 0)} sur l’enveloppe autorisée.`}
          </AppText>
        </Card>
      )}

      <SectionHeader title="Notes" />
      <TextField
        label="Observations"
        value={notes}
        onChange={setNotes}
        multiline
        placeholder="Accord particulier, accessoires prêtés, conditions spécifiques…"
      />

      {blocked ? (
        <Card sunken style={{ marginBottom: spacing.lg, borderColor: colors.warning }}>
          <AppText variant="small" color="warning">
            Le dossier du locataire est incomplet. Activez « Forcer la validation » ci-dessus
            pour créer la location malgré tout, ou complétez les documents depuis sa fiche.
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

      <AppText variant="caption" color="textFaint">
        Enregistrer crée la location à l’état « prévue » et ouvre la préparation du contrat.
        Le véhicule n’est marqué « loué » qu’à l’activation, après la signature.
      </AppText>
    </Screen>
  );
}
