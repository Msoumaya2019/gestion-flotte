/**
 * Composants de structure.
 *
 * Carte, écran, en-tête de section, pastille d'état, jauge, ligne de liste : tout ce qui
 * donne à l'application une allure constante. Un écran qui composerait ses propres
 * bordures finirait par ne plus ressembler aux autres.
 */

import type { ReactElement, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Labeled } from '@/domain/catalog';
import { cardShadow, MIN_TOUCH, radius, spacing, toneColors, type ThemeColors } from '../theme';
import { useTheme } from '../use-theme';
import { Icon } from './icons';
import { AppText } from './text';
import type { IconName } from '@/domain/iconNames';

// ---------------------------------------------------------------------------
// Écran
// ---------------------------------------------------------------------------

export interface ScreenProps {
  children: ReactNode;
  /** Défilement vertical. À désactiver pour un écran qui gère lui-même sa liste. */
  scroll?: boolean;
  /** Contenu collé en bas, hors défilement — une barre d'action. */
  footer?: ReactNode;
  /** Marge intérieure horizontale. */
  padded?: boolean;
  /** En-tête fixe, au-dessus du défilement. */
  header?: ReactNode;
}

export function Screen({
  children,
  scroll = true,
  footer,
  padded = true,
  header,
}: ScreenProps): ReactElement {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const content = (
    <View style={[styles.flex, padded ? { paddingHorizontal: spacing.lg } : null]}>{children}</View>
  );

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      {header}
      {scroll ? (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: spacing.xl }}
          keyboardShouldPersistTaps="handled"
        >
          {content}
        </ScrollView>
      ) : (
        content
      )}
      {footer === undefined ? null : (
        <View
          style={{
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.md,
            paddingBottom: Math.max(insets.bottom, spacing.md),
          }}
        >
          {footer}
        </View>
      )}
    </View>
  );
}

/** Titre de page, dans la barre haute. */
export function ScreenTitle({ title, subtitle }: { title: string; subtitle?: string }): ReactElement {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.md,
        paddingHorizontal: spacing.lg,
        backgroundColor: colors.background,
      }}
    >
      <AppText variant="display">{title}</AppText>
      {subtitle === undefined ? null : (
        <AppText variant="small" color="textMuted" style={{ marginTop: 2 }}>
          {subtitle}
        </AppText>
      )}
    </View>
  );
}

/**
 * Titre d'un écran atteint par navigation, avec retour.
 *
 * Les en-têtes de navigation sont masqués dans toute l'application (`headerShown: false`) :
 * chaque écran dessine donc le sien. Le geste de retour par balayage existe sur iOS, mais
 * il ne se voit pas — et un écran sans retour visible est un écran dont on se demande s'il
 * faut fermer l'application. Le bouton est là pour ça, et il porte un libellé
 * d'accessibilité, une flèche seule n'en ayant aucun.
 */
export function DetailTitle({
  title,
  subtitle,
  onBack,
  action,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  action?: ReactNode;
}): ReactElement {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        paddingTop: insets.top + spacing.sm,
        paddingBottom: spacing.sm,
        paddingHorizontal: spacing.sm,
        backgroundColor: colors.background,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      <Pressable
        onPress={onBack}
        accessibilityLabel="Revenir en arrière"
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => [
          {
            width: MIN_TOUCH,
            height: MIN_TOUCH,
            alignItems: 'center',
            justifyContent: 'center',
          },
          pressed ? { opacity: 0.5 } : null,
        ]}
      >
        <Icon name="chevron-left" size={24} color={colors.primary} strokeWidth={2.2} />
      </Pressable>

      <View style={styles.flex}>
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle === undefined ? null : (
          <AppText variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </AppText>
        )}
      </View>

      {action === undefined ? null : <View style={{ marginRight: spacing.sm }}>{action}</View>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Carte et sections
// ---------------------------------------------------------------------------

export interface CardProps {
  children: ReactNode;
  /** Rend la carte touchable en entier. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** Fond légèrement creusé, pour une carte secondaire. */
  sunken?: boolean;
}

export function Card({ children, onPress, style, padded = true, sunken = false }: CardProps): ReactElement {
  const { colors } = useTheme();

  const surface: ViewStyle = {
    backgroundColor: sunken ? colors.surfaceAlt : colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...cardShadow(colors),
    ...(padded ? { padding: spacing.lg } : null),
  };

  if (onPress === undefined) {
    return <View style={[surface, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [surface, pressed ? { opacity: 0.75 } : null, style]}
    >
      {children}
    </Pressable>
  );
}

export function SectionHeader({
  title,
  action,
  icon,
}: {
  title: string;
  action?: ReactNode;
  icon?: IconName;
}): ReactElement {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.row}>
        {icon === undefined ? null : (
          <Icon name={icon} size={16} color={colors.textMuted} strokeWidth={2} />
        )}
        <AppText variant="label" color="textMuted" style={{ marginLeft: icon === undefined ? 0 : 6 }}>
          {title}
        </AppText>
      </View>
      {action}
    </View>
  );
}

