/**
 * Lignes de liste partagées.
 *
 * ## Pourquoi ici plutôt que dans chaque écran
 *
 * Une échéance de loyer apparaît sur la fiche du véhicule, sur celle du locataire, dans la
 * location, dans l'onglet Finances et dans la recherche. Écrire cinq fois la même ligne,
 * c'est écrire cinq fois la même règle d'affichage — et la cinquième finira par montrer le
 * montant attendu là où les autres montrent le reste dû. Ces composants sont la règle.
 *
 * ## Ce que montre le montant
 *
 * Le nombre affiché n'a pas le même sens selon l'état, et c'est voulu : « reste dû » pour
 * une échéance ouverte, « reçu » pour une échéance soldée. La pastille d'état lève
 * l'ambiguïté, et les deux se lisent ensemble. Afficher « 300 € » sans dire s'il s'agit de
 * ce qui est dû ou de ce qui est rentré serait le meilleur moyen de se tromper.
 */

import type { ReactElement } from 'react';

import {
  DAMAGE_TYPE_LABELS,
  DOCUMENT_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  SOURCE_LABELS,
  VEHICLE_STATUS_LABELS,
} from '@/domain/catalog';
import { formatFr } from '@/domain/dates';
import { documentValidity } from '@/domain/documents';
import type { IconName } from '@/domain/iconNames';
import { formatKm, formatMoney } from '@/domain/money';
import { effectivePaymentStatus, paymentBalance } from '@/domain/rental';
import type {
  Damage,
  Insurance,
  MaintenanceRecord,
  MileageRecord,
  Payment,
  VehicleStatus,
} from '@/domain/types';
import { Badge, ListRow } from './components/base';

/** Pastille d'état d'une échéance, calculée depuis les montants et la date. */
export function PaymentLine({
  payment,
  today,
  title,
  subtitle,
  onPress,
}: {
  payment: Payment;
  today: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
}): ReactElement {
  const status = effectivePaymentStatus(payment, today);
  const balance = paymentBalance(payment);

  // Une échéance ouverte affiche ce qu'il reste à recevoir ; une échéance soldée affiche ce
  // qui a été reçu. Dans les deux cas la pastille dit lequel des deux on lit.
  const amount = balance.remainingCents > 0 ? balance.remainingCents : payment.receivedCents;

  return (
    <ListRow
      title={title}
      subtitle={subtitle ?? `Échéance du ${formatFr(payment.dueDate)}`}
      value={formatMoney(amount, { currency: '' }).trim()}
      badge={PAYMENT_STATUS_LABELS[status]}
      icon="wallet"
      iconTone={PAYMENT_STATUS_LABELS[status].tone}
      chevron={onPress !== undefined}
      onPress={onPress}
    />
  );
}

/** Pastille d'échéance d'un document : valide, expire bientôt, expiré. */
export function ExpiryBadge({
  expiryDate,
  today,
  warningDays,
  hasExpiry = true,
}: {
  expiryDate: string | null;
  today: string;
  warningDays: number;
  hasExpiry?: boolean;
}): ReactElement {
  const validity = documentValidity(hasExpiry ? expiryDate : null, today, warningDays);
  return <Badge {...DOCUMENT_STATUS_LABELS[validity.status]} />;
}

export function DocumentLine({
  label,
  number,
  expiryDate,
  today,
  warningDays,
  hasExpiry = true,
  onPress,
  icon = 'file-text',
}: {
  label: string;
  number: string;
  expiryDate: string | null;
  today: string;
  warningDays: number;
  hasExpiry?: boolean;
  onPress?: () => void;
  icon?: IconName;
}): ReactElement {
  const validity = documentValidity(hasExpiry ? expiryDate : null, today, warningDays);
  const parts = [number];
  if (expiryDate !== null) parts.push(`jusqu’au ${formatFr(expiryDate)}`);
  if (
    validity.daysRemaining !== null &&
    validity.daysRemaining >= 0 &&
    validity.daysRemaining <= warningDays
  ) {
    parts.push(`dans ${validity.daysRemaining} j`);
  }

  return (
    <ListRow
      title={label}
      subtitle={parts.filter((part) => part !== '').join(' · ')}
      badge={DOCUMENT_STATUS_LABELS[validity.status]}
      icon={icon}
      iconTone={DOCUMENT_STATUS_LABELS[validity.status].tone}
      chevron={onPress !== undefined}
      onPress={onPress}
    />
  );
}

