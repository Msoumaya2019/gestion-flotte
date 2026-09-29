/**
 * Banc du lecteur de schémas Xcode.
 *
 * ## L'invariant qui porte tout le reste
 *
 * Ce script **ne sort jamais en erreur**, et ce n'est pas une négligence : il sert à
 * *confirmer* un nom de schéma, pas à le choisir. Le nom est déjà déduit du `.xcodeproj`
 * présent sur le disque. Un contrôle de confort qui casse une compilation valide coûte plus
 * cher que le défaut qu'il surveille.
 *
 * Chaque cas de ce banc vérifie donc le code de sortie, même ceux dont le sujet est le
 * contenu de la liste. Un banc qui ne regarderait que la liste laisserait passer la
 * régression la plus coûteuse : un lecteur qui se met à échouer sur une entrée qu'il ne
 * comprend pas.
 *
 * ## Le cas qui compte le plus
 *
 * « JSON entouré de bruit ». `xcodebuild -list -json` entoure parfois son JSON
 * d'avertissements — messages de CocoaPods, note sur le trousseau. Un `JSON.parse` direct
 * échoue alors que la liste est parfaitement lisible, et l'échec se produit sur un projet
 * sain, après `pod install`, à la quinzième minute du flux.
 *
 * ## Ce qu'il n'éprouve pas
 *
 * Il ne fait pas tourner `xcodebuild` : cela demanderait un Mac, et mesurerait Xcode plutôt
 * que ce lecteur-ci. Les entrées sont celles d'`xcodebuild`, relevées sur des exécutions
 * réelles.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));
const LECTEUR = join(RACINE, 'scripts', 'lire-schemas-xcodebuild.mjs');

interface Resultat {
  code: number;
  schemas: string[];
}

/**
 * Lance le lecteur sur une entrée, et rend le code de sortie **et** la liste.
 *
 * Le code de sortie est vérifié ici, une fois pour toutes : le lecteur ne doit jamais
 * échouer, quelle que soit l'entrée. Le passer en paramètre aurait laissé chaque cas libre
 * d'oublier l'assertion.
 */
function lire(entree: string): Resultat {
  const dossier = mkdtempSync(join(tmpdir(), 'schemas-xcodebuild-'));
  try {
    const chemin = join(dossier, 'entree.txt');
    writeFileSync(chemin, entree, 'utf8');
    const resultat = spawnSync(process.execPath, [LECTEUR, chemin], { encoding: 'utf8' });
    const code = resultat.status ?? -1;

    assert.equal(
      code,
      0,
      `le lecteur ne doit jamais sortir en erreur, obtenu ${code} :\n${resultat.stdout}${resultat.stderr}`,
    );

    const schemas = resultat.stdout.split('\n').filter((l) => l !== '');
    return { code, schemas };
  } finally {
    try {
      rmSync(dossier, { recursive: true, force: true });
    } catch {
      // Sans conséquence : le dossier est dans le répertoire temporaire du système.
    }
  }
}

test('un projet d’une seule application rend son schéma', () => {
  const resultat = lire(
    JSON.stringify({ project: { name: 'Gestiondeflotte', schemes: ['Gestiondeflotte'] } }),
  );
  assert.deepEqual(resultat.schemas, ['Gestiondeflotte']);
});

test('un espace de travail rend tous ses schémas, dans l’ordre', () => {
  // L'ordre compte : c'est précisément parce que `xcodebuild -list` range les schémas des
  // pods AVEC ceux de l'application que le flux ne prend pas `schemes[0]`.
  const resultat = lire(
    JSON.stringify({ workspace: { name: 'Gestiondeflotte', schemes: ['EXConstants', 'Gestiondeflotte'] } }),
  );
  assert.deepEqual(resultat.schemas, ['EXConstants', 'Gestiondeflotte']);
});

test('un JSON entouré d’avertissements est lu quand même', () => {
  // Le cas qui compte le plus : `xcodebuild` entoure parfois son JSON de messages qui ne
  // sont pas du JSON. Un `JSON.parse` direct échouerait sur un projet parfaitement sain.
  const bruit =
    "warning: The iOS deployment target 'IPHONEOS_DEPLOYMENT_TARGET' is set to 13.4\n" +
    "    note: Using codesigning identity override\n" +
    JSON.stringify({ project: { name: 'Gestiondeflotte', schemes: ['Gestiondeflotte'] } }) +
    '\n[!] CocoaPods did not set the base configuration.\n';

  const resultat = lire(bruit);
  assert.deepEqual(resultat.schemas, ['Gestiondeflotte']);
});

test('un JSON tronqué ne fait pas échouer le lecteur, et ne rend rien', () => {
  const resultat = lire('{"project": {"schemes": ["Gestiondeflotte"');
  assert.deepEqual(resultat.schemas, []);
});

test('une entrée vide ne fait pas échouer le lecteur, et ne rend rien', () => {
  assert.deepEqual(lire('').schemas, []);
});

test('l’absence de la clé schemes ne fait pas échouer le lecteur', () => {
  assert.deepEqual(lire(JSON.stringify({ project: { name: 'Gestiondeflotte' } })).schemas, []);
});

test('une liste de schémas vide ne rend rien', () => {
  assert.deepEqual(lire(JSON.stringify({ project: { schemes: [] } })).schemas, []);
});

test('un schéma vide ou non textuel est ignoré, sans faire échouer le lecteur', () => {
  // Le but de ce cas : une entrée malformée au milieu d'une liste valide ne doit pas
  // emporter les autres. Un nom de schéma vide deviendrait un argument vide dans
  // `xcodebuild -scheme`, ce qui produirait un message d'erreur sans rapport.
  const resultat = lire(
    JSON.stringify({ project: { schemes: ['', '   ', 'Gestiondeflotte', 42, null] } }),
  );
  assert.deepEqual(resultat.schemas, ['Gestiondeflotte']);
});