export function Divider({ inset = false }: { inset?: boolean }): ReactElement {
  const { colors } = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.separator,
        marginLeft: inset ? spacing.lg : 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// États
// ---------------------------------------------------------------------------

export function Badge({ label, tone }: Labeled): ReactElement {
  const { colors } = useTheme();
  const palette = toneColors(colors, tone);
  return (
    <View
      style={{
        backgroundColor: palette.background,
        borderRadius: radius.pill,
        paddingHorizontal: 10,
        paddingVertical: 3,
        alignSelf: 'flex-start',
      }}
    >
      <AppText variant="caption" style={{ color: palette.foreground, fontWeight: '600' }}>
        {label}
      </AppText>
    </View>
  );
}

/** Pastille ronde portant une icône, pour signaler un état sans texte. */
export function IconBubble({
  icon,
  tone = 'neutral',
  size = 36,
}: {
  icon: IconName;
  tone?: Labeled['tone'];
  size?: number;
}): ReactElement {
  const { colors } = useTheme();
  const palette = toneColors(colors, tone);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: palette.background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.5)} color={palette.foreground} strokeWidth={2} />
    </View>
  );
}

export function EmptyState({
  icon = 'sparkles',
  title,
  message,
  action,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
}): ReactElement {
  return (
    <View style={styles.empty}>
      <IconBubble icon={icon} size={56} />
      <AppText variant="title" style={{ marginTop: spacing.md, textAlign: 'center' }}>
        {title}
      </AppText>
      {message === undefined ? null : (
        <AppText
          variant="small"
          color="textMuted"
          style={{ marginTop: spacing.xs, textAlign: 'center', maxWidth: 300 }}
        >
          {message}
        </AppText>
      )}
      {action === undefined ? null : <View style={{ marginTop: spacing.lg }}>{action}</View>}
    </View>
  );
}

export function Loading({ label }: { label?: string }): ReactElement {
  const { colors } = useTheme();
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.primary} />
      {label === undefined ? null : (
        <AppText variant="small" color="textMuted" style={{ marginTop: spacing.sm }}>
          {label}
        </AppText>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Lignes
// ---------------------------------------------------------------------------

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Valeur alignée à droite, souvent un montant. */
  value?: string;
  valueColor?: keyof ThemeColors;
  badge?: Labeled;
  icon?: IconName;
  iconTone?: Labeled['tone'];
  onPress?: () => void;
  chevron?: boolean;
}

export function ListRow({
  title,
  subtitle,
  value,
  valueColor = 'text',
  badge,
  icon,
  iconTone = 'neutral',
  onPress,
  chevron = false,
}: ListRowProps): ReactElement {
  const { colors } = useTheme();

  const body = (
    <View style={styles.listRow}>
      {icon === undefined ? null : (
        <View style={{ marginRight: spacing.md }}>
          <IconBubble icon={icon} tone={iconTone} />
        </View>
      )}
      <View style={styles.flex}>
        <AppText variant="body" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle === undefined ? null : (
          <AppText variant="small" color="textMuted" numberOfLines={1} style={{ marginTop: 1 }}>
            {subtitle}
          </AppText>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', marginLeft: spacing.md }}>
        {value === undefined ? null : (
          <AppText variant="title" color={valueColor} tabular>
            {value}
          </AppText>
        )}
        {badge === undefined ? null : (
          <View style={{ marginTop: value === undefined ? 0 : 2 }}>
            <Badge {...badge} />
          </View>
        )}
      </View>
      {chevron ? (
        <View style={{ marginLeft: spacing.sm }}>
          <Icon name="chevron-right" size={18} color={colors.textFaint} strokeWidth={2} />
        </View>
      ) : null}
    </View>
  );

  if (onPress === undefined) return body;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}>
      {body}
    </Pressable>
  );
}

