/**
 * Export CSV.
 *
 * Deux contraintes dictent l'écriture :
 *
 * - **Séparateur point-virgule et décimales à la française.** Un CSV ouvert directement
 *   dans Excel en configuration française coupe sur la virgule ; en écrivant des
 *   décimales à la française avec un point-virgule comme séparateur, le fichier s'ouvre
 *   correctement sans assistant d'importation.
 * - **Neutralisation des formules.** Une cellule commençant par `=`, `+`, `-` ou `@` est
 *   interprétée comme une formule par Excel et par LibreOffice. Un commentaire saisi par
 *   l'utilisateur peut donc devenir du code exécuté sur sa machine. On préfixe ces
 *   cellules d'une apostrophe.
 */

export function csvEscape(value: string, separator = ';'): string {
  const dangerous = /^[=+\-@\t\r]/.test(value);
  const guarded = dangerous ? `'${value}` : value;
  if (guarded.includes(separator) || guarded.includes('"') || guarded.includes('\n') || guarded.includes('\r')) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

export function toCsv(
  columns: readonly { label: string }[],
  rows: readonly (readonly (string | number | null)[])[],
  separator = ';',
): string {
  const lines: string[] = [columns.map((column) => csvEscape(column.label, separator)).join(separator)];
  for (const row of rows) {
    lines.push(
      row
        .map((cell) => {
          if (cell === null) return '';
          if (typeof cell === 'number') return String(cell).replace('.', ',');
          return csvEscape(cell, separator);
        })
        .join(separator),
    );
  }
  // Un CSV se termine par un saut de ligne : sans lui, certains outils perdent la dernière ligne.
  return `${lines.join('\r\n')}\r\n`;
}

/** Montant en centimes rendu en euros décimaux, pour une colonne de tableur. */
export function centsToCsv(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Nom de fichier sûr.
 *
 * Le point délicat n'est pas de retirer les caractères interdits, c'est d'empêcher un nom
 * de désigner un **autre dossier**. `../../etc/passwd` ne doit pas produire un chemin qui
 * remonte : on retire donc aussi les points et tirets de tête, qui forment `..` et `-`.
 * Un nom qui commence par un point est de surcroît caché sur les systèmes Unix.
 */
export function safeFileName(base: string, extension: string): string {
  const cleaned = base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.\-]+/, '')
    .replace(/[.\-]+$/, '')
    .replace(/\.{2,}/g, '.')
    .toLowerCase();
  return `${cleaned === '' ? 'export' : cleaned}.${extension}`;
}
