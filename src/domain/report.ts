/**
 * États financiers imprimables : bilan d'une location, bilan d'un véhicule, bilan de flotte.
 *
 * Un seul gabarit sert les trois : une suite de sections, chacune portant soit des tuiles
 * d'indicateurs, soit un tableau libellé/valeur, soit un tableau à colonnes. Cela évite
 * trois mises en page à maintenir en parallèle pour le même rendu.
 */

import { formatDateTimeFr, formatLongFr } from './dates';
import { escapeHtml, htmlDocument } from './html';

export type ReportTone = 'neutral' | 'ok' | 'danger' | 'warn';

export interface ReportKpi {
  label: string;
  value: string;
  tone?: ReportTone;
}

export interface ReportTable {
  columns: readonly string[];
  rows: readonly (readonly string[])[];
  /** Aligner les colonnes numériques à droite, à partir de cet index. */
  numericFrom?: number;
}

export interface ReportSection {
  title: string;
  kpis?: readonly ReportKpi[];
  pairs?: readonly (readonly [string, string])[];
  table?: ReportTable;
  paragraphs?: readonly string[];
}

export interface ReportInput {
  title: string;
  subtitle: string;
  generatedAt: string;
  /** Date de référence affichée en pied de page. */
  referenceDate: string;
  sections: readonly ReportSection[];
  /** Mention libre en pied de document. */
  footerNote?: string;
}

function renderKpis(kpis: readonly ReportKpi[]): string {
  return `<div class="kpi-row">${kpis
    .map(
      (kpi) =>
        `<div class="kpi"><div class="kpi-label">${escapeHtml(kpi.label)}</div><div class="kpi-value ${kpi.tone ?? 'neutral'}">${escapeHtml(kpi.value)}</div></div>`,
    )
    .join('')}</div>`;
}

function renderPairs(pairs: readonly (readonly [string, string])[]): string {
  return `<table class="totals">${pairs
    .map(
      ([label, value]) =>
        `<tr><td class="label">${escapeHtml(label)}</td><td class="value">${escapeHtml(value)}</td></tr>`,
    )
    .join('')}</table>`;
}

function renderTable(table: ReportTable): string {
  const numericFrom = table.numericFrom ?? table.columns.length;
  const head = table.columns
    .map((column, index) => `<th style="text-align:${index >= numericFrom ? 'right' : 'left'}">${escapeHtml(column)}</th>`)
    .join('');
  const body = table.rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, index) =>
              `<td style="text-align:${index >= numericFrom ? 'right' : 'left'}${index === 0 ? ';font-weight:600' : ''}">${escapeHtml(cell)}</td>`,
          )
          .join('')}</tr>`,
    )
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

export function renderReportHtml(input: ReportInput): string {
  const sections = input.sections
    .map((section) => {
      const parts: string[] = [`<h2>${escapeHtml(section.title)}</h2>`];
      if (section.kpis !== undefined && section.kpis.length > 0) parts.push(renderKpis(section.kpis));
      if (section.paragraphs !== undefined) {
        for (const paragraph of section.paragraphs) parts.push(`<p class="small">${escapeHtml(paragraph)}</p>`);
      }
      if (section.pairs !== undefined && section.pairs.length > 0) parts.push(renderPairs(section.pairs));
      if (section.table !== undefined) parts.push(renderTable(section.table));
      return `<div class="avoid-break">${parts.join('')}</div>`;
    })
    .join('');

  const body = `
  <div class="doc-title">
    <div class="kicker">Gestion de flotte</div>
    <h1>${escapeHtml(input.title)}</h1>
    <div class="reference">${escapeHtml(input.subtitle)}</div>
  </div>
  ${sections}
  <div class="footer">
    Établi le ${escapeHtml(formatLongFr(input.referenceDate))} à ${escapeHtml(formatDateTimeFr(input.generatedAt).split(' à ')[1] ?? '')}.
    ${input.footerNote === undefined ? '' : escapeHtml(input.footerNote)}
  </div>`;

  return htmlDocument({ title: input.title, body });
}

/** Tableau de comparaison de plusieurs véhicules, prêt à rendre en PDF. */
export function vehicleComparisonTable(
  rows: readonly {
    label: string;
    revenue: string;
    expense: string;
    net: string;
    monthly: string;
    recovered: string;
  }[],
): ReportTable {
  return {
    columns: ['Véhicule', 'Revenus', 'Dépenses', 'Résultat net', 'Moyenne / mois', 'Investissement récupéré'],
    rows: rows.map((row) => [row.label, row.revenue, row.expense, row.net, row.monthly, row.recovered]),
    numericFrom: 1,
  };
}
