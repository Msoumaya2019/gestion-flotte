/**
 * Recherche globale.
 *
 * Le corpus est aplati en « documents » indexables : chaque entité à chercher devient un
 * objet portant un type, un titre, un sous-titre, la route à ouvrir et les champs dans
 * lesquels chercher. Le tri se fait par qualité de correspondance, pas par ordre
 * alphabétique : une plaque saisie exactement doit sortir avant un commentaire qui la
 * mentionne.
 */

export type SearchKind = 'vehicule' | 'locataire' | 'contrat' | 'location' | 'depense' | 'paiement' | 'entretien' | 'document';

export interface SearchDocument {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string;
  /** Route à ouvrir au tapotement. */
  href: string;
  /** Champs indexés, en plus du titre et du sous-titre. */
  fields: string[];
}

export interface SearchHit extends SearchDocument {
  score: number;
  matchedIn: 'titre' | 'sous-titre' | 'champ';
}

/** Minuscules sans accents, espaces normalisés : « Corolla » et « corollá » se rejoignent. */
export function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s\-_.]+/g, ' ')
    .trim();
}

function scoreField(needle: string, haystack: string): number {
  const normalized = normalize(haystack);
  if (normalized === '') return 0;
  if (normalized === needle) return 100;
  if (normalized.startsWith(needle)) return 70;
  if (normalized.includes(needle)) return 45;
  // Correspondance par mots : « corolla touring » doit trouver « Corolla Touring Sports ».
  const words = needle.split(' ').filter((word) => word.length > 1);
  if (words.length > 1 && words.every((word) => normalized.includes(word))) return 35;
  return 0;
}

export function searchDocuments(
  query: string,
  documents: readonly SearchDocument[],
  limit = 60,
): SearchHit[] {
  const needle = normalize(query);
  if (needle === '') return [];

  const hits: SearchHit[] = [];
  for (const document of documents) {
    const titleScore = scoreField(needle, document.title);
    const subtitleScore = scoreField(needle, document.subtitle) * 0.6;
    let fieldScore = 0;
    for (const field of document.fields) {
      fieldScore = Math.max(fieldScore, scoreField(needle, field) * 0.4);
    }
    const score = Math.max(titleScore, subtitleScore, fieldScore);
    if (score <= 0) continue;
    hits.push({
      ...document,
      score,
      matchedIn: titleScore >= Math.max(subtitleScore, fieldScore) ? 'titre' : subtitleScore >= fieldScore ? 'sous-titre' : 'champ',
    });
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'fr'));
  return hits.slice(0, limit);
}
