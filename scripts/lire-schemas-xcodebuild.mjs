/**
 * Lit la liste des schémas d'un projet Xcode depuis la sortie de `xcodebuild -list -json`.
 *
 * ## Pourquoi un script, et pas un one-liner
 *
 * Le code qui lit cette sortie doit tenir dans un `run:` de flux de travail. Écrit en
 * `node -e "…"` **multiligne**, il commence à la colonne 0 par nécessité de lisibilité — et
 * un `run: |` est un bloc scalaire : toute ligne à la colonne 0 le termine, et le fichier
 * YAML devient invalide. GitHub répond alors « Implicit keys need to be on a single line at
 * line N, column 1 », un message qui nomme une ligne du YAML et jamais la cause.
 *
 * Sorti dans un script, il s'éprouve en une seconde sur un banc, au lieu de ne se corriger
 * qu'en relançant une compilation de quinze minutes.
 *
 * ## Tolérance, et pourquoi elle est obligatoire
 *
 * `xcodebuild -list -json` **entoure parfois son JSON d'avertissements** — des messages de
 * CocoaPods, une note sur le trousseau de clés. Un `JSON.parse` direct échoue alors que la
 * liste est parfaitement lisible. On cherche donc la première accolade ouvrante et la
 * dernière fermante.
 *
 * Et le script **ne sort jamais en erreur** : il sert à *confirmer* un nom de schéma, pas à
 * le choisir. Le nom est déjà déduit du `.xcodeproj` présent sur le disque. Un contrôle de
 * confort qui casse une compilation valide coûte plus cher que le défaut qu'il surveille —
 * c'est à l'appelant de décider quoi faire d'une liste vide.
 *
 * Usage :
 *   xcodebuild -list -json | node scripts/lire-schemas-xcodebuild.mjs
 */

import { readFileSync } from 'node:fs';

function main() {
  let entree = '';
  try {
    // Sans argument : lire l'entrée standard. Avec : lire le fichier nommé — ce qui rend
    // le script éprouvable sur un banc, sans tuyau.
    entree = process.argv[2] === undefined ? readFileSync(0, 'utf8') : readFileSync(process.argv[2], 'utf8');
  } catch {
    // Rien à lire : on ne dit rien et on rend une liste vide. Voir l'en-tête.
    return;
  }

  const debut = entree.indexOf('{');
  const fin = entree.lastIndexOf('}');
  if (debut === -1 || fin === -1 || fin <= debut) return;

  let donnees;
  try {
    donnees = JSON.parse(entree.slice(debut, fin + 1));
  } catch {
    return;
  }

  // Selon la version d'Xcode, les schémas vivent sous `project` ou sous `workspace`.
  const schemas = donnees?.project?.schemes ?? donnees?.workspace?.schemes ?? [];
  if (!Array.isArray(schemas)) return;

  for (const schema of schemas) {
    if (typeof schema === 'string' && schema.trim() !== '') {
      process.stdout.write(`${schema}\n`);
    }
  }
}

main();
