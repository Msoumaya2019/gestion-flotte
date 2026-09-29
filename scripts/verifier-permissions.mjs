/**
 * Vérifie les permissions réellement déclarées par la configuration native.
 *
 * ## Pourquoi ce fichier existe
 *
 * L'application promet de n'accéder ni à l'appareil photo ni au microphone. Cette promesse
 * ne se lit pas dans `app.json` : elle est le résultat de l'exécution des greffons, qui
 * ajoutent ou **retirent** des permissions. `npx expo config --type introspect` est le seul
 * mode qui les exécute, et c'est sa sortie que ce contrôle examine.
 *
 * ## Pourquoi il ne fait pas un `grep`
 *
 * La première version de ce contrôle cherchait `android.permission.CAMERA` dans le fichier
 * de sortie. Elle échouait — et elle avait **tort**, ce qui est plus grave : la chaîne
 * apparaît bien dans le document, mais dans une entrée qui la **retire** du manifeste :
 *
 *     { "android:name": "android.permission.CAMERA", "tools:node": "remove" }
 *
 * Le greffon d'`expo-image-picker` ne se contente pas d'omettre la permission, il la
 * supprime. Un `grep` sans contexte ne distingue pas « déclarée » de « retirée » : il
 * accusait une configuration correcte. Une chaîne ne prouve rien sans l'endroit où elle se
 * trouve — il faut donc lire les **listes**, pas le texte.
 *
 * ## Ce qu'il lit, et pourquoi ceux-là
 *
 * - `ios.infoPlist` et `android.permissions` : ce sont les champs **publics** de la
 *   configuration. S'y appuyer est ce qui rend ce contrôle durable.
 * - `_internal.modResults…uses-permission` : le résultat évalué des greffons. Il porte la
 *   preuve la plus forte — le retrait explicite — mais son chemin est **interne**, donc
 *   susceptible de changer. Il renforce le verdict quand il est là, et son absence est
 *   signalée sans faire échouer le contrôle : un chemin interne qui bouge n'est pas une
 *   régression de sécurité.
 *
 * Usage :
 *   node scripts/verifier-permissions.mjs [chemin-du-json]
 */

import { readFileSync } from 'node:fs';

const CHEMIN_PAR_DEFAUT = 'config-introspectee.json';

/** Les permissions iOS attendues, et celles qui ne doivent jamais apparaître. */
const IOS_ATTENDUES = ['NSPhotoLibraryUsageDescription', 'NSFaceIDUsageDescription'];
const IOS_INTERDITES = [
  'NSCameraUsageDescription',
  'NSMicrophoneUsageDescription',
  'NSPhotoLibraryAddUsageDescription',
];

/** Les permissions Android qui ne doivent pas figurer dans la liste déclarée. */
const ANDROID_INTERDITES = ['android.permission.CAMERA', 'android.permission.RECORD_AUDIO'];

/**
 * Le chemin des résultats de greffons.
 *
 * `_internal` annonce la couleur : ce chemin peut changer d'une version d'Expo à l'autre.
 * C'est pour cela qu'il n'est qu'un renfort.
 */
function entreesManifeste(config) {
  const manifeste = config?._internal?.modResults?.android?.manifest?.manifest;
  const entrees = manifeste?.['uses-permission'];
  return Array.isArray(entrees) ? entrees : null;
}

function main() {
  const chemin = process.argv[2] ?? CHEMIN_PAR_DEFAUT;

  let config;
  try {
    config = JSON.parse(readFileSync(chemin, 'utf8'));
  } catch (erreur) {
    console.error(`[config-illisible] ${chemin} n'a pas pu être lu ou analysé : ${erreur.message}`);
    process.exit(1);
  }

  const defauts = [];
  let verifications = 0;
  let ignorees = 0;

  // --- iOS : la liste des descriptions d'usage -----------------------------
  const infoPlist = config?.ios?.infoPlist;
  if (infoPlist === undefined || infoPlist === null) {
    defauts.push(
      { marqueur: '[config-invalide]', message: 'ios.infoPlist est absent : rien n’a pu être vérifié côté iOS.' },
    );
  } else {
    for (const cle of IOS_ATTENDUES) {
      verifications += 1;
      if (typeof infoPlist[cle] !== 'string' || infoPlist[cle].trim() === '') {
        defauts.push({
          marqueur: '[ios-permission-manquante]',
          message: `ios.infoPlist : « ${cle} » devrait être présent, avec un texte.`,
        });
      }
    }
    for (const cle of IOS_INTERDITES) {
      verifications += 1;
      if (cle in infoPlist) {
        defauts.push({
          marqueur: '[ios-permission-interdite]',
          message: `ios.infoPlist : « ${cle} » ne devrait pas être déclaré.`,
        });
      }
    }
  }

  // --- Android : la liste déclarée ----------------------------------------
  const permissions = config?.android?.permissions;
  if (!Array.isArray(permissions)) {
    defauts.push({
      marqueur: '[config-invalide]',
      message: 'android.permissions n’est pas une liste : rien n’a pu être vérifié côté Android.',
    });
  } else {
    for (const interdite of ANDROID_INTERDITES) {
      verifications += 1;
      if (permissions.includes(interdite)) {
        defauts.push({
          marqueur: '[android-permission-interdite]',
          message: `android.permissions : « ${interdite} » ne devrait pas être déclarée.`,
        });
      }
    }
  }

  // --- Renfort : le retrait explicite dans le manifeste évalué -------------
  const entrees = entreesManifeste(config);
  if (entrees === null) {
    ignorees += 1;
    console.log(
      'note — les résultats de greffons sont absents de cette sortie : le retrait explicite ' +
        'des permissions n’a pas pu être vérifié. Les listes publiques ci-dessus font foi.',
    );
  } else {
    for (const entree of entrees) {
      const nom = entree?.$?.['android:name'];
      if (typeof nom !== 'string') continue;
      if (!ANDROID_INTERDITES.includes(nom)) continue;
      verifications += 1;
      // Une entrée qui retire la permission est la preuve la plus forte : elle dit que le
      // manifeste final ne la portera pas, même si une bibliothèque l'avait ajoutée.
      if (entree.$?.['tools:node'] !== 'remove') {
        defauts.push({
          marqueur: '[android-retrait-absent]',
          message: `manifeste Android : « ${nom} » est présente sans « tools:node: remove » — elle serait donc déclarée.`,
        });
      }
    }
  }

  if (defauts.length > 0) {
    for (const d of defauts) console.error(`${d.marqueur} ${d.message}`);
    console.error(`\n${defauts.length} défaut(s), ${verifications} vérification(s).`);
    process.exit(1);
  }

  const note = ignorees > 0 ? `, ${ignorees} ignorée(s)` : '';
  console.log(
    `${verifications} vérification(s) sur la configuration native${note} — ` +
      'photothèque et Face ID déclarés, appareil photo et microphone absents.',
  );
}

main();
