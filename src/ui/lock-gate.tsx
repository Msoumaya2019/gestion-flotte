/**
 * Porte de verrouillage.
 *
 * ## Ce qui déclenche le verrouillage
 *
 * L'application se verrouille quand elle **passe en arrière-plan**, et se déverrouille au
 * retour si le délai réglé est écoulé. Le délai existe parce que basculer vers Messages
 * pour recopier un numéro ne devrait pas coûter un Face ID ; « Immédiatement » est proposé
 * pour qui préfère l'inverse.
 *
 * ## L'ordre des tentatives
 *
 * Face ID d'abord — c'est un confort, il évite de saisir un code vingt fois par jour. Le
 * code de secours ensuite, et il est **toujours** disponible : un visage mal éclairé, un
 * masque, un capteur capricieux ne doivent pas enfermer l'utilisateur hors de ses données.
 *
 * ## Ce que le verrouillage ne fait pas
 *
 * Il ne chiffre pas la base : les montants et les noms restent lisibles dans le fichier
 * SQLite. Les **documents**, eux, sont chiffrés (voir `services/file-store`). La différence
 * est assumée et expliquée dans les réglages, parce qu'un utilisateur qui croit ses données
 * chiffrées alors qu'elles ne le sont pas prend de mauvaises décisions.
 */

import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { AppState, Pressable, StyleSheet, View, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useApp } from '@/state/app-context';
import { radius, spacing } from './theme';
import { useTheme } from './use-theme';
import { Button } from './components/button';
import { AppText } from './components/text';
import { Icon } from './components/icons';
import {
  authenticateWithBiometrics,
  canUseBiometrics,
  checkPin,
  pinIsSet,
  shouldLock,
} from '@/services/security';

type GateState = 'ouverte' | 'verrouillee' | 'sans_code';

export function LockGate({ children }: { children: ReactNode }): ReactElement {
  const { colors } = useTheme();
  const { data, repositories } = useApp();
  const [state, setState] = useState<GateState>('ouverte');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const settings = data.settings;

  const lockingEnabled = settings.biometricsEnabled || settings.pinEnabled;

  /** Tente Face ID, puis retombe sur la saisie du code. */
  const tryUnlock = useCallback(async (): Promise<void> => {
    if (repositories === null) return;

    const hasPin = await pinIsSet(repositories);
    if (!hasPin) {
      // Aucun code posé : le verrouillage ne peut pas être exigé, sinon l'application
      // serait définitivement fermée.
      setState('ouverte');
      return;
    }

    if (settings.biometricsEnabled) {
      setBusy(true);
      if (await canUseBiometrics()) {
        const ok = await authenticateWithBiometrics('Déverrouiller la gestion de flotte');
        setBusy(false);
        if (ok) {
          setState('ouverte');
          return;
        }
      } else {
        setBusy(false);
      }
    }

    setState('verrouillee');
  }, [repositories, settings.biometricsEnabled]);

  // Verrouillage au passage en arrière-plan.
  useEffect(() => {
    function handleChange(next: AppStateStatus): void {
      if (!lockingEnabled) return;
      if (next === 'background' || next === 'inactive') {
        backgroundedAt.current = Date.now();
      } else if (next === 'active' && backgroundedAt.current !== null) {
        if (shouldLock(settings.lockDelaySeconds, backgroundedAt.current, Date.now())) {
          setPin('');
          setError(null);
          void tryUnlock();
        }
        backgroundedAt.current = null;
      }
    }

    const subscription = AppState.addEventListener('change', handleChange);
    return () => subscription.remove();
  }, [lockingEnabled, settings.lockDelaySeconds, tryUnlock]);

  // Au démarrage, l'application est verrouillée si un code est posé.
  useEffect(() => {
    if (!lockingEnabled) return;
    void tryUnlock();
  }, [lockingEnabled, tryUnlock]);

  async function submitPin(): Promise<void> {
    if (repositories === null) return;
    setBusy(true);
    const ok = await checkPin(pin, repositories);
    setBusy(false);
    if (ok) {
      setPin('');
      setError(null);
      setState('ouverte');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setPin('');
      setError('Code incorrect.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  if (state === 'ouverte') {
    return <>{children}</>;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.inner}>
        <View style={[styles.badge, { backgroundColor: colors.primarySoft }]}>
          <Icon name="lock" size={30} color={colors.primary} strokeWidth={1.8} />
        </View>
        <AppText variant="heading" align="center" style={{ marginTop: spacing.lg }}>
          Gestion de flotte
        </AppText>
        <AppText variant="small" color="textMuted" align="center" style={{ marginTop: 4 }}>
          {state === 'sans_code'
            ? 'Aucun code n’est posé.'
            : 'Saisissez votre code pour continuer.'}
        </AppText>

        <View style={styles.dots}>
          {Array.from({ length: Math.max(6, pin.length) }, (_, index) => (
            <View
              key={index}
              style={[
                styles.dot,
                {
                  backgroundColor: index < pin.length ? colors.primary : colors.surfaceSunken,
                  borderColor: colors.border,
                },
              ]}
            />
          ))}
        </View>

        {error === null ? null : (
          <AppText variant="small" color="danger" align="center">
            {error}
          </AppText>
        )}

        <Keypad
          onDigit={(digit) => {
            setError(null);
            setPin((current) => (current.length >= 12 ? current : current + digit));
          }}
          onDelete={() => setPin((current) => current.slice(0, -1))}
        />

        <Button
          label="Valider"
          onPress={() => void submitPin()}
          disabled={pin.length < 6}
          loading={busy}
          block
          style={{ marginTop: spacing.lg }}
        />

        {settings.biometricsEnabled ? (
          <Pressable onPress={() => void tryUnlock()} style={{ marginTop: spacing.lg }}>
            <View style={styles.biometricRow}>
              <Icon name="fingerprint" size={18} color={colors.primary} strokeWidth={1.8} />
              <AppText variant="small" color="primary" style={{ marginLeft: 6 }}>
                Utiliser Face ID
              </AppText>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function Keypad({
  onDigit,
  onDelete,
}: {
  onDigit: (digit: string) => void;
  onDelete: () => void;
}): ReactElement {
  const { colors } = useTheme();
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  return (
    <View style={styles.keypad}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.keypadRow}>
          {row.map((key, keyIndex) => {
            if (key === '') return <View key={keyIndex} style={styles.key} />;
            const isDelete = key === 'del';
            return (
              <Pressable
                key={keyIndex}
                onPress={() => (isDelete ? onDelete() : onDigit(key))}
                style={({ pressed }) => [
                  styles.key,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                  pressed ? { opacity: 0.6 } : null,
                ]}
              >
                {isDelete ? (
                  <Icon name="chevron-left" size={22} color={colors.textMuted} strokeWidth={2} />
                ) : (
                  <AppText variant="heading">{key}</AppText>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  inner: { alignItems: 'center' },
  badge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { flexDirection: 'row', marginTop: spacing.xl, marginBottom: spacing.md, minHeight: 14 },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginHorizontal: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  keypad: { marginTop: spacing.md, width: '100%', maxWidth: 300 },
  keypadRow: { flexDirection: 'row', justifyContent: 'center' },
  key: {
    width: 68,
    height: 68,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 5,
    borderWidth: StyleSheet.hairlineWidth,
  },
  biometricRow: { flexDirection: 'row', alignItems: 'center' },
});
