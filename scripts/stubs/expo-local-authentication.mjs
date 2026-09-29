/**
 * Doublure de `expo-local-authentication`.
 *
 * L'appareil simulé n'a **aucun** capteur et aucun visage enregistré : c'est le cas le
 * moins favorable, et c'est délibéré. Un test écrit contre un appareil qui dirait toujours
 * « oui » ne vérifierait pas le chemin de repli par code, qui est justement celui qu'on
 * veut éprouver.
 */

let enrolled = false;
let hardware = false;

export const AuthenticationType = { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 };
export const SecurityLevel = { NONE: 0, SECRET: 1, BIOMETRIC: 2 };

export async function hasHardwareAsync() {
  return hardware;
}

export async function isEnrolledAsync() {
  return enrolled;
}

export async function getEnrolledLevelAsync() {
  return enrolled ? SecurityLevel.BIOMETRIC : SecurityLevel.NONE;
}

export async function supportedAuthenticationTypesAsync() {
  return hardware ? [AuthenticationType.FACIAL_RECOGNITION] : [];
}

export async function authenticateAsync() {
  return { success: enrolled };
}

/** Simule un appareil doté d'un capteur et d'un visage enregistré. */
export function __setBiometrics(hasHardware, isEnrolled) {
  hardware = hasHardware;
  enrolled = isEnrolled;
}
