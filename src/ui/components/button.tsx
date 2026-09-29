/**
 * Boutons.
 *
 * Trois formes seulement, et chacune a un sens :
 *
 * - **principal** : l'action attendue de l'écran, une seule par écran ;
 * - **secondaire** : une alternative ou une action de contexte ;
 * - **discret** : une action peu fréquente, qui ne doit pas attirer l'œil.
 *
 * Toutes ont une hauteur minimale de 44 points et un retour haptique léger : sur un
 * téléphone, un bouton qui ne « répond » pas se fait appuyer deux fois, et la seconde
 * appui déclenche l'action en double — ce qui, sur un encaissement, compte.
 */

import type { ReactElement, ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MIN_TOUCH, radius, spacing } from '../theme';
import { useTheme } from '../use-theme';
import { Icon } from './icons';
import { AppText } from './text';
import type { IconName } from '@/domain/iconNames';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /** Occupe toute la largeur disponible. */
  block?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  block = false,
  style,
}: ButtonProps): ReactElement {
  const { colors } = useTheme();
  const inactive = disabled || loading;

  const background =
    variant === 'primary'
      ? colors.primary
      : variant === 'danger'
        ? colors.danger
        : variant === 'secondary'
          ? colors.surfaceAlt
          : 'transparent';

  const foreground =
    variant === 'primary' || variant === 'danger' ? colors.onPrimary : colors.primary;

  function handlePress(): void {
    // Retour haptique court : confirme la prise en compte sans faire vibrer l'appareil.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderWidth: variant === 'secondary' ? StyleSheet.hairlineWidth : 0,
          borderColor: colors.border,
        },
        block ? styles.block : null,
        pressed ? { opacity: 0.8 } : null,
        inactive ? { opacity: 0.45 } : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <View style={styles.content}>
          {icon === undefined ? null : (
            <Icon name={icon} size={18} color={foreground} strokeWidth={2} />
          )}
          <AppText
            variant="body"
            style={{ color: foreground, fontWeight: '600', marginLeft: icon === undefined ? 0 : 7 }}
          >
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

/** Bouton rond portant une icône, pour une barre d'outils ou un en-tête. */
export function IconButton({
  icon,
  onPress,
  label,
  tone,
  size = 40,
}: {
  icon: IconName;
  onPress: () => void;
  /** Description lue par les lecteurs d'écran : une icône seule n'est pas accessible. */
  label: string;
  tone?: string;
  size?: number;
}): ReactElement {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={8}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        pressed ? { opacity: 0.6 } : null,
      ]}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={tone ?? colors.text} strokeWidth={2} />
    </Pressable>
  );
}

/** Choix exclusif entre plusieurs options courtes. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}): ReactElement {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.segmented,
        { backgroundColor: colors.surfaceSunken, borderColor: colors.border },
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segment,
              selected ? { backgroundColor: colors.surface } : null,
            ]}
          >
            <AppText
              variant="small"
              color={selected ? 'text' : 'textMuted'}
              style={{ fontWeight: selected ? '600' : '400' }}
              numberOfLines={1}
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Groupe de pastilles, pour un filtre. Plusieurs peuvent être actives. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  icon?: IconName;
}): ReactElement {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primarySoft : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
        },
        pressed ? { opacity: 0.7 } : null,
      ]}
    >
      {icon === undefined ? null : (
        <Icon
          name={icon}
          size={14}
          color={selected ? colors.primary : colors.textMuted}
          strokeWidth={2}
        />
      )}
      <AppText
        variant="small"
        style={{
          color: selected ? colors.primary : colors.textMuted,
          fontWeight: selected ? '600' : '400',
          marginLeft: icon === undefined ? 0 : 5,
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

/** Ligne de menu : un libellé, une valeur facultative, une flèche. */
export function MenuRow({
  label,
  value,
  icon,
  onPress,
  danger = false,
  right,
}: {
  label: string;
  value?: string;
  icon?: IconName;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
}): ReactElement {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={onPress === undefined}
      style={({ pressed }) => [styles.menuRow, pressed && onPress !== undefined ? { opacity: 0.6 } : null]}
    >
      {icon === undefined ? null : (
        <View style={{ marginRight: spacing.md }}>
          <Icon name={icon} size={19} color={danger ? colors.danger : colors.textMuted} strokeWidth={2} />
        </View>
      )}
      <AppText variant="body" color={danger ? 'danger' : 'text'} style={{ flex: 1 }}>
        {label}
      </AppText>
      {value === undefined ? null : (
        <AppText variant="small" color="textMuted" style={{ marginRight: spacing.sm }}>
          {value}
        </AppText>
      )}
      {right}
      {onPress === undefined ? null : (
        <Icon name="chevron-right" size={17} color={colors.textFaint} strokeWidth={2} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  block: { alignSelf: 'stretch' },
  content: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
  },
  segment: {
    flex: 1,
    minHeight: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH + 6,
    paddingVertical: spacing.sm,
  },
});
