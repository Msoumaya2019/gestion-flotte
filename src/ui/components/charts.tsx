/**
 * Graphiques.
 *
 * ## Pourquoi dessiner soi-même
 *
 * Une bibliothèque de graphiques pèse lourd, impose son style et ses animations, et rend
 * difficile d'obtenir exactement la sobriété voulue ici. Ces deux figures — des barres et
 * un anneau — couvrent le besoin réel : voir une tendance sur douze mois, et lire un
 * pourcentage de récupération d'investissement.
 *
 * ## La règle de lisibilité
 *
 * Un graphique sans repère ne dit rien. Les barres portent donc un axe à zéro, la plus
 * haute est étiquetée, et l'échelle est **commune** aux deux séries comparées : deux
 * échelles différentes feraient paraître des dépenses minuscules plus hautes que des
 * recettes, ce qui est exactement l'inverse du message.
 */

import { Fragment, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { spacing } from '../theme';
import { useTheme } from '../use-theme';
import { AppText } from './text';

export interface BarDatum {
  label: string;
  /** Valeur principale — les recettes, par exemple. */
  value: number;
  /** Valeur comparée — les dépenses. */
  secondary?: number;
}

export interface BarChartProps {
  data: readonly BarDatum[];
  height?: number;
  primaryColor?: string;
  secondaryColor?: string;
  /** Rend une valeur en texte. Par défaut, un entier en euros. */
  format?: (value: number) => string;
}

/**
 * Barres groupées.
 *
 * Les valeurs sont des **centimes**, mais le graphique ne fait aucune hypothèse sur
 * l'unité : il ne manipule que des nombres et délègue l'affichage à `format`.
 */
export function BarChart({
  data,
  height = 150,
  primaryColor,
  secondaryColor,
  format,
}: BarChartProps): ReactElement {
  const { colors } = useTheme();
  const primary = primaryColor ?? colors.primary;
  const secondary = secondaryColor ?? colors.danger;

  const width = 320;
  const paddingLeft = 4;
  const paddingRight = 4;
  const labelHeight = 18;
  const plotHeight = height - labelHeight;

  const hasSecondary = data.some((datum) => datum.secondary !== undefined);
  // Échelle commune : c'est la condition pour que la comparaison ait un sens.
  const maximum = Math.max(
    1,
    ...data.map((datum) => Math.max(datum.value, datum.secondary ?? 0)),
  );

  const slot = (width - paddingLeft - paddingRight) / Math.max(1, data.length);
  const barWidth = hasSecondary ? Math.max(2, slot * 0.28) : Math.max(3, slot * 0.5);
  const gap = hasSecondary ? Math.max(1, slot * 0.06) : 0;

  function barHeight(value: number): number {
    return Math.max(value > 0 ? 2 : 0, (value / maximum) * (plotHeight - 6));
  }

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Ligne de base : sans elle, une barre courte et une barre nulle se confondent. */}
        <Line
          x1={paddingLeft}
          y1={plotHeight}
          x2={width - paddingRight}
          y2={plotHeight}
          stroke={colors.border}
          strokeWidth={1}
        />
        {data.map((datum, index) => {
          const slotStart = paddingLeft + index * slot;
          const primaryHeight = barHeight(datum.value);
          const secondaryHeight = datum.secondary === undefined ? 0 : barHeight(datum.secondary);
          const groupWidth = hasSecondary ? barWidth * 2 + gap : barWidth;
          const groupStart = slotStart + (slot - groupWidth) / 2;

          return (
            <Fragment key={`${datum.label}-${index}`}>
              <Rect
                x={groupStart}
                y={plotHeight - primaryHeight}
                width={barWidth}
                height={primaryHeight}
                rx={2}
                fill={primary}
              />
              {hasSecondary ? (
                <Rect
                  x={groupStart + barWidth + gap}
                  y={plotHeight - secondaryHeight}
                  width={barWidth}
                  height={secondaryHeight}
                  rx={2}
                  fill={secondary}
                />
              ) : null}
            </Fragment>
          );
        })}
      </Svg>
      <View style={styles.axis}>
        {data.map((datum, index) => (
          <AppText
            key={`${datum.label}-axis-${index}`}
            variant="caption"
            color="textFaint"
            align="center"
            style={{ flex: 1 }}
            numberOfLines={1}
          >
            {datum.label}
          </AppText>
        ))}
      </View>
      {format === undefined ? null : (
        <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
          {`Maximum : ${format(maximum)}`}
        </AppText>
      )}
    </View>
  );
}

/** Légende du graphique. */
export function ChartLegend({
  items,
}: {
  items: readonly { label: string; color: string }[];
}): ReactElement {
  return (
    <View style={styles.legend}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: item.color }]} />
          <AppText variant="caption" color="textMuted">
            {item.label}
          </AppText>
        </View>
      ))}
    </View>
  );
}

/**
 * Anneau de progression.
 *
 * `ratio` est borné à `[0, 1]` : un investissement récupéré à plus de 100 % doit afficher
 * un anneau complet, pas un arc qui se referme sur lui-même.
 */
export function ProgressRing({
  ratio,
  size = 96,
  strokeWidth = 10,
  color,
  trackColor,
  label,
  caption,
}: {
  ratio: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label: string;
  caption?: string;
}): ReactElement {
  const { colors } = useTheme();
  const active = color ?? colors.primary;
  const track = trackColor ?? colors.surfaceSunken;
  const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;

  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={center} cy={center} r={radius} stroke={track} strokeWidth={strokeWidth} fill="none" />
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={active}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clamped)}
            // Le départ est placé en haut de l'anneau, comme une jauge de montre.
            transform={`rotate(-90 ${center} ${center})`}
          />
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.ringLabel]}>
          <AppText variant="title" tabular>
            {label}
          </AppText>
        </View>
      </View>
      {caption === undefined ? null : (
        <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }} align="center">
          {caption}
        </AppText>
      )}
    </View>
  );
}

/**
 * Courbe simple, pour une évolution.
 *
 * Un seul chemin, sans axes ni graduations : elle sert à montrer une **forme**, pas à lire
 * une valeur précise — les valeurs sont dans la liste juste en dessous.
 */
export function SparkLine({
  values,
  height = 48,
  color,
}: {
  values: readonly number[];
  height?: number;
  color?: string;
}): ReactElement {
  const { colors } = useTheme();
  const active = color ?? colors.primary;

  if (values.length < 2) {
    return <View style={{ height }} />;
  }

  const width = 300;
  const maximum = Math.max(...values);
  const minimum = Math.min(...values, 0);
  const span = maximum - minimum === 0 ? 1 : maximum - minimum;
  const step = width / (values.length - 1);

  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 4 - ((value - minimum) / span) * (height - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path
        d={`M${points.join(' L')}`}
        fill="none"
        stroke={active}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Étiquette de valeur posée sur un graphique. */
export function ChartLabel({ x, y, text, color }: { x: number; y: number; text: string; color: string }): ReactElement {
  return (
    <SvgText x={x} y={y} fill={color} fontSize={10} textAnchor="middle">
      {text}
    </SvgText>
  );
}

const styles = StyleSheet.create({
  axis: { flexDirection: 'row', marginTop: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: spacing.lg },
  swatch: { width: 9, height: 9, borderRadius: 2, marginRight: 5 },
  ringLabel: { alignItems: 'center', justifyContent: 'center' },
});
