/**
 * Fabrique de documents HTML.
 *
 * Les PDF sont produits par `expo-print`, qui rend du HTML dans un moteur de navigateur.
 * Ce module porte la coquille commune — styles d'impression A4, en-tête, pied de page —
 * partagée par le contrat et les états financiers. Le HTML est **fabriqué à la main**,
 * sans bibliothèque de gabarits : quelques substitutions de chaînes suffisent, et cela
 * évite une dépendance de plus dans un bundle déjà lourd.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Remplace les `{{cle}}` d'un texte. Une clé inconnue est laissée visible : une coquille
 *  dans un gabarit doit se voir sur le PDF, pas disparaître en silence. */
export function interpolate(template: string, variables: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value === undefined ? match : value;
  });
}

export const BASE_STYLES = `
  @page { size: A4; margin: 16mm 14mm 18mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    font-size: 10.5pt; line-height: 1.5; color: #14171f; background: #ffffff;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1 { font-size: 20pt; margin: 0 0 2mm; letter-spacing: -0.02em; }
  h2 { font-size: 12pt; margin: 7mm 0 2mm; padding-bottom: 1.5mm; border-bottom: 0.6pt solid #d7dbe4; }
  h3 { font-size: 10.5pt; margin: 4mm 0 1.5mm; }
  p { margin: 0 0 2.5mm; text-align: justify; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; margin-bottom: 6mm; }
  .doc-header .party { font-size: 9.5pt; line-height: 1.45; }
  .doc-header .party strong { display: block; font-size: 11pt; margin-bottom: 0.5mm; }
  .doc-title { text-align: center; margin: 6mm 0 5mm; }
  .doc-title .kicker { font-size: 8.5pt; letter-spacing: 0.16em; text-transform: uppercase; color: #6b7280; }
  .doc-title h1 { margin-top: 1.5mm; }
  .doc-title .reference { font-size: 9.5pt; color: #6b7280; margin-top: 1mm; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 3mm; }
  th, td { text-align: left; padding: 2mm 2.5mm; border-bottom: 0.5pt solid #e5e8ee; vertical-align: top; }
  th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; font-weight: 600; }
  td.label { color: #6b7280; width: 42%; }
  td.value { font-weight: 600; }
  .grid { display: flex; gap: 6mm; }
  .grid > * { flex: 1; }
  .box { border: 0.6pt solid #d7dbe4; border-radius: 2mm; padding: 3mm 3.5mm; }
  .box h3 { margin-top: 0; }
  .totals td.value { font-variant-numeric: tabular-nums; }
  .totals tr.grand-total td { border-top: 1pt solid #14171f; border-bottom: none; font-size: 12pt; font-weight: 700; padding-top: 2.5mm; }
  .clause { margin-bottom: 3.5mm; page-break-inside: avoid; }
  .clause h3 { margin-bottom: 1mm; }
  .badge { display: inline-block; font-size: 8.5pt; padding: 0.6mm 2mm; border-radius: 6mm; border: 0.5pt solid currentColor; }
  .badge.ok { color: #067647; }
  .badge.warn { color: #b54708; }
  .badge.danger { color: #b42318; }
  .badge.neutral { color: #475467; }
  .signatures { display: flex; gap: 8mm; margin-top: 8mm; page-break-inside: avoid; }
  .signature { flex: 1; }
  .signature .frame { height: 30mm; border: 0.6pt solid #d7dbe4; border-radius: 2mm; margin-bottom: 2mm; display: flex; align-items: center; justify-content: center; }
  .signature .caption { font-size: 9pt; color: #6b7280; }
  .signature .name { font-weight: 600; font-size: 10pt; }
  .muted { color: #6b7280; }
  .small { font-size: 9pt; }
  .footer { margin-top: 8mm; padding-top: 3mm; border-top: 0.6pt solid #e5e8ee; font-size: 8.5pt; color: #6b7280; }
  .page-break { page-break-before: always; }
  .avoid-break { page-break-inside: avoid; }
  .kpi-row { display: flex; gap: 3mm; margin-bottom: 4mm; }
  .kpi { flex: 1; border: 0.6pt solid #d7dbe4; border-radius: 2mm; padding: 3mm; }
  .kpi .kpi-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #6b7280; }
  .kpi .kpi-value { font-size: 14pt; font-weight: 700; margin-top: 1mm; font-variant-numeric: tabular-nums; }
  .kpi .kpi-value.ok { color: #067647; }
  .kpi .kpi-value.danger { color: #b42318; }
`;

export interface HtmlDocumentOptions {
  title: string;
  body: string;
  extraStyles?: string;
}

export function htmlDocument(options: HtmlDocumentOptions): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(options.title)}</title>
<style>${BASE_STYLES}${options.extraStyles ?? ''}</style>
</head>
<body>
${options.body}
</body>
</html>`;
}

/** Deux colonnes « libellé / valeur » à partir d'une liste de paires. */
export function definitionTable(rows: readonly (readonly [string, string])[]): string {
  const body = rows
    .map(([label, value]) => `<tr><td class="label">${escapeHtml(label)}</td><td class="value">${escapeHtml(value)}</td></tr>`)
    .join('');
  return `<table class="totals">${body}</table>`;
}