/** Ligne « libellé : valeur », pour une fiche. */
export function KeyValue({
  label,
  value,
  valueColor = 'text',
  mono = false,
}: {
  label: string;
  value: string;
  valueColor?: Parameters<typeof AppText>[0]['color'];
  mono?: boolean;
}): ReactElement {
  return (
    <View style={styles.keyValue}>
      <AppText variant="small" color="textMuted" style={styles.flex}>
        {label}
      </AppText>
      <AppText variant="small" color={valueColor} tabular={mono} style={{ marginLeft: spacing.md }}>
        {value}
      </AppText>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Indicateurs
// ---------------------------------------------------------------------------

export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: Labeled['tone'];
  icon?: IconName;
  onPress?: () => void;
}

/** Chiffre mis en avant. Les montants du tableau de bord sont tous de cette forme. */
export function StatTile({ label, value, hint, tone = 'neutral', icon, onPress }: StatTileProps): ReactElement {
  const { colors } = useTheme();
  const palette = toneColors(colors, tone);

  const content = (
    <Card onPress={onPress} style={styles.statTile}>
      <View style={styles.row}>
        {icon === undefined ? null : <Icon name={icon} size={15} color={colors.textFaint} strokeWidth={2} />}
        <AppText variant="caption" color="textMuted" style={{ marginLeft: icon === undefined ? 0 : 5 }}>
          {label}
        </AppText>
      </View>
      <AppText variant="heading" style={{ color: palette.foreground, marginTop: 4 }} tabular>
        {value}
      </AppText>
      {hint === undefined ? null : (
        <AppText variant="caption" color="textFaint" style={{ marginTop: 2 }} numberOfLines={2}>
          {hint}
        </AppText>
      )}
    </Card>
  );

  return content;
}

/**
 * Jauge de progression.
 *
 * La valeur est bornée à `[0, 1]` : un pourcentage de récupération d'investissement peut
 * dépasser 100 % si le véhicule a rapporté plus que son prix, et une barre plus large que
 * son cadre déborde visuellement au lieu de le signaler.
 */
export function ProgressBar({
  ratio,
  tone = 'accent',
  height = 8,
}: {
  ratio: number;
  tone?: Labeled['tone'];
  height?: number;
}): ReactElement {
  const { colors } = useTheme();
  const palette = toneColors(colors, tone);
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;

  return (
    <View
      style={{
        height,
        borderRadius: height / 2,
        backgroundColor: colors.surfaceSunken,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          backgroundColor: palette.foreground,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
}

/** Bouton discret, pour une action secondaire. */
export function LinkButton({
  label,
  onPress,
  icon,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  icon?: IconName;
  disabled?: boolean;
}): ReactElement {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.linkButton,
        { minHeight: MIN_TOUCH },
        pressed ? { opacity: 0.6 } : null,
        disabled ? { opacity: 0.4 } : null,
      ]}
    >
      {icon === undefined ? null : <Icon name={icon} size={15} color={colors.primary} strokeWidth={2} />}
      <AppText variant="small" color="primary" style={{ marginLeft: icon === undefined ? 0 : 5 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: MIN_TOUCH + 8,
  },
  keyValue: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  statTile: { flex: 1, minHeight: 92 },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },
  linkButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
});
