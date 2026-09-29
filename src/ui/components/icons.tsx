/**
 * Jeu d'icônes, dessiné en SVG.
 *
 * ## Pourquoi pas une bibliothèque d'icônes
 *
 * Une bibliothèque complète pèse plusieurs mégaoctets pour une soixantaine d'icônes
 * utilisées. Ici, chaque tracé est écrit à la main sur une grille de 24 × 24, en traits, et
 * le rendu suit la couleur et l'épaisseur qu'on lui donne — donc le thème, sans variante.
 *
 * ## Le contrat avec le domaine
 *
 * `ICON_NAMES` (dans le domaine) est la liste de référence : les catalogues désignent leurs
 * icônes par ces noms. Le type `Record<IconName, …>` ci-dessous **force** à dessiner chaque
 * nom listé — en ajouter un sans tracé ne compile pas. Un test de forme vérifie en plus que
 * les deux listes coïncident, dans l'autre sens.
 */

import type { ReactElement } from 'react';
import type { ColorValue } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { IconName } from '@/domain/iconNames';

interface Shape {
  d: string;
  /** Forme pleine, pour un point ou une pastille. Par défaut, la forme est tracée. */
  filled?: boolean;
}

const ICONS: Record<IconName, readonly Shape[]> = {
  home: [{ d: 'M3 10.8 12 3.4l9 7.4' }, { d: 'M5.6 9.6V20.6h12.8V9.6' }, { d: 'M10 20.6v-6h4v6' }],
  car: [
    { d: 'M4.5 15.5v-2.6l2-5.2h11l2 5.2v2.6' },
    { d: 'M3.2 15.5h17.6v3.2H3.2z' },
    { d: 'M7.2 19.6a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8' },
    { d: 'M16.8 19.6a1.4 1.4 0 1 1 0-2.8 1.4 1.4 0 0 1 0 2.8' },
  ],
  'car-multiple': [
    { d: 'M6.5 13.6v-1.9l1.5-3.9h8.3l1.5 3.9v1.9' },
    { d: 'M5.5 13.6h13.4v2.6H5.5z' },
    { d: 'M2.6 17.4v-1.6l1.3-3.3h1.6' },
    { d: 'M2.2 17.4h4.1v2.4H2.2z' },
  ],
  key: [{ d: 'M15.2 4.4a4.9 4.9 0 1 0-3.9 8.1c.4 0 .8 0 1.1-.2L14 14h2v2h2v2h2.6v-3.1l-6.2-6.2' }],
  user: [{ d: 'M12 11.4a3.9 3.9 0 1 0 0-7.8 3.9 3.9 0 0 0 0 7.8' }, { d: 'M4.6 20.6c0-3.6 3.3-6 7.4-6s7.4 2.4 7.4 6' }],
  users: [
    { d: 'M9.4 11.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8' },
    { d: 'M2.8 20.4c0-3.2 2.9-5.3 6.6-5.3s6.6 2.1 6.6 5.3' },
    { d: 'M16.2 5.1a3.2 3.2 0 0 1 0 6.2' },
    { d: 'M17.4 15.4c2.2.5 3.8 1.9 3.8 4.1' },
  ],
  'file-text': [{ d: 'M6.4 3.4h7.2l4.4 4.4v12.8H6.4z' }, { d: 'M13.6 3.4v4.4h4.4' }, { d: 'M9 12h6M9 15.4h6M9 18.4h3.4' }],
  'file-check': [{ d: 'M6.4 3.4h7.2l4.4 4.4v12.8H6.4z' }, { d: 'M13.6 3.4v4.4h4.4' }, { d: 'M9.2 14.6l2 2 3.6-3.8' }],
  folder: [{ d: 'M3.4 6.6h5.2l2 2.4h10v10.4H3.4z' }],
  euro: [{ d: 'M17.4 6.4a6.6 6.6 0 1 0 0 11.2' }, { d: 'M4.6 10.6h8.4M4.6 13.6h8.4' }],
  wallet: [{ d: 'M3.4 7.2h14.4a2 2 0 0 1 2 2v8.6a2 2 0 0 1-2 2H5.4a2 2 0 0 1-2-2z' }, { d: 'M3.4 7.2 15.6 4.2v3' }, { d: 'M16.4 13.4h3.4' }],
  banknote: [{ d: 'M2.8 6.6h18.4v10.8H2.8z' }, { d: 'M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8' }, { d: 'M6 10.2v3.6M18 10.2v3.6' }],
  'credit-card': [{ d: 'M2.8 6h18.4v12H2.8z' }, { d: 'M2.8 10.2h18.4' }, { d: 'M6 14.4h3.6' }],
  receipt: [{ d: 'M6 3.4h12v17.2l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z' }, { d: 'M9 8.4h6M9 12h6M9 15.4h3.6' }],
  'chart-bar': [{ d: 'M4.4 20.4V13' }, { d: 'M12 20.4V5.4' }, { d: 'M19.6 20.4v-9.6' }, { d: 'M2.4 20.4h19.2' }],
  'chart-line': [{ d: 'M3.6 17.6l4.6-5 3.6 3 6.8-8.2' }, { d: 'M2.4 20.4h19.2' }],
  'trending-up': [{ d: 'M3.4 16.6l5.2-5.4 3.4 3.2 7.6-8' }, { d: 'M15.4 6.4h4.2v4.2' }],
  percent: [{ d: 'M6.8 9.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2' }, { d: 'M17.2 20a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2' }, { d: 'M5.6 18.4 18.4 5.6' }],
  wrench: [{ d: 'M15.4 3.6a5 5 0 0 0-4.6 6.6L3.8 17.2l3 3 7-7a5 5 0 0 0 6.6-4.6l-2.8 2.8-2.4-2.4z' }],
  gauge: [{ d: 'M4 17.4a8.6 8.6 0 1 1 16 0' }, { d: 'M12 17.4l4-5' }, { d: 'M12 17.4h.01' }],
  fuel: [{ d: 'M4.4 20.4V5.2a1.8 1.8 0 0 1 1.8-1.8h4.6a1.8 1.8 0 0 1 1.8 1.8v15.2' }, { d: 'M3 20.4h11.4' }, { d: 'M6.8 9h5.2' }, { d: 'M12.6 8.6h2.6l2.6 2.8v6.6a1.6 1.6 0 0 0 3.2 0V9.4l-2.4-2.6' }],
  tire: [{ d: 'M12 20.4a8.4 8.4 0 1 0 0-16.8 8.4 8.4 0 0 0 0 16.8' }, { d: 'M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8' }, { d: 'M12 3.6v5M12 15.4v5M3.6 12h5M15.4 12h5' }],
  battery: [{ d: 'M3 8h14.4v8H3z' }, { d: 'M19.6 10.6h1.6v2.8h-1.6' }, { d: 'M5.8 10.4v3.2M9 10.4v3.2M12.2 10.4v3.2' }],
  droplet: [{ d: 'M12 3.6c3 3.8 5.4 6.6 5.4 9.6a5.4 5.4 0 0 1-10.8 0c0-3 2.4-5.8 5.4-9.6' }],
  snowflake: [{ d: 'M12 3.6v16.8M4.8 7.8l14.4 8.4M19.2 7.8 4.8 16.2' }, { d: 'M9.6 5.4 12 7.8l2.4-2.4M9.6 18.6 12 16.2l2.4 2.4' }],
  filter: [{ d: 'M3.6 5.4h16.8l-6.6 7.6v6.4l-3.6-2v-4.4z' }],
  settings: [{ d: 'M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8' }, { d: 'M19.2 14.4l1.8 1-2 3.4-2-.8-1.6 1-.4 2.2h-4l-.4-2.2-1.6-1-2 .8-2-3.4 1.8-1v-2l-1.8-1 2-3.4 2 .8 1.6-1L9 4.6h4l.4 2.2 1.6 1 2-.8 2 3.4-1.8 1z' }],
  plus: [{ d: 'M12 5.4v13.2M5.4 12h13.2' }],
  search: [{ d: 'M10.6 17.6a7 7 0 1 0 0-14 7 7 0 0 0 0 14' }, { d: 'M15.8 15.8l4.6 4.6' }],
  calendar: [{ d: 'M3.8 5.4h16.4v15H3.8z' }, { d: 'M3.8 10h16.4M8.4 3.6v3.6M15.6 3.6v3.6' }],
  clock: [{ d: 'M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2' }, { d: 'M12 7.6v5l3.2 1.8' }],
  'alert-triangle': [{ d: 'M12 3.8 21 19.6H3z' }, { d: 'M12 9.6v4.4' }, { d: 'M12 17.2h.01' }],
  'alert-circle': [{ d: 'M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2' }, { d: 'M12 7.6v5' }, { d: 'M12 16.4h.01' }],
  'check-circle': [{ d: 'M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2' }, { d: 'M8.2 12.2l2.6 2.6 5-5.4' }],
  'x-circle': [{ d: 'M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2' }, { d: 'M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6' }],
  'chevron-right': [{ d: 'M9.4 5.6 15.8 12l-6.4 6.4' }],
  'chevron-down': [{ d: 'M5.6 9.4 12 15.8l6.4-6.4' }],
  'chevron-left': [{ d: 'M14.6 5.6 8.2 12l6.4 6.4' }],
  trash: [{ d: 'M4.6 6.6h14.8' }, { d: 'M9 6.6V4.4h6v2.2' }, { d: 'M6.4 6.6l1 14h9.2l1-14' }, { d: 'M10.4 10.6v6M13.6 10.6v6' }],
  edit: [{ d: 'M4.4 19.6h3.4L18.6 8.8a2.4 2.4 0 0 0-3.4-3.4L4.4 16.2z' }, { d: 'M14.4 6.2l3.4 3.4' }],
  download: [{ d: 'M12 3.8v11.4' }, { d: 'M7.4 10.8 12 15.4l4.6-4.6' }, { d: 'M4.4 19.6h15.2' }],
  upload: [{ d: 'M12 20.2V8.8' }, { d: 'M7.4 13.2 12 8.6l4.6 4.6' }, { d: 'M4.4 4.4h15.2' }],
  share: [
    { d: 'M6.4 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2', filled: true },
    { d: 'M17.6 9.2a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2', filled: true },
    { d: 'M17.6 20a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2', filled: true },
    { d: 'M8.6 10.8 15.4 7M8.6 13.2l6.8 3.8' },
  ],
  printer: [{ d: 'M7 8.4V3.8h10v4.6' }, { d: 'M5 8.4h14a2 2 0 0 1 2 2v6h-4' }, { d: 'M3 10.4a2 2 0 0 1 2-2' }, { d: 'M3 10.4v6h4' }, { d: 'M7 15.4h10v4.8H7z' }],
  lock: [{ d: 'M5.4 10.6h13.2v9.4H5.4z' }, { d: 'M8.4 10.6V7.4a3.6 3.6 0 0 1 7.2 0v3.2' }, { d: 'M12 14.4v2.2' }],
  fingerprint: [
    { d: 'M12 20.6c-1.4-1.6-2.2-3.6-2.2-5.6a2.2 2.2 0 1 1 4.4 0' },
    { d: 'M5.6 16.4a9.6 9.6 0 0 1-1-4.4 7.4 7.4 0 0 1 14.8 0c0 1.6-.2 3.2-.6 4.6' },
    { d: 'M8.2 19.4a12 12 0 0 1-1.2-6.6 5 5 0 0 1 10 0c0 1.4-.2 2.8-.6 4' },
  ],
  archive: [{ d: 'M3.4 4.6h17.2v4.2H3.4z' }, { d: 'M5 8.8h14v10.6H5z' }, { d: 'M9.6 12.6h4.8' }],
  camera: [{ d: 'M3.4 7.6h3.6l1.6-2.4h6.8l1.6 2.4h3.6v12H3.4z' }, { d: 'M12 17a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6' }],
  image: [{ d: 'M3.4 5h17.2v14H3.4z' }, { d: 'M8.2 12.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6' }, { d: 'M3.4 16.4l5.2-4.6 4.2 3.8 3-2.6 4.8 4.2' }],
  shield: [{ d: 'M12 3.4 20 6.2v6c0 4.4-3.2 7.6-8 9-4.8-1.4-8-4.6-8-9v-6z' }],
  bell: [{ d: 'M6.6 10.4a5.4 5.4 0 0 1 10.8 0v4.2l1.6 3.2H5l1.6-3.2z' }, { d: 'M10 20a2.2 2.2 0 0 0 4 0' }],
  tag: [{ d: 'M11 3.6H4.4v6.6l9.6 9.6 6.6-6.6z' }, { d: 'M7.6 7.4h.01' }],
  list: [{ d: 'M8.4 6.4h11.2M8.4 12h11.2M8.4 17.6h11.2' }, { d: 'M4.6 6.4h.01M4.6 12h.01M4.6 17.6h.01' }],
  clipboard: [{ d: 'M7.4 5.2H5.6v15.4h12.8V5.2h-1.8' }, { d: 'M9 3.4h6v3.6H9z' }, { d: 'M9 11.4h6M9 15h4' }],
  signature: [{ d: 'M3.6 16.4c2.4 0 3-5.2 5-5.2 1.8 0 .6 5.4 2.6 5.4 1.8 0 2-3.2 3.6-3.2 1.4 0 1 2 2.6 2 .8 0 1.6-.6 2.2-1.2' }, { d: 'M4 20h16' }],
  rotate: [{ d: 'M20 12a8 8 0 1 1-2.6-5.9' }, { d: 'M20.4 3.6v4.6h-4.6' }],
  refresh: [{ d: 'M4 12a8 8 0 0 1 13.4-5.9' }, { d: 'M20 12a8 8 0 0 1-13.4 5.9' }, { d: 'M17.6 2.8v3.6H14M6.4 21.2v-3.6H10' }],
  'map-pin': [{ d: 'M12 21c4-4.4 6-7.8 6-10.4a6 6 0 1 0-12 0c0 2.6 2 6 6 10.4' }, { d: 'M12 13.4a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6' }],
  sparkles: [{ d: 'M12 3.6l1.8 4.6 4.6 1.8-4.6 1.8L12 16.4l-1.8-4.6L5.6 10l4.6-1.8z' }, { d: 'M18.4 15.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z' }],
  truck: [{ d: 'M2.6 6.4h11v9.2h-11z' }, { d: 'M13.6 9.6h3.8l3.6 3.6v2.4h-7.4z' }, { d: 'M7 19.4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2' }, { d: 'M17 19.4a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2' }],
  'shield-check': [{ d: 'M12 3.4 20 6.2v6c0 4.4-3.2 7.6-8 9-4.8-1.4-8-4.6-8-9v-6z' }, { d: 'M8.6 11.8l2.4 2.4 4.4-4.8' }],
  'file-spreadsheet': [{ d: 'M6.4 3.4h7.2l4.4 4.4v12.8H6.4z' }, { d: 'M13.6 3.4v4.4h4.4' }, { d: 'M9 11.6h6v6H9z' }, { d: 'M9 14.6h6M12 11.6v6' }],
};

export interface IconProps {
  name: IconName;
  size?: number;
  /**
   * `ColorValue` et non `string` : la barre d'onglets de React Navigation fournit la couleur
   * de l'onglet actif sous cette forme, et `react-native-svg` accepte déjà ce type pour
   * `stroke` et `fill`. Restreindre à `string` obligeait l'appelant à convertir sans raison.
   */
  color: ColorValue;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color, strokeWidth = 1.7 }: IconProps): ReactElement {
  const shapes = ICONS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shapes.map((shape, index) => (
        <Path
          key={index}
          d={shape.d}
          fill={shape.filled === true ? color : 'none'}
          stroke={shape.filled === true ? 'none' : color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/** Icône plus épaisse, pour une pastille de couleur ou une ligne de liste dense. */
export function SmallIcon({ name, size = 16, color }: Omit<IconProps, 'strokeWidth'>): ReactElement {
  return <Icon name={name} size={size} color={color} strokeWidth={2} />;
}

export { ICONS as ICON_SHAPES };
