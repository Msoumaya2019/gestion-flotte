/**
 * Banc du contrôle des flux de travail.
 *
 * ## Ce qu'il éprouve, et pourquoi ici plutôt qu'ailleurs
 *
 * La fermeture de la liste des flux attendus est le **seul** contrôle du script dont
 * l'absence d'un sujet produirait un vert : tous les autres attrapent un défaut dans un
 * fichier qu'ils lisent, celui-ci lit ce que le dossier contient. Aucune mutation des vrais
 * fichiers ne peut donc l'éprouver — il faut fabriquer des dossiers.
 *
 * Et ces dossiers doivent être des **copies du dossier réel**, jamais un fichier seul :
 * sur un dossier ne contenant qu'un flux, un flux attendu est toujours manquant, et le
 * refus viendrait alors de deux causes à la fois. Le banc ne mesurerait plus rien.
 *
 * Le premier cas est un **témoin** : sans lui, un contrôle qui refuserait toute copie
 * passerait pour concluant.
 *
 * ## Ce qu'il n'éprouve pas
 *
 * Les autres contrôles — déclencheur, permissions, actions épinglées, `bash -n` — sont
 * éprouvés par falsification du vrai flux, chaque mutation devant produire son marqueur et
 * le fichier étant restauré à l'octet près. Ce banc-ci ne les reprend pas : les rejouer
 * ici obligerait à écrire de faux flux complets, dont la validité deviendrait elle-même une
 * question. Le seul cas de script repris ici est celui qui a réellement échoué — un script
 * écrit en élément de liste (`- run: …`), que le motif du contrôle ne voyait pas.
 */

import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

/**
 * La racine du projet, remontée depuis ce fichier.
 *
 * `dirname` appliqué deux fois, plutôt que `new URL('..', import.meta.url)` : le `URL`
 * global et celui de `node:url` ne sont pas le même type dans cette configuration, et
 * `fileURLToPath` refuse le premier (« Property '[Symbol.dispose]' is missing »). Passer
 * par la chaîne évite la question, et `import.meta.url` en est déjà une.
 */
const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));
const FLUX_REELS = join(RACINE, '.github', 'workflows');
const CONTROLE = join(RACINE, 'scripts', 'check-workflows.mjs');

interface Resultat {
  code: number;
  sortie: string;
}

function analyser(dossier: string): Resultat {
  const resultat = spawnSync(process.execPath, [CONTROLE, dossier], { encoding: 'utf8' });
  return { code: resultat.status ?? -1, sortie: `${resultat.stdout}${resultat.stderr}` };
}

/**
 * Copie les vrais flux, **un fichier par un fichier**.
 *
 * `cpSync` d'un dossier vers un dossier existant ne fait pas ce qu'on croit selon la
 * version : copier les entrées une à une lève l'ambiguïté, pour trois lignes.
 */
function copierLesVraisFlux(dossier: string): void {
  for (const nom of readdirSync(FLUX_REELS)) {
    cpSync(join(FLUX_REELS, nom), join(dossier, nom));
  }
}

/** Un flux minimal **mais valide**, pour qu'un refus ne vienne pas d'ailleurs. */
const FLUX_VALIDE = [
  'name: Autre',
  'on:',
  '  push:',
  'permissions:',
  '  contents: read',
  'jobs:',
  '  rien:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - run: echo ok',
  '',
].join('\n');

/**
 * Installe un flux de banc dans un dossier **complet**.
 *
 * La copie des vrais flux n'est pas une commodité : la liste des flux attendus est
 * **fermée**, donc un dossier ne contenant que le flux de banc ferait manquer tous les
 * autres. Le refus viendrait alors de deux causes à la fois — le sujet du cas et la liste
 * fermée — et le cas n'éprouverait plus ce qu'il annonce.
 *
 * C'est ce qui est arrivé : ces deux cas écrivaient un `ci.yml` seul dans un dossier vide,
 * et ils passaient uniquement parce que la liste ne comptait alors qu'un élément. Le
 * deuxième flux ajouté les a fait tomber, et le défaut était bien dans le banc.
 */
function avecLeFlux(nom: string, contenu: string): (dossier: string) => void {
  return (dossier) => {
    copierLesVraisFlux(dossier);
    writeFileSync(join(dossier, nom), contenu, 'utf8');
  };
}

/**
 * Exécute une préparation dans un dossier temporaire, puis analyse.
 *
 * Le dossier est supprimé ensuite. L'échec du nettoyage n'est pas une raison de faire
 * échouer le contrôle : le dossier est dans le répertoire temporaire du système, et une
 * suppression refusée ne dit rien de ce que le banc mesure.
 */
function surUnDossier(preparer: (dossier: string) => void): Resultat {
  const dossier = mkdtempSync(join(tmpdir(), 'flux-'));
  try {
    preparer(dossier);
    return analyser(dossier);
  } finally {
    try {
      rmSync(dossier, { recursive: true, force: true });
    } catch {
      // Sans conséquence : voir le commentaire ci-dessus.
    }
  }
}

