/**
 * Texte typé.
 *
 * Un seul composant, et une variante obligatoire. Écrire `<Text style={{fontSize: 15}}>`
 * dans un écran paraît anodin ; multiplié par quarante écrans, cela donne sept tailles de
 * corps qui ne se distinguent pas et une hiérarchie illisible. Ici, la variante dit le
 * **rôle** — titre de carte, légende, chiffre principal — et la taille suit.
 */

import type { ReactElement } from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { fontSize, fontWeight, type ThemeColors } from '../theme';
import { useTheme } from '../use-theme';

export type TextVariant =
  | 'caption'
  | 'small'
  | 'body'
  | 'title'
  | 'heading'
  | 'display'
  | 'hero'
  /** Étiquette de champ : petite, en majuscules discrètes, au-dessus d'une valeur. */
  | 'label';

const VARIANTS: Record<TextVariant, TextStyle> = {
  caption: { fontSize: fontSize.caption, fontWeight: fontWeight.regular, letterSpacing: 0.1 },
  small: { fontSize: fontSize.small, fontWeight: fontWeight.regular },
  body: { fontSize: fontSize.body, fontWeight: fontWeight.regular },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.semibold },
  heading: { fontSize: fontSize.heading, fontWeight: fontWeight.bold, letterSpacing: -0.2 },
  display: { fontSize: fontSize.display, fontWeight: fontWeight.bold, letterSpacing: -0.4 },
  hero: { fontSize: fontSize.hero, fontWeight: fontWeight.bold, letterSpacing: -0.8 },
  label: {
    fontSize: fontSize.caption,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
};

export interface AppTextProps extends TextProps {
  variant?: TextVariant;
  /** Couleur sémantique, résolue dans le thème courant. */
  color?: keyof ThemeColors;
  /** Alignement à droite, pour une colonne de montants. */
  align?: 'left' | 'center' | 'right';
  /** Chiffres à chasse fixe : deux montants empilés s'alignent au centime. */
  tabular?: boolean;
}

export function AppText({
  variant = 'body',
  color = 'text',
  align,
  tabular = false,
  style,
  ...rest
}: AppTextProps): ReactElement {
  const { colors } = useTheme();

  return (
    <Text
      {...rest}
      style={[
        VARIANTS[variant],
        { color: colors[color] },
        align === undefined ? null : { textAlign: align },
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    />
  );
}

/** Montant mis en avant. Tabulaire par défaut : c'est un chiffre qu'on compare. */
export function Money({
  children,
  variant = 'title',
  color = 'text',
  align = 'right',
  ...rest
}: AppTextProps): ReactElement {
  return (
    <AppText variant={variant} color={color} align={align} tabular {...rest}>
      {children}
    </AppText>
  );
}