export function InsuranceLine({
  insurance,
  vehicleLabel,
  today,
  warningDays,
  onPress,
}: {
  insurance: Insurance;
  vehicleLabel: string;
  today: string;
  warningDays: number;
  onPress?: () => void;
}): ReactElement {
  const validity = documentValidity(insurance.endDate, today, warningDays);
  return (
    <ListRow
      title={insurance.company.trim() === '' ? 'Assurance' : insurance.company}
      subtitle={[
        vehicleLabel,
        insurance.contractNumber,
        insurance.endDate === null ? '' : `échéance le ${formatFr(insurance.endDate)}`,
      ]
        .filter((part) => part !== '')
        .join(' · ')}
      value={formatMoney(insurance.amountCents, { currency: '' }).trim()}
      badge={DOCUMENT_STATUS_LABELS[validity.status]}
      icon="shield"
      iconTone={DOCUMENT_STATUS_LABELS[validity.status].tone}
      chevron={onPress !== undefined}
      onPress={onPress}
    />
  );
}

export function MaintenanceRecordLine({
  record,
  typeLabel,
  onPress,
}: {
  record: MaintenanceRecord;
  typeLabel: string;
  onPress?: () => void;
}): ReactElement {
  return (
    <ListRow
      title={typeLabel}
      subtitle={[formatFr(record.date), formatKm(record.mileageKm), record.supplier]
        .filter((part) => part !== '')
        .join(' · ')}
      value={formatMoney(record.amountCents, { currency: '' }).trim()}
      icon="wrench"
      iconTone="warn"
      chevron={onPress !== undefined}
      onPress={onPress}
    />
  );
}

export function MileageLine({
  record,
  deltaKm,
}: {
  record: MileageRecord;
  /** Écart avec le relevé précédent. `null` pour le plus ancien. */
  deltaKm: number | null;
}): ReactElement {
  return (
    <ListRow
      title={formatKm(record.km)}
      subtitle={[formatFr(record.date), SOURCE_LABELS[record.source] ?? record.source, record.comment]
        .filter((part) => part !== '')
        .join(' · ')}
      value={deltaKm === null ? undefined : `+${formatKm(deltaKm)}`}
      valueColor="textMuted"
      icon="gauge"
    />
  );
}

export function DamageLine({
  damage,
  onPress,
}: {
  damage: Damage;
  onPress?: () => void;
}): ReactElement {
  const label = DAMAGE_TYPE_LABELS[damage.type] ?? damage.type;
  const cost = damage.actualCostCents > 0 ? damage.actualCostCents : damage.estimatedCostCents;
  return (
    <ListRow
      title={damage.zone.trim() === '' ? label : `${label} — ${damage.zone}`}
      subtitle={[formatFr(damage.date), damage.repaired ? 'réparé' : 'à réparer', damage.comment]
        .filter((part) => part !== '')
        .join(' · ')}
      value={cost === 0 ? undefined : formatMoney(cost, { currency: '' }).trim()}
      valueColor={damage.repaired ? 'textMuted' : 'danger'}
      badge={damage.repaired ? { label: 'Réparé', tone: 'ok' } : { label: 'En attente', tone: 'danger' }}
      icon="alert-triangle"
      iconTone={damage.repaired ? 'ok' : 'danger'}
      chevron={onPress !== undefined}
      onPress={onPress}
    />
  );
}

/** Badge d'état d'un véhicule, pour éviter d'importer le catalogue partout. */
export function VehicleStatusBadge({ status }: { status: VehicleStatus }): ReactElement {
  return <Badge {...VEHICLE_STATUS_LABELS[status]} />;
}
