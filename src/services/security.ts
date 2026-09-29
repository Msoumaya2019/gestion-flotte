/**
 * Verrouillage de l'application : Face ID, code de secours, délai automatique.
 *
 * ## Ce que cette barrière protège — et ce qu'elle ne protège pas
 *
 * Elle protège de **quelqu'un qui a l'appareil déverrouillé dans la main** : un proche, un
 * client, un collègue. Elle ne protège pas d'une analyse du contenu de l'appareil : les
 * documents du coffre sont chiffrés, mais la base SQLite ne l'est pas. Le dire franchement
 * vaut mieux que de laisser croire à un chiffrement général.
 *
 * ## Le code de secours est le vrai secret
 *
 * Face ID est un confort : il évite de saisir un code vingt fois par jour. Mais il peut
 * être refusé, indisponible, ou désactivé par l'utilisateur. Un code de secours est donc
 * **obligatoire** pour activer le verrouillage, et c'est lui qui est vérifié en dernier
 * recours — jamais une comparaison en clair, toujours PBKDF2 avec sel (voir `crypto.ts`).
 *
 * Le code est stocké dans la table `meta`, sous forme d'enregistrement salé. Le sel est
 * dans l'enregistrement : il n'est pas un secret, et le séparer n'apporterait rien.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import type { Repositories } from '@/data/repositories';
import { META_KEYS } from '@/data/bootstrap';
import { hashPin, pinIsAcceptable, verifyPin, type PinRecord, type RandomBytes } from './crypto';

/** Nombre d'itérations retenu pour le code de secours. */
const PIN_ITERATIONS = 150_000;

export interface BiometricAvailability {
  /** L'appareil a un capteur (Touch ID, Face ID). */
  hasHardware: boolean;
  /** Un visage ou une empreinte est réellement enregistré dans le système. */
  isEnrolled: boolean;
  /** L'appareil a un code de déverrouillage système. */
  hasSystemPasscode: boolean;
  /** Types proposés : `['face']`, `['fingerprint']`, ou les deux. */
  types: readonly ('face' | 'fingerprint' | 'iris' | 'none')[];
}

const AUTHENTICATION_TYPE_LABELS: Record<number, 'face' | 'fingerprint' | 'iris'> = {
  [LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION]: 'face',
  [LocalAuthentication.AuthenticationType.FINGERPRINT]: 'fingerprint',
  [LocalAuthentication.AuthenticationType.IRIS]: 'iris',
};

/** Ce que l'appareil sait faire. Ne demande aucune autorisation. */
export async function biometricAvailability(): Promise<BiometricAvailability> {
  const [hasHardware, isEnrolled, level, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
    LocalAuthentication.getEnrolledLevelAsync(),
    LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);

  return {
    hasHardware,
    isEnrolled,
    hasSystemPasscode: level !== LocalAuthentication.SecurityLevel.NONE,
    types: types
      .map((type) => AUTHENTICATION_TYPE_LABELS[type])
      .filter((label): label is 'face' | 'fingerprint' | 'iris' => label !== undefined),
  };
}

/** Vrai si Face ID peut réellement être proposé : matériel **et** visage enregistré. */
export async function canUseBiometrics(): Promise<boolean> {
  const availability = await biometricAvailability();
  return availability.hasHardware && availability.isEnrolled;
}

/**
 * Demande une authentification biométrique.
 *
 * Rend `false` sur un échec ou une annulation, et ne lève pas : refuser du doigt n'est pas
 * une erreur, c'est un usage normal. Le message affiché par le système ne doit donc pas
 * ressembler à un message d'erreur.
 */
export async function authenticateWithBiometrics(reason: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Annuler',
      // Le code de secours est géré par l'application, pas par le système : sinon un code
      // système valide ouvrirait l'application alors que l'utilisateur a posé le sien.
      disableDeviceFallback: true,
    });
    return result.success;
  } catch {
    return false;
  }
}

/** Lit l'enregistrement du code, ou `null` si aucun code n'est posé. */
export async function loadPinRecord(repositories: Repositories): Promise<PinRecord | null> {
  const raw = await repositories.meta.get(META_KEYS.pinHash);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Partial<PinRecord>;
    if (
      candidate.algorithm !== 'pbkdf2-sha256' ||
      typeof candidate.iterations !== 'number' ||
      typeof candidate.salt !== 'string' ||
      typeof candidate.hash !== 'string'
    ) {
      return null;
    }
    return {
      algorithm: 'pbkdf2-sha256',
      iterations: candidate.iterations,
      salt: candidate.salt,
      hash: candidate.hash,
    };
  } catch {
    return null;
  }
}

/** Un code est-il déjà posé ? */
export async function pinIsSet(repositories: Repositories): Promise<boolean> {
  return (await loadPinRecord(repositories)) !== null;
}

/**
 * Pose un nouveau code, en remplaçant l'ancien.
 *
 * Le code est refusé s'il est trop court : six chiffres au minimum. Un code à quatre
 * chiffres se devine en dix mille essais, ce qui est à la portée d'un script hors ligne
 * sur un téléphone volé.
 */
export async function setPin(
  pin: string,
  repositories: Repositories,
  random: RandomBytes,
): Promise<void> {
  if (!pinIsAcceptable(pin)) {
    throw new Error('Le code doit comporter au moins 6 chiffres.');
  }
  const record = await hashPin(pin, random, PIN_ITERATIONS);
  await repositories.meta.set(META_KEYS.pinHash, JSON.stringify(record));
}

/** Retire le code. Le verrouillage ne peut plus être activé tant qu'aucun code n'est posé. */
export async function clearPin(repositories: Repositories): Promise<void> {
  await repositories.meta.remove(META_KEYS.pinHash);
}

/** Vérifie un code saisi. Rend `false` si aucun code n'est posé. */
export async function checkPin(pin: string, repositories: Repositories): Promise<boolean> {
  const record = await loadPinRecord(repositories);
  if (record === null) return false;
  return verifyPin(pin, record);
}

/**
 * Le verrouillage doit-il être actif, vu le délai réglé et le temps écoulé ?
 *
 * `lockDelaySeconds` vaut `-1` pour « jamais ». Cette fonction est pure dans son esprit :
 * elle ne lit ni l'horloge ni les réglages, elle compare deux instants qu'on lui donne.
 */
export function shouldLock(
  lockDelaySeconds: number,
  backgroundedAt: number | null,
  now: number,
): boolean {
  if (lockDelaySeconds < 0) return false;
  if (backgroundedAt === null) return false;
  return now - backgroundedAt >= lockDelaySeconds * 1000;
}
