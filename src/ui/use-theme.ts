/**
 * Thème courant.
 *
 * L'application suit le réglage du système. Il n'y a pas de bascule manuelle : sur iPhone,
 * quelqu'un qui a choisi le mode sombre l'a choisi pour toutes ses applications, et lui
 * imposer un réglage de plus dans celle-ci serait du bruit.
 */

import { useColorScheme } from 'react-native';
import { themes, type ThemeColors, type ThemeName } from './theme';

export interface Theme {
  name: ThemeName;
  colors: ThemeColors;
  isDark: boolean;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const name: ThemeName = scheme === 'dark' ? 'dark' : 'light';
  return { name, colors: themes[name], isDark: name === 'dark' };
}
