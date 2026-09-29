/**
 * Doublure de `expo-haptics`.
 *
 * Le retour haptique n'a pas d'équivalent hors appareil. La doublure compte les
 * déclenchements : un test peut vérifier qu'une action donne bien un retour, ce qui est la
 * seule chose qui dépende du code applicatif.
 */

const impacts = [];

export const ImpactFeedbackStyle = { Light: 'light', Medium: 'medium', Heavy: 'heavy' };
export const NotificationFeedbackType = { Success: 'success', Warning: 'warning', Error: 'error' };

export async function impactAsync(style) {
  impacts.push({ kind: 'impact', style });
}

export async function notificationAsync(type) {
  impacts.push({ kind: 'notification', type });
}

export async function selectionAsync() {
  impacts.push({ kind: 'selection' });
}

export function __impacts() {
  return [...impacts];
}

export function __resetHaptics() {
  impacts.length = 0;
}