test('une copie intacte des flux réels passe — c’est le témoin', () => {
  // Sans ce cas, un contrôle qui refuserait toute copie passerait pour concluant.
  const resultat = surUnDossier(copierLesVraisFlux);
  assert.equal(resultat.code, 0, `attendu 0, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /aucun défaut/);
});

test('le rapport compte ses vérifications et nomme les scripts analysés', () => {
  // Un rapport qui annonce seulement « OK » ne dit pas s'il a regardé quelque chose. Le
  // chiffre se recoupe avec `grep -c '^\s*run:'` sur le dossier, qui est un plancher.
  const resultat = surUnDossier(copierLesVraisFlux);
  const chiffres = /(\d+) vérification\(s\) sur (\d+) flux/.exec(resultat.sortie);
  assert.notEqual(chiffres, null, `rapport inattendu : ${resultat.sortie}`);
  assert.ok(Number(chiffres?.[1]) > 0, 'aucune vérification annoncée');
  assert.ok(Number(chiffres?.[2]) > 0, 'aucun flux annoncé');
  assert.match(resultat.sortie, /script\(s\) analysé\(s\) par « bash -n »/);
});

test('un flux attendu retiré est signalé, et nommé', () => {
  const resultat = surUnDossier((dossier) => {
    copierLesVraisFlux(dossier);
    rmSync(join(dossier, 'ci.yml'));
  });
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[flux-absent\]/);
  // Le fichier fautif est nommé : un contrôle qui dit « un flux manque » sans dire lequel
  // oblige à relire le dossier à la main.
  assert.match(resultat.sortie, /ci\.yml/);
  // Et la garde de vacuité ne se déclenche PAS : le dossier porte encore les autres flux.
  // C'est la distinction entre « il manque un flux » et « il n'y a plus rien » — deux
  // causes, deux gestes. Ce cas affirmait l'inverse quand la liste ne comptait qu'un
  // élément, c'est-à-dire qu'il confondait les deux.
  assert.doesNotMatch(resultat.sortie, /\[dossier-vide\]/);
});

test('un dossier entièrement vidé est signalé comme vide, en plus des flux absents', () => {
  // Le pendant du cas précédent. Les fichiers sont retirés d'après ce que le dossier
  // contient réellement, et non d'après une liste recopiée : une liste recopiée ici
  // dériverait en silence le jour où un flux est ajouté.
  const resultat = surUnDossier((dossier) => {
    copierLesVraisFlux(dossier);
    for (const nom of readdirSync(dossier)) {
      rmSync(join(dossier, nom));
    }
  });
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[dossier-vide\]/);
  assert.match(resultat.sortie, /\[flux-absent\]/);
});

test('un flux ajouté sans être déclaré est signalé — la liste est fermée dans les deux sens', () => {
  // Sans ce sens, une garde qui refuserait tout passerait pour concluante. Le flux ajouté
  // est **valide** : sinon le refus viendrait de ses propres défauts, et non de la liste.
  const resultat = surUnDossier((dossier) => {
    copierLesVraisFlux(dossier);
    writeFileSync(join(dossier, 'autre.yml'), FLUX_VALIDE, 'utf8');
  });
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[flux-non-declare\]/);
  assert.match(resultat.sortie, /autre\.yml/);
  // Aucun flux attendu ne manque : le refus vient bien du seul fichier ajouté.
  assert.doesNotMatch(resultat.sortie, /\[flux-absent\]/);
});

test('un script invalide écrit en élément de liste est analysé', () => {
  // Le cas qui a réellement échoué : le motif du contrôle ne reconnaissait que `run: …`,
  // pas `- run: …`, et une étape de cette forme n'était donc jamais examinée. Le contrôle
  // restait vert sans avoir rien vu — le pire des verdicts.
  const contenu = [
    'name: Banc',
    'on:',
    '  push:',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  banc:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: echo "non-fermée',
    '',
  ].join('\n');
  const resultat = surUnDossier(avecLeFlux('ci.yml', contenu));
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[script-invalide\]/);
});

test('un script valide écrit en élément de liste ne produit pas de faux défaut', () => {
  // Le pendant du cas précédent : élargir le motif ne doit pas faire signaler une étape
  // correcte. Sans ce cas, un contrôle qui refuserait toute forme `- run:` passerait.
  const contenu = [
    'name: Banc',
    'on:',
    '  push:',
    'permissions:',
    '  contents: read',
    'jobs:',
    '  banc:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - run: echo ok',
    '      - name: Avec un nom',
    '        run: |',
    '          set -euo pipefail',
    '          echo ok',
    '',
  ].join('\n');
  const resultat = surUnDossier(avecLeFlux('ci.yml', contenu));
  assert.equal(resultat.code, 0, `attendu 0, obtenu ${resultat.code} :\n${resultat.sortie}`);
  // Et rien d'autre ne doit être signalé : un vert obtenu malgré un `[flux-absent]` ne
  // prouverait pas que la forme `- run:` est acceptée.
  assert.doesNotMatch(resultat.sortie, /\[script-invalide\]/);
  assert.doesNotMatch(resultat.sortie, /\[flux-absent\]/);
});
