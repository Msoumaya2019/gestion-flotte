/**
 * Racine de l'application.
 *
 * Trois responsabilités, dans cet ordre : ouvrir la base, verrouiller si nécessaire, puis
 * laisser passer. Les écrans eux-mêmes ne se préoccupent jamais du démarrage.
 *
 * ## L'ordre des fournisseurs
 *
 * `GestureHandlerRootView` doit être le plus à l'extérieur : sans lui, les gestes de
 * navigation ne sont pas reçus sur Android. `SafeAreaProvider` vient ensuite, parce que
 * l'écran de chargement et l'écran d'erreur s'en servent aussi — pas seulement les écrans
 * nominaux.
 */

import { useEffect, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import { AppProvider, useApp } from '@/state/app-context';
import { installNotificationHandler } from '@/services/notifications';
import { AppText } from '@/ui/components/text';
import { Icon } from '@/ui/components/icons';
import { Loading } from '@/ui/components/base';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { LockGate } from '@/ui/lock-gate';

export default function RootLayout(): ReactElement {
  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <AppProvider>
          <Root />
        </AppProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Root(): ReactElement {
  const { ready, fatalError } = useApp();
  const theme = useTheme();

  // Le gestionnaire d'affichage doit être posé avant qu'un rappel puisse arriver, donc au
  // démarrage et non au moment où l'on programme le premier rappel.
  useEffect(() => {
    installNotificationHandler();
    // Les rappels reçus application ouverte ne doivent pas déclencher de navigation :
    // l'application n'a pas d'écran cible unique par nature de rappel.
    const subscription = Notifications.addNotificationReceivedListener(() => undefined);
    return () => subscription.remove();
  }, []);

  if (!ready) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <StatusBar style={theme.isDark ? 'light' : 'dark'} />
        <Loading label="Ouverture de la base locale…" />
      </View>
    );
  }

  if (fatalError !== null) {
    return <StartupError message={fatalError} />;
  }

  return (
    <LockGate>
      <StatusBar style={theme.isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="ajout" options={{ presentation: 'modal' }} />
      </Stack>
    </LockGate>
  );
}

/**
 * Écran d'échec du démarrage.
 *
 * Il ne propose pas de « réessayer » : une base illisible ne le devient pas moins en
 * réessayant, et un bouton qui ne change rien fait perdre du temps. Il dit ce qui s'est
 * passé et ce qu'il reste à faire.
 */
function StartupError({ message }: { message: string }): ReactElement {
  const { colors } = useTheme();
  return (
    <View style={[styles.error, { backgroundColor: colors.background }]}>
      <Icon name="alert-triangle" size={40} color={colors.danger} strokeWidth={1.8} />
      <AppText variant="heading" align="center" style={{ marginTop: spacing.lg }}>
        La base locale n’a pas pu être ouverte
      </AppText>
      <AppText variant="small" color="textMuted" align="center" style={{ marginTop: spacing.sm }}>
        {message}
      </AppText>
      <AppText
        variant="caption"
        color="textFaint"
        align="center"
        style={{ marginTop: spacing.lg, maxWidth: 320 }}
      >
        Les données ne quittent jamais l’appareil : il n’y a pas de copie sur un serveur à
        laquelle revenir. Si une sauvegarde a été exportée, elle peut être restaurée depuis
        les réglages d’une installation neuve.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  error: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
});
