/**
 * Banc du contrôle des permissions natives.
 *
 * ## Le cas qui compte le plus
 *
 * Le contrôle s'appuyait d'abord sur un `grep` du fichier de sortie. Il échouait sur une
 * configuration **correcte**, parce que la chaîne `android.permission.CAMERA` y figure —
 * dans une entrée qui la **retire** du manifeste. « Déclarée » et « retirée » s'écrivent
 * avec les mêmes caractères : seule la position dans la structure les distingue.
 *
 * Le cas « un retrait sans tools:node est signalé » est donc le cœur de ce banc. Il vérifie
 * que le contrôle lit bien les listes, et non le texte — c'est-à-dire qu'il aurait attrapé
 * le défaut réel, et non seulement ceux qu'on a fabriqués pour lui.
 *
 * ## Ce qu'il n'éprouve pas
 *
 * Il ne fait pas tourner `expo config --type introspect` : cela demanderait l'outil, et
 * mesurerait autant Expo que ce contrôle-ci. Les configurations sont fabriquées, à la forme
 * de ce que la commande produit — forme relevée sur une exécution réelle.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTROLE = join(RACINE, 'scripts', 'verifier-permissions.mjs');

/** Une entrée de manifeste Android, telle que l'introspection la produit. */
interface EntreeManifeste {
  $: Record<string, string>;
}

interface ConfigNative {
  ios: { infoPlist: Record<string, string> };
  android: { permissions: string[] };
  /** Chemin **interne** : c'est là que l'introspection dépose le résultat des greffons. */
  _internal?: {
    modResults: { android: { manifest: { manifest: { 'uses-permission': EntreeManifeste[] } } } };
  };
}

interface Resultat {
  code: number;
  sortie: string;
}

/** Une configuration conforme, à la forme de ce que produit l'introspection. */
function configConforme(): ConfigNative {
  return {
    ios: {
      infoPlist: {
        NSPhotoLibraryUsageDescription: 'Pour choisir une image.',
        NSFaceIDUsageDescription: 'Pour protéger vos documents.',
      },
    },
    android: {
      permissions: ['android.permission.USE_BIOMETRIC', 'android.permission.INTERNET'],
    },
    _internal: {
      modResults: {
        android: {
          manifest: {
            manifest: {
              'uses-permission': [
                { $: { 'android:name': 'android.permission.RECORD_AUDIO', 'tools:node': 'remove' } },
                { $: { 'android:name': 'android.permission.CAMERA', 'tools:node': 'remove' } },
              ],
            },
          },
        },
      },
    },
  };
}

/**
 * Les entrées de manifeste de la configuration de banc.
 *
 * Passe par une garde plutôt que par une assertion non nulle : si la fixture perdait ses
 * résultats de greffons, le banc échouerait avec un message clair au lieu de comparer des
 * valeurs `undefined`.
 */
function entreesDe(config: ConfigNative): EntreeManifeste[] {
  const manifeste = config._internal?.modResults.android.manifest.manifest;
  assert.ok(manifeste !== undefined, 'la configuration de banc doit porter des résultats de greffons');
  return manifeste['uses-permission'];
}

function executer(chemin: string): Resultat {
  const resultat = spawnSync(process.execPath, [CONTROLE, chemin], { encoding: 'utf8' });
  return { code: resultat.status ?? -1, sortie: `${resultat.stdout}${resultat.stderr}` };
}

/** Analyse une configuration fabriquée, dans un dossier temporaire. */
function analyser(config: unknown): Resultat {
  return surUnFichier('config.json', JSON.stringify(config, null, 2));
}

function surUnFichier(nom: string, contenu: string): Resultat {
  const dossier = mkdtempSync(join(tmpdir(), 'permissions-'));
  try {
    const chemin = join(dossier, nom);
    writeFileSync(chemin, contenu, 'utf8');
    return executer(chemin);
  } finally {
    try {
      rmSync(dossier, { recursive: true, force: true });
    } catch {
      // Sans conséquence : le dossier est dans le répertoire temporaire du système.
    }
  }
}

test('une configuration conforme passe — c’est le témoin', () => {
  // Sans ce cas, un contrôle qui refuserait toute configuration passerait pour concluant.
  const resultat = analyser(configConforme());
  assert.equal(resultat.code, 0, `attendu 0, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /appareil photo et microphone absents/);
});

test('une chaîne présente mais retirée ne fait pas échouer le contrôle', () => {
  // Le défaut réel du premier contrôle : un `grep` trouvait `android.permission.CAMERA`
  // dans l'entrée qui la **retire**, et accusait une configuration correcte.
  const resultat = analyser(configConforme());
  assert.equal(resultat.code, 0, `attendu 0, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.doesNotMatch(resultat.sortie, /\[android-retrait-absent\]/);
});

test('un retrait sans tools:node est signalé', () => {
  // Le pendant du cas précédent : la permission est bien présente dans le manifeste
  // évalué, mais rien ne la retire — elle serait donc déclarée.
  const config = configConforme();
  entreesDe(config)[0] = { $: { 'android:name': 'android.permission.CAMERA' } };

  const resultat = analyser(config);
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[android-retrait-absent\]/);
  // L'autre permission, correctement retirée, ne doit rien déclencher : une seule fautive.
  assert.equal([...resultat.sortie.matchAll(/\[android-retrait-absent\]/g)].length, 1);
});

test('une permission Android interdite déclarée est signalée', () => {
  const config = configConforme();
  config.android.permissions.push('android.permission.CAMERA');
  const resultat = analyser(config);
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[android-permission-interdite\]/);
});

test('une description d’usage iOS manquante est signalée', () => {
  const config = configConforme();
  delete config.ios.infoPlist.NSFaceIDUsageDescription;
  const resultat = analyser(config);
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[ios-permission-manquante\]/);
});

test('une description d’usage iOS interdite est signalée', () => {
  const config = configConforme();
  config.ios.infoPlist.NSCameraUsageDescription = 'Pour prendre une photo.';
  const resultat = analyser(config);
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[ios-permission-interdite\]/);
});

test('l’absence des résultats de greffons est signalée sans faire échouer le contrôle', () => {
  // Le chemin est **interne** : qu'il bouge n'est pas une régression de sécurité. Le
  // contrôle le dit, et s'appuie sur les listes publiques, qui font foi.
  const config = configConforme();
  delete config._internal;
  const resultat = analyser(config);
  assert.equal(resultat.code, 0, `attendu 0, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /ignorée\(s\)/);
  assert.match(resultat.sortie, /résultats de greffons sont absents/);
});

test('un fichier illisible est refusé, et non pris pour une configuration valide', () => {
  const resultat = surUnFichier('pas-du-json.json', '{ ceci n’est pas du JSON');
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[config-illisible\]/);
});
