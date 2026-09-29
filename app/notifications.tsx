/**
 * Rappels — ce qui va sonner, et ce qui devrait déjà l'être.
 *
 * ## Pourquoi l'écran recalcule au lieu de lire la base
 *
 * La table `notifications` contient ce qui a été **confié au système**. L'écran, lui,
 * recalcule le plan depuis les données à chaque affichage. C'est volontaire : un rappel
 * dont la date est passée pendant que l'application était fermée n'a jamais été reposé, et
 * lire la table montrerait une liste qui ne correspond plus à la réalité. Le plan recalculé
 * est la seule source qui ne mente pas.
 *
 * ## Deux listes, pas une
 *
 * « À traiter » rassemble ce qui est déjà dû — l'échéance est aujourd'hui ou dépassée. Le
 * reste est à venir. Mélanger les deux obligerait à lire les dates une par une pour savoir
 * ce qui presse, ce qui est exactement le travail qu'un écran de rappels doit épargner.
 *
 * ## Tout est local
 *
 * Aucun serveur de notification n'est joint : les rappels sont programmés par le système
 * sur l'appareil. Rien n'indique à l'extérieur qu'un loyer est en retard.
 */

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { NOTIFICATION_KIND_LABELS } from '@/domain/catalog';
import { formatDateTimeFr, formatFr } from '@/domain/dates';
import { dueReminders, planNotifications, summarizePlan } from '@/domain/notifications';
import { useApp } from '@/state/app-context';
import { notificationPlanInput } from '@/state/use-derived';
import {
  clearNotifications,
  notificationPermissionGranted,
  pendingSystemNotifications,
  syncNotifications,
  type SyncResult,
} from '@/services/notifications';
import { AppText } from '@/ui/components/text';
import { Badge, Card, DetailTitle, EmptyState, KeyValue, Screen, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

export default function NotificationsScreen(): ReactElement {
  const { data, repositories, refresh, today } = useApp();
  const { colors } = useTheme();
  const router = useRouter();

  const todayDate = today();

  const [permission, setPermission] = useState<boolean | null>(null);
  const [systemCount, setSystemCount] = useState<number | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Le plan est recalculé depuis les données, pas lu depuis la table.
   *
   * `notificationPlanInput` est le point d'entrée partagé : le même objet nourrit l'écran
   * et la reprogrammation, ce qui garantit que la liste affichée est celle qui sonnera.
   */
  const plan = useMemo(
    () => planNotifications(notificationPlanInput(data, todayDate)),
    [data, todayDate],
  );

  const due = useMemo(() => dueReminders(plan), [plan]);
  const upcoming = useMemo(
    () => plan.filter((draft) => !due.includes(draft)),
    [plan, due],
  );
  const summary = useMemo(() => summarizePlan(plan), [plan]);

  const refreshSystemState = useCallback(async (): Promise<void> => {
    const [granted, pending] = await Promise.all([
      notificationPermissionGranted(),
      pendingSystemNotifications(),
    ]);
    setPermission(granted);
    setSystemCount(pending);
  }, []);

  useEffect(() => {
    void refreshSystemState();
  }, [refreshSystemState]);

  async function reschedule(): Promise<void> {
    if (repositories === null) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await syncNotifications(repositories, notificationPlanInput(data, todayDate));
      setResult(outcome);
      await refreshSystemState();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function clearAll(): Promise<void> {
    if (repositories === null) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      await clearNotifications(repositories);
      await refreshSystemState();
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      footer={
        <Button
          label="Reprogrammer tous les rappels"
          icon="bell"
          block
          loading={busy}
          disabled={repositories === null}
          onPress={() => void reschedule()}
        />
      }
    >
      <DetailTitle
        title="Rappels"
        subtitle={`${summary.total} rappel${summary.total > 1 ? 's' : ''} planifié${summary.total > 1 ? 's' : ''}`}
        onBack={() => router.back()}
      />

      {/* ------------------------------------------------------------------ */}
      {/* État du système                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Card style={{ marginBottom: spacing.lg }}>
        {permission === null ? (
          <AppText variant="small" color="textMuted">
            Vérification de l’autorisation…
          </AppText>
        ) : permission ? (
          <AppText variant="small" color="success">
            Les notifications sont autorisées.
          </AppText>
        ) : (
          <AppText variant="small" color="warning">
            Les notifications ne sont pas autorisées. Aucun rappel ne sonnera tant que vous
            ne les aurez pas activées dans les réglages du système.
          </AppText>
        )}
        <View style={{ height: spacing.sm }} />
        <KeyValue
          label="Rappels posés sur l’appareil"
          value={systemCount === null ? '—' : String(systemCount)}
        />
        <KeyValue label="Rappels calculés" value={String(summary.total)} />
        <View style={{ height: spacing.sm }} />
        <AppText variant="caption" color="textFaint">
          Le système plafonne le nombre de rappels simultanés. Au-delà, les plus lointains
          sont écartés : reprogrammer après chaque saisie les remet à jour.
        </AppText>
        {systemCount !== null && systemCount < summary.total && permission === true ? (
          <>
            <View style={{ height: spacing.sm }} />
            <AppText variant="caption" color="warning">
              {`${summary.total - systemCount} rappel${summary.total - systemCount > 1 ? 's' : ''} calculé${summary.total - systemCount > 1 ? 's' : ''} n’${summary.total - systemCount > 1 ? 'ont' : 'a'} pas été posé${summary.total - systemCount > 1 ? 's' : ''}. Lancez une reprogrammation.`}
            </AppText>
          </>
        ) : null}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Résultat de la dernière reprogrammation                             */}
      {/* ------------------------------------------------------------------ */}
      {result === null ? null : (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color={result.permissionGranted ? 'success' : 'warning'}>
            {result.permissionGranted
              ? `${result.scheduled} rappel${result.scheduled > 1 ? 's' : ''} posé${result.scheduled > 1 ? 's' : ''} sur ${result.planned}.`
              : 'Aucun rappel posé : l’autorisation manque.'}
          </AppText>
          {result.skipped > 0 ? (
            <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.xs }}>
              {`${result.skipped} écarté${result.skipped > 1 ? 's' : ''} par le plafond du système.`}
            </AppText>
          ) : null}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* À traiter                                                           */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title={`À traiter (${due.length})`} icon="alert-circle" />
      {due.length === 0 ? (
        <Card>
          <EmptyState
            icon="check-circle"
            title="Rien à traiter"
            message="Aucune échéance n’est due aujourd’hui ni en retard."
          />
        </Card>
      ) : (
        <Card padded={false}>
          {due.map((draft) => (
            <View key={`${draft.kind}:${draft.relatedId ?? ''}:${draft.fireDate}`} style={[styles.row, { borderColor: colors.border }]}>
              <View style={styles.rowHeader}>
                <Badge {...NOTIFICATION_KIND_LABELS[draft.kind]} />
                <AppText variant="caption" color="textFaint" style={{ marginLeft: spacing.sm }}>
                  {draft.fireDate.slice(0, 10) <= todayDate
                    ? `Échéance du ${formatFr(draft.fireDate.slice(0, 10))}`
                    : formatDateTimeFr(draft.fireDate)}
                </AppText>
              </View>
              <AppText variant="body" style={{ marginTop: spacing.xs }}>
                {draft.title}
              </AppText>
              <AppText variant="small" color="textMuted" style={{ marginTop: 2 }}>
                {draft.body}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* À venir                                                             */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title={`À venir (${upcoming.length})`} icon="bell" />
      {upcoming.length === 0 ? (
        <Card>
          <AppText variant="small" color="textMuted">
            Aucun rappel à venir. Ajoutez une assurance, un contrôle technique ou une
            échéance de loyer, et ils apparaîtront ici.
          </AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {upcoming.map((draft) => (
            <View key={`${draft.kind}:${draft.relatedId ?? ''}:${draft.fireDate}`} style={[styles.row, { borderColor: colors.border }]}>
              <View style={styles.rowHeader}>
                <Badge {...NOTIFICATION_KIND_LABELS[draft.kind]} />
                <AppText variant="caption" color="textFaint" style={{ marginLeft: spacing.sm }}>
                  {formatDateTimeFr(draft.fireDate)}
                </AppText>
              </View>
              <AppText variant="body" style={{ marginTop: spacing.xs }}>
                {draft.title}
              </AppText>
              <AppText variant="small" color="textMuted" style={{ marginTop: 2 }}>
                {draft.body}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Répartition                                                         */}
      {/* ------------------------------------------------------------------ */}
      {summary.total === 0 ? null : (
        <>
          <SectionHeader title="Répartition" />
          <Card>
            {[...summary.byKind.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([kind, count]) => (
                <KeyValue
                  key={kind}
                  label={NOTIFICATION_KIND_LABELS[kind].label}
                  value={String(count)}
                />
              ))}
          </Card>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Réglages et arrêt                                                  */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Réglages" />
      <Card>
        <AppText variant="small" color="textMuted">
          Les seuils de rappel — délais avant expiration d’un document, seuils d’entretien —
          se règlent avec le reste des paramètres.
        </AppText>
        <View style={{ height: spacing.md }} />
        <Button
          label="Ouvrir les réglages"
          variant="secondary"
          icon="settings"
          block
          onPress={() => router.push('/parametres')}
        />
        <View style={{ height: spacing.sm }} />
        <Button
          label="Retirer tous les rappels"
          variant="ghost"
          icon="x-circle"
          block
          loading={busy}
          disabled={repositories === null || (systemCount ?? 0) === 0}
          onPress={() => void clearAll()}
        />
        <View style={{ height: spacing.sm }} />
        <AppText variant="caption" color="textFaint">
          Retirer les rappels n’efface aucune donnée : ils se recalculent depuis les
          échéances dès la prochaine reprogrammation.
        </AppText>
      </Card>

      {error === null ? null : (
        <Card sunken style={{ marginTop: spacing.lg, borderColor: colors.danger }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center' },
});
