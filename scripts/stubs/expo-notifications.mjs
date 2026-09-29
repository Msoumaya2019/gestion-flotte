/**
 * Doublure de `expo-notifications`.
 *
 * Elle enregistre les rappels posés et les autorisations demandées. Un test peut donc
 * vérifier **ce qui aurait sonné et quand**, ce qui est la seule chose vérifiable hors
 * appareil : le déclenchement effectif par le système ne s'observe que sur un téléphone.
 */

const scheduled = [];
let permission = { granted: false, canAskAgain: true };
let counter = 0;

export const AndroidImportance = { DEFAULT: 3, HIGH: 4 };
export const SchedulableTriggerInputTypes = { DATE: 'date', TIME_INTERVAL: 'timeInterval' };

export function setNotificationHandler() {
  return undefined;
}

export async function setNotificationChannelAsync() {
  return null;
}

export async function getPermissionsAsync() {
  return { ...permission };
}

export async function requestPermissionsAsync() {
  permission = { granted: true, canAskAgain: false };
  return { ...permission };
}

export async function scheduleNotificationAsync(request) {
  counter += 1;
  const id = `notif-${String(counter)}`;
  scheduled.push({ id, ...request });
  return id;
}

export async function cancelAllScheduledNotificationsAsync() {
  scheduled.length = 0;
}

export async function getAllScheduledNotificationsAsync() {
  return scheduled.map((entry) => ({ identifier: entry.id, content: entry.content, trigger: entry.trigger }));
}

export function __scheduled() {
  return [...scheduled];
}

export function __setPermission(granted, canAskAgain = false) {
  permission = { granted, canAskAgain };
}

export function __resetNotifications() {
  scheduled.length = 0;
  counter = 0;
  permission = { granted: false, canAskAgain: true };
}
