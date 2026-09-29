/**
 * Balayer une ligne pour la retirer — ou la remettre.
 *
 * ## Pourquoi le `Swipeable` historique, et pas celui de Reanimated
 *
 * `react-native-gesture-handler` livre deux versions. Celle de Reanimated exige son
 * greffon Babel et `react-native-worklets` : le projet n'a **pas** de `babel.config.js`,
 * et rien n'y importe Reanimated aujourd'hui. Activer un greffon pour un geste, c'est
 * risquer l'empaquetage entier — le bundle se casse à l'exécution, pas au typage. La
 * version historique s'appuie sur l'`Animated` de React Native : elle ne demande ni
 * greffon ni dépendance nouvelle, et son seul défaut est une annotation `@deprecated`
 * dans la documentation du paquet, sans avertissement à l'exécution (vérifié dans
 * `node_modules`, version 2.32.0).
 *
 * ## Le geste n'est pas le seul chemin
 *
 * Un balayage est invisible pour un lecteur d'écran, et rien ne l'annonce à qui ne
 * l'essaie pas. Ce composant est donc un **raccourci**, jamais l'unique moyen : les
 * formulaires de véhicule et de locataire portent déjà l'action équivalente, et la
 * confirmation, elle, est une boîte de dialogue — donc atteignable partout.
 */

import { useRef, type ReactElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';

import type { IconName } from '@/domain/iconNames';
import { MIN_TOUCH, radius, spacing } from '../theme';
import { useTheme } from '../use-theme';
import { Icon } from './icons';
import { AppText } from './text';

export interface SwipeActionProps {
  children: ReactNode;
  /** Ce que fait le geste, au mot près : « Retirer », « Restaurer ». */
  label: string;
  icon: IconName;
  /** Rouge pour ce qui retire, couleur d'accent pour ce qui remet. */
  tone?: 'danger' | 'accent';
  /**
   * Appelé quand l'action est touchée. Le composant se referme dès que la promesse est
   * résolue — que l'action ait eu lieu ou non, puisque la ligne aura disparu ou changé.
   */
  onTrigger: () => void | Promise<void>;
  /** Porté par le conteneur : c'est lui qui règle l'espacement dans la liste. */
  style?: StyleProp<ViewStyle>;
}

export function SwipeAction({
  children,
  label,
  icon,
  tone = 'danger',
  onTrigger,
  style,
}: SwipeActionProps): ReactElement {
  const { colors } = useTheme();
  const reference = useRef<Swipeable>(null);
  const fond = tone === 'danger' ? colors.danger : colors.primary;

  function tirer(): void {
    // Retour haptique plus marqué que celui d'un bouton : ce geste retire quelque chose.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void Promise.resolve(onTrigger()).finally(() => reference.current?.close());
  }

  return (
    <View style={style}>
      <Swipeable
        ref={reference}
        // Sans ce réglage, le geste peut dépasser l'action et laisser un vide à droite.
        overshootRight={false}
        renderRightActions={() => (
          <Pressable
            onPress={tirer}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: fond },
              pressed ? { opacity: 0.85 } : null,
            ]}
          >
            <Icon name={icon} size={20} color={colors.onPrimary} strokeWidth={2} />
            <AppText
              variant="caption"
              numberOfLines={1}
              style={{ color: colors.onPrimary, fontWeight: '600', marginTop: 3 }}
            >
              {label}
            </AppText>
          </Pressable>
        )}
      >
        {children}
      </Swipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    width: 92,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    marginLeft: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
});
