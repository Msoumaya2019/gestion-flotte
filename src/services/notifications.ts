/**
 * Rappels : traduction d'un plan déjà décidé en notifications locales.
 *
 * ## Pourquoi « locales » et pas « push »
 *
 * Une notification poussée suppose un serveur, donc un compte, donc une fuite possible de
 * qui loue quoi. Ici, tout est calculé sur l'appareil et remis au système : aucune donnée
 * ne sort. Le prix à payer est qu'un rappel ne peut pas arriver sur un appareil éteint —
 * ce qui, pour un loyer attendu le 5, est sans conséquence.
 *
 * ## La replanification est totale
 *
 * On annule tout puis on repose. Le plan est déjà déterministe (voir `domain/notifications`),
 * donc l'ensemble obtenu est identique à ce qu'il serait après un diff — mais sans avoir à
 * tenir la comptabilité des rappels devenus caducs. C'est la seule façon de garantir qu'un
 * loyer encaissé cesse d'être réclamé.
 *
 * ## Le piège de l'annulation
 *
 * `cancelAllScheduledNotificationsAsync` annule **tout**, y compris ce qui aurait été posé
 * par une autre partie de l'application. Ici c'est acceptable — cette application n'a
 * qu'une source de rappels — mais cela doit rester vrai : le jour où un rappel serait posé
 * ailleurs, il faudrait passer à une annulation ciblée par identifiant.
 */

import * as Notifications from 'expo-notifications';
import type { Repositories } from '@/data/repositories';
import { planNotifications, type NotificationDraft, type NotificationPlanInput } from '@/domain/notifications';
import type { ScheduledNotification } from '@/domain/types';

/** Identifiant du canal Android. Sans canal, Android 8+ refuse silencieusement la notification. */
export const REMINDER_CHANNEL_ID = 'rappels';

/** Combien de rappels on accepte de poser. iOS plafonne à 64 notifications en attente. */
export const MAX_SCHEDULED = 60;

/**
 * Affichage des rappels quand l'application est au premier plan.
 *
 * Sans gestionnaire, iOS n'affiche rien pour une notification reçue application ouverte :
 * le rappel serait silencieusement perdu au moment précis où l'utilisateur s'en sert.
 */
export function installNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Crée le canal Android. Sans effet sur iOS. */
export async function ensureAndroidChannel(): Promise<void> {
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Rappels',
    importance: Notifications.AndroidImportance.DEFAULT,
    description: 'Loyers, échéances de documents, entretiens à prévoir.',
  });
}

export interface PermissionOutcome {
  granted: boolean;
  /** Vrai si la demande a été refusée alors qu'elle n'avait jamais été posée. */
  canAskAgain: boolean;
}

/** Demande l'autorisation, en ne la redemandant pas si elle est déjà accordée. */
export async function requestNotificationPermission(): Promise<PermissionOutcome> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return { granted: true, canAskAgain: current.canAskAgain };
  if (!current.canAskAgain) return { granted: false, canAskAgain: false };

  const asked = await Notifications.requestPermissionsAsync();
  return { granted: asked.granted, canAskAgain: asked.canAskAgain };
}

/** Autorisation déjà accordée ? Ne demande rien. */
export async function notificationPermissionGranted(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  return current.granted;
}

export interface SyncResult {
  planned: number;
  scheduled: number;
  /** Rappels écartés parce qu'ils dépassaient le plafond système. */
  skipped: number;
  permissionGranted: boolean;
}

/**
 * Recalcule et repose l'ensemble des rappels.
 *
 * L'écriture en base a lieu **après** la pose système : si le système refuse, la base ne
 * prétend pas qu'un rappel existe.
 */
export async function syncNotifications(
  repositories: Repositories,
  input: NotificationPlanInput,
  now: Date = new Date(),
): Promise<SyncResult> {
  const permission = await notificationPermissionGranted();
  const plan = planNotifications(input, now);
  const retained = plan.slice(0, MAX_SCHEDULED);
  const skipped = plan.length - retained.length;

  await Notifications.cancelAllScheduledNotificationsAsync();

  if (!permission) {
    // Sans autorisation, aucun rappel ne sonnera : on vide la table plutôt que d'y laisser
    // des lignes qui feraient croire à l'utilisateur que quelque chose est programmé.
    await repositories.notifications.replaceAll([], now.toISOString());
    return { planned: plan.length, scheduled: 0, skipped, permissionGranted: false };
  }

  await ensureAndroidChannel();

  const rows: ScheduledNotification[] = [];
  let scheduled = 0;

  for (const draft of retained) {
    const systemId = await scheduleOne(draft);
    if (systemId === null) continue;
    scheduled += 1;
    const timestamp = now.toISOString();
    rows.push({
      id: `${draft.kind}:${draft.relatedType}:${draft.relatedId ?? 'aucun'}:${draft.fireDate}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      kind: draft.kind,
      title: draft.title,
      body: draft.body,
      systemId,
      fireDate: draft.fireDate,
      relatedType: draft.relatedType,
      relatedId: draft.relatedId,
      enabled: true,
    });
  }

  await repositories.notifications.replaceAll(rows, now.toISOString());
  return { planned: plan.length, scheduled, skipped, permissionGranted: true };
}

/** Pose un rappel. Rend `null` si le système le refuse, sans interrompre les suivants. */
async function scheduleOne(draft: NotificationDraft): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: draft.title,
        body: draft.body,
        data: { kind: draft.kind, relatedType: draft.relatedType, relatedId: draft.relatedId },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(draft.fireDate),
        channelId: REMINDER_CHANNEL_ID,
      },
    });
  } catch {
    // Un rappel refusé — date trop proche, quota atteint — ne doit pas priver des autres.
    return null;
  }
}

/** Nombre de rappels réellement en attente côté système. */
export async function pendingSystemNotifications(): Promise<number> {
  return (await Notifications.getAllScheduledNotificationsAsync()).length;
}

/** Retire tous les rappels, système et base. */
export async function clearNotifications(repositories: Repositories): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await repositories.notifications.replaceAll([], new Date().toISOString());
}
