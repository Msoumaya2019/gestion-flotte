/**
 * Encaisser un loyer.
 *
 * ## Le cas partiel est le cas normal
 *
 * Un locataire qui donne 250 € sur 300 € n'est pas une exception, c'est un mardi. Le
 * formulaire part donc du **montant attendu** et laisse le champ « reçu » à modifier : le
 * reste dû se met à jour sous les yeux, et l'échéance n'est pas marquée soldée tant qu'il
 * reste quelque chose.
 *
 * ## Le payeur n'est pas le locataire
 *
 * Un loyer peut être versé par une société, par un proche, ou par un tiers. Le champ
 * « payeur » est donc explicite et jamais pré-rempli par le locataire : supposer que celui
 * qui paie est celui qui loue rendrait impossible le suivi des locations en société.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PAYER_TYPE_LABELS } from '@/domain/catalog';
import { formatFr, todayIso } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { paymentBalance } from '@/domain/rental';
import { PAYER_TYPES, type PayerType } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import {
  Badge,
  Card,
  EmptyState,
  ListRow,
  Screen,
  ScreenTitle,
  SectionHeader,
} from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { DateField, MoneyField, SelectField, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

export default function PaymentFormScreen(): ReactElement {
  const { data, repositories, refresh, now } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ paymentId?: string; rentalId?: string }>();
  const today = todayIso();

  const [paymentId, setPaymentId] = useState<string | null>(params.paymentId ?? null);
  const [receivedCents, setReceivedCents] = useState<number | null>(null);
  const [paidDate, setPaidDate] = useState<string | null>(today);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [payerType, setPayerType] = useState<PayerType>('locataire');
  const [payerName, setPayerName] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payment = useMemo(
    () => data.payments.find((candidate) => candidate.id === paymentId) ?? null,
    [data.payments, paymentId],
  );

  /** Échéances ouvertes, de la plus ancienne à la plus récente. */
  const openPayments = useMemo(() => {
    return data.payments
      .filter((candidate) => candidate.status !== 'annule')
      .filter((candidate) => {
        const rental = data.rentals.find((item) => item.id === candidate.rentalId);
        return rental !== undefined && rental.status !== 'annulee';
      })
      .map((candidate) => ({ payment: candidate, balance: paymentBalance(candidate) }))
      .filter((entry) => entry.balance.remainingCents > 0)
      .sort((a, b) => a.payment.dueDate.localeCompare(b.payment.dueDate));
  }, [data.payments, data.rentals]);

  const balance = payment === null ? null : paymentBalance(payment);
  const amount = receivedCents ?? balance?.remainingCents ?? null;

  async function save(): Promise<void> {
    if (repositories === null || payment === null || amount === null) return;
    setSaving(true);
    setError(null);
    try {
      // Le montant saisi **remplace** ce qui a été reçu, il ne s'y ajoute pas : c'est ce
      // qu'on attend d'un champ « reçu », et additionner obligerait à calculer mentalement
      // ce qui est déjà encaissé pour corriger une erreur de saisie.
      await repositories.payments.recordPayment({
        id: payment.id,
        receivedCents: amount,
        paidDate: amount > 0 ? paidDate : null,
        methodId,
        payerType,
        payerName,
        comment,
        now: now(),
      });
      await refresh();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  // -------------------------------------------------------------------------
  // Choix de l'échéance
  // -------------------------------------------------------------------------
  if (payment === null) {
    return (
      <Screen>
        <ScreenTitle title="Loyer reçu" subtitle="Choisissez l’échéance encaissée" />
        {openPayments.length === 0 ? (
          <Card>
            <EmptyState
              icon="check-circle"
              title="Tout est encaissé"
              message="Aucune échéance en attente sur les locations en cours."
            />
          </Card>
        ) : (
          <Card padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {openPayments.map((entry, index) => (
              <View key={entry.payment.id}>
                {index > 0 ? (
                  <View style={[styles.separator, { backgroundColor: colors.separator }]} />
                ) : null}
                <ListRow
                  title={tenantName(data, entry.payment.tenantId)}
                  subtitle={`${formatFr(entry.payment.dueDate)} · ${vehicleName(data, entry.payment.vehicleId)}`}
                  value={formatMoney(entry.balance.remainingCents, { currency: '' }).trim()}
                  badge={
                    entry.payment.dueDate < today
                      ? { label: 'En retard', tone: 'danger' }
                      : { label: 'À venir', tone: 'neutral' }
                  }
                  chevron
                  onPress={() => {
                    setPaymentId(entry.payment.id);
                    setReceivedCents(null);
                  }}
                />
              </View>
            ))}
          </Card>
        )}
      </Screen>
    );
  }

  const rental = data.rentals.find((candidate) => candidate.id === payment.rentalId);
  const remainingAfter = amount === null ? 0 : Math.max(0, payment.expectedCents - amount);

  return (
    <Screen
      footer={
        <Button
          label={amount === null || amount === 0 ? 'Enregistrer' : `Encaisser ${formatMoney(amount)}`}
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null || amount === null}
          block
        />
      }
    >
      <ScreenTitle title="Loyer reçu" subtitle={`${tenantName(data, payment.tenantId)} · ${vehicleName(data, payment.vehicleId)}`} />

      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.summaryRow}>
          <Summary label="Attendu" value={formatMoney(payment.expectedCents)} />
          <Summary label="Déjà reçu" value={formatMoney(payment.receivedCents)} />
          <Summary
            label="Reste dû"
            value={formatMoney(balance?.remainingCents ?? 0)}
            tone={(balance?.remainingCents ?? 0) > 0 ? 'danger' : 'success'}
          />
        </View>
        <View style={[styles.summaryFooter, { borderTopColor: colors.separator }]}>
          <AppText variant="caption" color="textMuted">
            {`Échéance du ${formatFr(payment.dueDate)}`}
            {rental === undefined
              ? ''
              : ` · ${formatMoney(rental.rentAmountCents)} ${rental.frequency === 'mensuel' ? 'par mois' : ''}`}
          </AppText>
          {payment.dueDate < today && (balance?.remainingCents ?? 0) > 0 ? (
            <Badge label="En retard" tone="danger" />
          ) : null}
        </View>
      </Card>

      <MoneyField
        label="Montant reçu"
        cents={amount}
        onCents={setReceivedCents}
        hint="Modifiez le montant pour un encaissement partiel."
      />

      {amount !== null && remainingAfter > 0 ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="warning">
            {`Encaissement partiel : ${formatMoney(remainingAfter)} resteront à payer.`}
          </AppText>
        </Card>
      ) : null}

      <DateField label="Date du paiement" value={paidDate} onChange={setPaidDate} />

      <SelectField
        label="Mode de paiement"
        value={methodId}
        options={[
          { value: '', label: 'Non précisé' },
          ...data.paymentMethods.map((method) => ({ value: method.id, label: method.label })),
        ]}
        onChange={(value) => setMethodId(value === '' ? null : value)}
        grid
      />

      <SelectField
        label="Qui a payé ?"
        value={payerType}
        options={PAYER_TYPES.map((type) => ({ value: type, label: PAYER_TYPE_LABELS[type] ?? type }))}
        onChange={setPayerType}
        grid
        hint="Le payeur n’est pas forcément le locataire : société, proche, tiers."
      />

      {payerType === 'locataire' ? null : (
        <TextField
          label="Nom du payeur"
          value={payerName}
          onChange={setPayerName}
          placeholder="Nom de la société ou de la personne"
          autoCapitalize="words"
        />
      )}

      <TextField
        label="Commentaire"
        value={comment}
        onChange={setComment}
        placeholder="Numéro de chèque, référence de virement…"
        multiline
      />

      {error === null ? null : (
        <Card sunken style={{ marginTop: spacing.md }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}

      <SectionHeader title="Autre échéance" />
      <Button
        label="Choisir une autre échéance"
        variant="secondary"
        block
        onPress={() => {
          setPaymentId(null);
          setReceivedCents(null);
        }}
      />
    </Screen>
  );
}

function Summary({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}): ReactElement {
  const { colors } = useTheme();
  const color =
    tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : colors.text;
  return (
    <View style={{ flex: 1 }}>
      <AppText variant="caption" color="textFaint">
        {label}
      </AppText>
      <AppText variant="title" tabular style={{ color, marginTop: 2 }} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  separator: { height: StyleSheet.hairlineWidth },
  summaryRow: { flexDirection: 'row' },
  summaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
