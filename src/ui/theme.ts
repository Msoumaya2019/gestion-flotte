/**
 * Jetons de design.
 *
 * ## Pourquoi des jetons et pas des valeurs écrites dans les écrans
 *
 * Un écran qui écrit `#E5484D` pour un montant en retard, et un autre qui écrit `#D93B3B`,
 * produisent deux rouges qui ne veulent pas dire la même chose. Le jour où l'on veut
 * éclaircir le rouge, on en oublie un. Ici, la couleur d'un état est **décidée une fois**
 * (`tone.danger`), et changer le rouge change tous les écrans d'un coup.
 *
 * ## La règle de couleur de l'application
 *
 * - **vert** : c'est fait, c'est encaissé, c'est valide ;
 * - **orange** : à surveiller — une échéance approche, un dossier est incomplet ;
 * - **rouge** : c'est en retard, c'est dépassé, c'est manquant ;
 * - **gris** : inactif — vendu, archivé, annulé.
 *
 * Une couleur ne porte jamais deux sens. Le vert ne sert pas à décorer.
 *
 * ## Deux thèmes, une seule source
 *
 * Les jetons sont déclarés une fois, avec une variante claire et une variante sombre. Les
 * écrans n'utilisent que `useTheme()`, jamais un littéral de couleur : c'est ce qui rend le
 * mode sombre gratuit plutôt que repris écran par écran.
 */

import type { Tone } from '@/domain/catalog';

export interface ThemeColors {
  /** Fond de page. */
  background: string;
  /** Fond d'une carte posée sur le fond. */
  surface: string;
  /** Fond d'un élément posé sur une carte — champ de saisie, ligne survolée. */
  surfaceAlt: string;
  /** Fond neutre discret, pour une pastille ou un en-tête de section. */
  surfaceSunken: string;
  border: string;
  /** Séparateur interne, plus discret qu'une bordure. */
  separator: string;
  text: string;
  textMuted: string;
  textFaint: string;
  /** Texte posé sur `primary`. */
  onPrimary: string;
  primary: string;
  primarySoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  neutral: string;
  neutralSoft: string;
  /** Ombre portée des cartes. En sombre, l'ombre est presque invisible : c'est voulu. */
  shadow: string;
}

const light: ThemeColors = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F3F6',
  surfaceSunken: '#EDEFF3',
  border: '#DFE3E9',
  separator: '#EAEDF1',
  text: '#14181F',
  textMuted: '#5A6472',
  textFaint: '#8A93A0',
  onPrimary: '#FFFFFF',
  primary: '#1F5FD0',
  primarySoft: '#E4EDFC',
  success: '#1B7F4B',
  successSoft: '#E1F3E9',
  warning: '#A8620A',
  warningSoft: '#FCF0DC',
  danger: '#C0342F',
  dangerSoft: '#FBE7E5',
  info: '#1F5FD0',
  infoSoft: '#E4EDFC',
  neutral: '#5A6472',
  neutralSoft: '#EDEFF3',
  shadow: 'rgba(20, 24, 31, 0.08)',
};

const dark: ThemeColors = {
  background: '#0F1216',
  surface: '#181C22',
  surfaceAlt: '#212630',
  surfaceSunken: '#14181E',
  border: '#2C333D',
  separator: '#242A33',
  text: '#F2F4F7',
  textMuted: '#A5AEBC',
  textFaint: '#7A8492',
  onPrimary: '#0B0E12',
  primary: '#6FA6FF',
  primarySoft: '#1B2A44',
  success: '#5FCB92',
  successSoft: '#16301F',
  warning: '#E3A34A',
  warningSoft: '#33260E',
  danger: '#FF7B72',
  dangerSoft: '#3A1D1B',
  info: '#6FA6FF',
  infoSoft: '#1B2A44',
  neutral: '#A5AEBC',
  neutralSoft: '#212630',
  shadow: 'rgba(0, 0, 0, 0.4)',
};

export const themes = { light, dark } as const;
export type ThemeName = keyof typeof themes;

/** Espacements. Une échelle de 4, pour que deux écrans ne diffèrent pas de 3 points. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const fontSize = {
  caption: 12,
  small: 13,
  body: 15,
  title: 17,
  heading: 20,
  display: 28,
  /** Chiffres mis en avant : un montant principal, un compteur. */
  hero: 34,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

/** Hauteur des zones tactiles. En dessous de 44, une cible est difficile à viser. */
export const HIT_SLOP = 12;
export const MIN_TOUCH = 44;

export interface ToneColors {
  /** Couleur du texte et de l'icône. */
  foreground: string;
  /** Fond de la pastille. */
  background: string;
}

/**
 * Couleurs d'un état, dans le thème courant.
 *
 * Le vocabulaire des tons est celui du **domaine** (`ok`, `warn`, `danger`, `neutral`,
 * `info`, `accent`) : les tables de libellés y désignent déjà le ton de chaque statut.
 * Employer ici un second vocabulaire aurait imposé une table de correspondance à chaque
 * affichage — et une occasion d'en oublier un.
 */
export function toneColors(colors: ThemeColors, tone: Tone): ToneColors {
  switch (tone) {
    case 'ok':
      return { foreground: colors.success, background: colors.successSoft };
    case 'warn':
      return { foreground: colors.warning, background: colors.warningSoft };
    case 'danger':
      return { foreground: colors.danger, background: colors.dangerSoft };
    case 'info':
      return { foreground: colors.info, background: colors.infoSoft };
    case 'accent':
      return { foreground: colors.primary, background: colors.primarySoft };
    case 'neutral':
      return { foreground: colors.neutral, background: colors.neutralSoft };
  }
}

/**
 * Ombre d'une carte.
 *
 * Très discrète et à deux niveaux : une carte doit se détacher du fond sans donner
 * l'impression de flotter. En mode sombre, l'ombre est conservée mais ne sert presque à
 * rien — c'est la bordure qui sépare.
 */
export function cardShadow(colors: ThemeColors): {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
} {
  return {
    shadowColor: colors.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  };
}
