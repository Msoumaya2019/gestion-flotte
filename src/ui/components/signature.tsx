/**
 * Zone de signature au doigt.
 *
 * ## Le repère, et pourquoi il est fixe
 *
 * Les tracés sont enregistrés dans un repère **1000 × 400**, indépendant de la taille réelle
 * du cadre. Une signature dessinée sur un iPhone SE occupe donc la même place relative que
 * la même signature dessinée sur un iPhone Pro Max — et surtout, un contrat signé reste
 * lisible si on le régénère plus tard sur un appareil de taille différente. Enregistrer des
 * coordonnées en points d'écran lierait le document à l'appareil qui l'a produit.
 *
 * ## Ce qui est enregistré
 *
 * Les chaînes `d` des tracés, au format SVG, dans le même format que celui attendu par le
 * gabarit du contrat (`SignaturePayload`). Rien d'autre : pas d'image, pas de bitmap. Une
 * signature vectorielle pèse quelques centaines d'octets et s'imprime proprement à
 * n'importe quelle taille.
 *
 * ## Le geste
 *
 * `PanResponder` plutôt qu'une bibliothèque de gestes : le besoin est un tracé continu, sans
 * vélocité ni multi-touch. Ajouter une dépendance pour cela ne se justifierait pas, et
 * `PanResponder` est fourni par React Native.
 */

import { useMemo, useRef, useState, type ReactElement } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { parseSignature } from '@/domain/contract';
import { radius, spacing } from '../theme';
import { useTheme } from '../use-theme';
import { AppText } from './text';

/** Repère des tracés. Voir l'en-tête : c'est le contrat qui l'impose. */
const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 400;

export interface SignaturePadProps {
  /**
   * Signature enregistrée, telle qu'elle est stockée en base.
   *
   * Elle est lue **au montage** : ensuite, c'est la zone qui fait autorité, et une valeur
   * modifiée par le parent n'écraserait pas un tracé en cours. Les écrans qui l'utilisent
   * disposent des données avant le premier rendu, donc le cas ne se présente pas.
   */
  value: string | null;
  /** Reçoit la signature sérialisée, ou `null` si la zone a été effacée. */
  onChange: (raw: string | null) => void;
  /** Libellé au-dessus de la zone. */
  label: string;
  height?: number;
  /** Signature de l'appareil : la zone est en lecture seule. */
  readOnly?: boolean;
}

function serialize(paths: readonly string[]): string | null {
  if (paths.length === 0) return null;
  return JSON.stringify({ width: VIEWBOX_WIDTH, height: VIEWBOX_HEIGHT, paths });
}

export function SignaturePad({
  value,
  onChange,
  label,
  height = 180,
  readOnly = false,
}: SignaturePadProps): ReactElement {
  const { colors } = useTheme();

  /**
   * Les tracés vivent dans une référence, et un compteur force le rendu : `PanResponder`
   * lit et écrit à chaque déplacement du doigt, et passer par l'état à chaque point
   * déclencherait un rendu par pixel parcouru.
   *
   * Le compteur n'est pas décoratif : il est passé en `key` au `Svg`, donc changer sa
   * valeur le reconstruit. C'est ce qui fait apparaître le tracé sous le doigt.
   */
  const pathsRef = useRef<string[]>(parseSignature(value)?.paths ?? []);
  const currentRef = useRef<string | null>(null);
  /**
   * Le compteur **est** lu : il sert de `key` au `Svg`, ce qui le reconstruit après une
   * mutation de référence. Le jeter avec `const [, setTick]` laissait `tick` introuvable —
   * et le tracé ne se serait pas rafraîchi pendant le geste.
   */
  const [tick, setTick] = useState(0);

  const sizeRef = useRef({ width: 0, height: 0 });

  /** Convertit un point de l'écran vers le repère du contrat. */
  function toPad(x: number, y: number): { x: number; y: number } {
    const { width, height: frameHeight } = sizeRef.current;
    if (width <= 0 || frameHeight <= 0) return { x: 0, y: 0 };
    return {
      x: Math.round((x / width) * VIEWBOX_WIDTH),
      y: Math.round((y / frameHeight) * VIEWBOX_HEIGHT),
    };
  }

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !readOnly,
        onMoveShouldSetPanResponder: () => !readOnly,
        onPanResponderGrant: (event) => {
          const point = toPad(event.nativeEvent.locationX, event.nativeEvent.locationY);
          currentRef.current = `M ${point.x} ${point.y}`;
          pathsRef.current = [...pathsRef.current, currentRef.current];
          setTick((value) => value + 1);
        },
        onPanResponderMove: (event) => {
          if (currentRef.current === null) return;
          const point = toPad(event.nativeEvent.locationX, event.nativeEvent.locationY);
          currentRef.current = `${currentRef.current} L ${point.x} ${point.y}`;
          pathsRef.current = [...pathsRef.current.slice(0, -1), currentRef.current];
          setTick((value) => value + 1);
        },
        onPanResponderRelease: () => {
          currentRef.current = null;
          onChange(serialize(pathsRef.current));
        },
        onPanResponderTerminate: () => {
          currentRef.current = null;
          onChange(serialize(pathsRef.current));
        },
      }),
    // `toPad` et `onChange` lisent des références : les recréer à chaque rendu ne change
    // rien au geste, et reconstruire le responder en plein tracé le couperait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [readOnly],
  );

  function clear(): void {
    pathsRef.current = [];
    currentRef.current = null;
    setTick((value) => value + 1);
    onChange(null);
  }

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={styles.labelRow}>
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
        {readOnly || pathsRef.current.length === 0 ? null : (
          <AppText variant="caption" color="primary" onPress={clear}>
            Effacer
          </AppText>
        )}
      </View>

      <View
        {...(readOnly ? {} : responder.panHandlers)}
        onLayout={(event) => {
          sizeRef.current = {
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          };
        }}
        style={[
          styles.frame,
          {
            height,
            borderColor: colors.border,
            backgroundColor: readOnly ? colors.surfaceAlt : colors.surface,
          },
        ]}
      >
        {pathsRef.current.length === 0 ? (
          <View style={styles.placeholder} pointerEvents="none">
            <AppText variant="caption" color="textFaint">
              {readOnly ? 'Non signé' : 'Signez ici avec le doigt'}
            </AppText>
          </View>
        ) : null}
        <Svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          // Le compteur sert uniquement à forcer le rendu après une mutation de référence.
          key={tick}
        >
          {pathsRef.current.map((path, index) => (
            <Path
              key={`${index}-${path.length}`}
              d={path}
              fill="none"
              stroke={colors.text}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </Svg>
      </View>

      <AppText variant="caption" color="textFaint" style={{ marginTop: 4 }}>
        Le tracé est enregistré en vectoriel, dans un repère indépendant de la taille de
        l’écran : la signature s’imprime nette à n’importe quel format.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  frame: {
    borderWidth: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  /** Le texte d'invite est centré et ne capte pas le geste : c'est la zone qui l'écoute. */
  placeholder: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
