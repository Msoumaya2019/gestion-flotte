/**
 * Contrôle des flux de travail GitHub Actions.
 *
 * ## Pourquoi
 *
 * Un flux de travail se teste normalement en le poussant, et c'est le pire moment pour
 * découvrir une faute de frappe : le flux démarre, échoue après l'installation complète
 * des dépendances, et l'on cherche le défaut du mauvais côté. Deux familles de défauts,
 * de coût très inégal :
 *
 * | Défaut                | Ce qui se passe                                | Coût              |
 * | --------------------- | ---------------------------------------------- | ----------------- |
 * | YAML mal formé        | Le flux ne démarre pas ; GitHub le dit.        | Immédiat, bruyant |
 * | Script `run:` invalide | Le flux démarre, échoue après l'installation.  | Long, silencieux  |
 *
 * C'est la seconde qui justifie ce fichier, et c'est elle qu'il attrape.
 *
 * ## Portée — ce que ce contrôle voit, et ce qu'il ne voit pas
 *
 * Il lit le texte des flux, il n'analyse **pas** le YAML. Il ne peut donc pas signaler un
 * YAML mal formé : GitHub le fera à la poussée, bruyamment et sans frais. Ce qu'il fait :
 *
 * - passer chaque script `run:` à `bash -n`, qui refuse un `then` manquant, un `fi`
 *   orphelin, une quote non fermée ;
 * - les contrôles de forme : déclencheur, `permissions`, `runs-on`, actions épinglées,
 *   étapes qui font quelque chose, et `contents: write` quand une étape publie une version.
 *
 * Et il s'arrête là, volontairement. `bash -n` analyse **sans évaluer** : il accepte
 * `echo ${a b}`, qui échoue à l'exécution. Une faute de frappe dans `${CHEMIN}` ne sera
 * signalée ni ici, ni par `tsc`, ni par un linter.
 *
 * ## Aucune dépendance
 *
 * L'extraction des scripts se fait par indentation, pas par un analyseur YAML. C'est un
 * choix : `js-yaml` et `yaml` sont présents dans `node_modules`, mais **en transitif**.
 * Les employer ici obligerait à les déclarer, donc à mettre `package-lock.json` à jour —
 * sans quoi `npm ci` échoue en intégration, c'est-à-dire précisément là où ce contrôle
 * sert. Le coût d'un analyseur dépasserait le bénéfice, puisque le seul défaut qu'il
 * ajouterait est celui que GitHub signale déjà sans frais.
 *
 * Usage :
 *   node scripts/check-workflows.mjs [dossier]
 *
 * Le dossier est optionnel : c'est ce qui permet au banc d'éprouver la liste fermée sur
 * des dossiers fabriqués, sans toucher aux vrais flux.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * La liste est **fermée**, et dans les deux sens.
 *
 * C'est le seul contrôle de ce fichier dont l'absence d'un sujet produirait un vert : tous
 * les autres attrapent un défaut dans un fichier qu'ils lisent, celui-ci lit ce que le
 * dossier contient. Un contrôle qui découvre ses sujets mesure ce qui reste, jamais ce qui
 * manque — il n'y a donc aucun signal à attendre.
 *
 * Un fichier ajouté doit échouer lui aussi tant qu'il n'est pas déclaré : sans ce second
 * sens, une garde qui refuserait tout passerait pour concluante. Déclarer est le prix, et
 * il est utile — il force à se demander si le nouveau flux doit tourner partout.
 */
const FLUX_ATTENDUS = ['ci.yml', 'android-apk.yml', 'ios-ipa.yml'];

const DOSSIER_PAR_DEFAUT = '.github/workflows';

/** Un défaut, avec un marqueur ASCII sur lequel un banc peut s'accrocher. */
function defaut(marqueur, message) {
  return { marqueur, message };
}

function formater(d) {
  return `${d.marqueur} ${d.message}`;
}

/**
 * Extrait les scripts `run:` d'un flux, par indentation.
 *
 * Deux formes à reconnaître : la forme en bloc (`run: |` ou `run: >`, suivie de lignes
 * plus indentées) et la forme en ligne (`run: npm test`). Un bloc se termine à la première
 * ligne non vide dont l'indentation redescend au niveau du `run:` — c'est la règle du
 * scalaire en bloc, et c'est elle qui fait qu'un extrait multiligne à la colonne 0 casse
 * le YAML. Ici, cette faute ne sera pas vue comme une faute de YAML : elle produira un
 * script tronqué, que `bash -n` refusera probablement — ce qui est un signal utile, mais
 * pour une autre raison. C'est une limite assumée de l'extraction par indentation.
 */
function extraireScripts(lignes) {
  const scripts = [];
  for (let i = 0; i < lignes.length; i += 1) {
    // `(?:-\s+)?` n'est pas cosmétique : une étape s'écrit `- run: …`, et un motif
    // `^\s*run:` ne verrait alors **aucune** étape de cette forme. Le contrôle passerait
    // au vert sans avoir rien examiné — le pire des verdicts. Mesuré : sans ce préfixe,
    // la mutation « script invalide écrit en élément de liste » restait verte.
    const correspondance = /^(\s*)(?:-\s+)?run:[ \t]?(.*)$/.exec(lignes[i]);
    if (correspondance === null) continue;

    const indentation = correspondance[1].length;
    const reste = correspondance[2].trim();

    const estBloc = /^[|>][+-]?\d*$/.test(reste);
    if (!estBloc) {
      // `run:` en ligne : le script tient sur la ligne, hors commentaire de fin.
      if (reste !== '') scripts.push({ ligne: i + 1, texte: reste });
      continue;
    }

    const corps = [];
    let j = i + 1;
    for (; j < lignes.length; j += 1) {
      const ligne = lignes[j];
      if (ligne.trim() === '') {
        corps.push('');
        continue;
      }
      const indent = ligne.length - ligne.trimStart().length;
      if (indent <= indentation) break;
      corps.push(ligne);
    }
    i = j - 1;

    // On retire l'indentation commune, en ignorant les lignes vides.
    const nonVides = corps.filter((l) => l.trim() !== '');
    const commun = nonVides.length === 0
      ? 0
      : Math.min(...nonVides.map((l) => l.length - l.trimStart().length));
    const texte = corps.map((l) => (l.trim() === '' ? '' : l.slice(commun))).join('\n');
    scripts.push({ ligne: i + 1, texte });
  }
  return scripts;
}

/**
 * Découpe un flux en étapes, pour vérifier que chacune fait quelque chose.
 *
 * Une étape commence à un tiret dont l'indentation est celle des éléments de `steps:`.
 * On cherche donc d'abord la clé `steps:`, puis les tirets de même profondeur.
 */
function etapesDuFlux(lignes) {
  const etapes = [];
  let indentationSteps = null;
  let indentationTirets = null;
  let courante = null;

  const cloturer = () => {
    if (courante !== null) etapes.push(courante);
    courante = null;
  };

  for (let i = 0; i < lignes.length; i += 1) {
    const ligne = lignes[i];
    if (ligne.trim() === '') continue;
    const indent = ligne.length - ligne.trimStart().length;

    const cle = /^(\s*)([a-zA-Z_-]+):/.exec(ligne);
    if (cle !== null && indent <= (indentationSteps ?? Number.MAX_SAFE_INTEGER)) {
      if (cle[2] === 'steps') {
        indentationSteps = indent;
        indentationTirets = null;
        cloturer();
        continue;
      }
      if (indentationSteps !== null) {
        // On est sorti du bloc `steps:`.
        cloturer();
        indentationSteps = null;
        indentationTirets = null;
      }
    }

    if (indentationSteps === null) continue;

    const tiret = /^(\s*)-[ \t]/.exec(ligne);
    if (tiret !== null) {
      if (indentationTirets === null) indentationTirets = tiret[1].length;
      if (tiret[1].length === indentationTirets) {
        cloturer();
        courante = { ligne: i + 1, contenu: [ligne] };
        continue;
      }
    }

    if (courante !== null && indent > indentationTirets) {
      courante.contenu.push(ligne);
    }
  }
  cloturer();
  return etapes;
}

/** Le nom d'une étape, pour un message lisible. */
function nomEtape(etape) {
  for (const ligne of etape.contenu) {
    const m = /^\s*-?\s*name:\s*(.+?)\s*$/.exec(ligne);
    if (m !== null) return m[1].replace(/^["']|["']$/g, '');
  }
  const action = etape.contenu.find((l) => /^\s*uses:/.test(l));
  if (action !== undefined) return action.trim();
  return `ligne ${etape.ligne}`;
}

function verifierFlux(nom, contenu) {
  const defauts = [];
  const lignes = contenu.split(/\r?\n/);
  let verifications = 0;

  // --- Déclencheur ---------------------------------------------------------
  verifications += 1;
  if (!lignes.some((l) => /^on:/.test(l))) {
    defauts.push(defaut('[declencheur-absent]', `${nom} : la clé « on: » est absente.`));
  }

  // --- Permissions ---------------------------------------------------------
  verifications += 1;
  const aPermissions = lignes.some((l) => /^permissions:/.test(l));
  if (!aPermissions) {
    defauts.push(defaut('[permissions-absent]', `${nom} : aucun « permissions: » déclaré à la racine.`));
  }

  // --- Exécuteur -----------------------------------------------------------
  verifications += 1;
  const lignesRunsOn = lignes.filter((l) => /^\s*runs-on:/.test(l));
  if (lignesRunsOn.length === 0) {
    defauts.push(defaut('[runs-on-absent]', `${nom} : aucun travail ne déclare « runs-on: ».`));
  }

  // --- Actions épinglées ---------------------------------------------------
  // Même piège que pour `run:` : une action est un élément de liste (`- uses: …`). Un
  // motif sans le tiret ne verrait aucune action du dépôt, et le contrôle se tairait.
  for (const ligne of lignes) {
    const m = /^\s*(?:-\s+)?uses:\s*(\S+)\s*$/.exec(ligne);
    if (m === null) continue;
    verifications += 1;
    // Une action locale (`./chemin`) n'a pas de référence à épingler.
    if (m[1].startsWith('./')) continue;
    if (!m[1].includes('@')) {
      defauts.push(
        defaut('[action-non-epinglee]', `${nom} : « ${m[1]} » n'est pas épinglée (attendu « …@vN »).`),
      );
    }
  }

  // --- Chaque étape fait quelque chose -------------------------------------
  const etapes = etapesDuFlux(lignes);
  for (const etape of etapes) {
    verifications += 1;
    const texte = etape.contenu.join('\n');
    const aUses = /^\s*(-\s*)?uses:/m.test(texte);
    const aRun = /^\s*(-\s*)?run:/m.test(texte);
    if (!aUses && !aRun) {
      defauts.push(
        defaut('[etape-vide]', `${nom} : l'étape « ${nomEtape(etape)} » n'a ni « uses: » ni « run: ».`),
      );
    }
  }

  // --- Un script `run:` est-il valide ? ------------------------------------
  const scripts = extraireScripts(lignes);
  for (const script of scripts) {
    verifications += 1;
    const resultat = spawnSync('bash', ['-n'], { input: script.texte, encoding: 'utf8' });
    if (resultat.error !== undefined) {
      // Ne pas se taire : un contrôle qui n'a pas pu tourner ne doit pas rendre un vert.
      defauts.push(
        defaut(
          '[bash-introuvable]',
          `${nom} : « bash » est introuvable, les scripts n'ont pas pu être analysés (${resultat.error.message}).`,
        ),
      );
      break;
    }
    if (resultat.status !== 0) {
      const detail = (resultat.stderr ?? '').trim().split('\n')[0] ?? '';
      defauts.push(
        defaut(
          '[script-invalide]',
          `${nom} › ligne ${script.ligne} : le script est refusé par « bash -n » : ${detail}`,
        ),
      );
    }
  }

  // --- Publier une version demande le droit d'écrire -----------------------
  // Un `permissions` de travail REMPLACE celui de la racine, il ne s'y ajoute pas : on
  // résout donc les droits effectifs, en rattachant chaque script au travail qui le porte.
  const droitsEcriture = resoudreDroitsEcriture(lignes);
  for (const script of scripts) {
    if (!/gh\s+release\s+create/.test(script.texte)) continue;
    verifications += 1;
    const travail = droitsEcriture.travailDe(script.ligne);
    const effectives = droitsEcriture.effectives(travail);
    if (effectives !== 'write') {
      defauts.push(
        defaut(
          '[permissions-insuffisantes]',
          `${nom} › ligne ${script.ligne} : « gh release create » exige « contents: write » sur le travail « ${travail ?? '(racine)'} ».`,
        ),
      );
    }
  }

  return { defauts, verifications, scripts: scripts.length, etapes: etapes.length };
}

/**
 * Résout les permissions effectives : celles du travail s'il en déclare, celles de la
 * racine sinon. Rend « write » si `contents: write` (ou `write-all`) s'applique.
 */
function resoudreDroitsEcriture(lignes) {
  const racineEcriture = (() => {
    for (let i = 0; i < lignes.length; i += 1) {
      if (!/^permissions:/.test(lignes[i])) continue;
      if (/^permissions:\s*write-all\s*$/.test(lignes[i])) return true;
      for (let j = i + 1; j < lignes.length; j += 1) {
        if (/^\S/.test(lignes[j]) && lignes[j].trim() !== '') break;
        if (/^\s*contents:\s*write\s*$/.test(lignes[j])) return true;
      }
      return false;
    }
    return false;
  })();

  // Les bornes de chaque travail, par indentation de `jobs:`.
  const travaux = [];
  let indentationJobs = null;
  for (let i = 0; i < lignes.length; i += 1) {
    const indent = lignes[i].length - lignes[i].trimStart().length;
    if (/^jobs:\s*$/.test(lignes[i])) {
      indentationJobs = indent;
      continue;
    }
    if (indentationJobs === null) continue;
    if (lignes[i].trim() === '') continue;
    if (indent <= indentationJobs) break;
    const m = /^(\s*)([A-Za-z0-9_-]+):\s*$/.exec(lignes[i]);
    if (m !== null && m[1].length === indentationJobs + 2) {
      travaux.push({ nom: m[2], debut: i, fin: lignes.length, ecriture: null });
    }
  }
  for (let k = 0; k < travaux.length; k += 1) {
    if (k + 1 < travaux.length) travaux[k].fin = travaux[k + 1].debut;
    const bloc = lignes.slice(travaux[k].debut, travaux[k].fin);
    for (let i = 0; i < bloc.length; i += 1) {
      if (!/^\s*permissions:/.test(bloc[i])) continue;
      if (/^\s*permissions:\s*write-all\s*$/.test(bloc[i])) {
        travaux[k].ecriture = true;
        break;
      }
      for (let j = i + 1; j < bloc.length; j += 1) {
        const indent = bloc[j].length - bloc[j].trimStart().length;
        if (bloc[j].trim() !== '' && indent <= bloc[i].length - bloc[i].trimStart().length) break;
        if (/^\s*contents:\s*write\s*$/.test(bloc[j])) {
          travaux[k].ecriture = true;
          break;
        }
      }
      break;
    }
  }

  return {
    travailDe: (ligne) => {
      let trouve = null;
      for (const travail of travaux) {
        if (travail.debut < ligne) trouve = travail.nom;
      }
      return trouve;
    },
    effectives: (nomTravail) => {
      const travail = travaux.find((t) => t.nom === nomTravail);
      // Le travail ne déclare rien : la racine s'applique. S'il déclare, il remplace.
      if (travail === undefined || travail.ecriture === null) {
        const bloc = travail === undefined ? [] : lignes.slice(travail.debut, travail.fin);
        const declare = bloc.some((l) => /^\s*permissions:/.test(l));
        return declare ? 'read' : racineEcriture ? 'write' : 'read';
      }
      return travail.ecriture ? 'write' : 'read';
    },
  };
}

function main() {
  const dossier = process.argv[2] ?? DOSSIER_PAR_DEFAUT;

  if (!existsSync(dossier)) {
    console.error(`[dossier-absent] ${dossier} n'existe pas : le contrôle n'a rien pu lire.`);
    process.exit(1);
  }

  const fichiers = readdirSync(dossier)
    .filter((nom) => nom.endsWith('.yml') || nom.endsWith('.yaml'))
    // `readdirSync` ne garantit aucun ordre : trier rend les messages comparables.
    .sort();

  const defauts = [];

  // Fermeture de la liste, premier sens : un flux attendu qui a disparu.
  for (const attendu of FLUX_ATTENDUS) {
    if (!fichiers.includes(attendu)) {
      defauts.push(defaut('[flux-absent]', `${attendu} — flux attendu absent du dossier ${dossier}.`));
    }
  }
  // Second sens : un fichier ajouté sans être déclaré.
  for (const present of fichiers) {
    if (!FLUX_ATTENDUS.includes(present)) {
      defauts.push(defaut('[flux-non-declare]', `${present} — flux non déclaré dans FLUX_ATTENDUS.`));
    }
  }
  if (fichiers.length === 0) {
    defauts.push(defaut('[dossier-vide]', `${dossier} ne contient aucun flux de travail.`));
  }

  let verifications = FLUX_ATTENDUS.length * 2;
  let scripts = 0;
  let etapes = 0;

  for (const nom of fichiers) {
    const contenu = readFileSync(join(dossier, nom), 'utf8');
    const resultat = verifierFlux(nom, contenu);
    defauts.push(...resultat.defauts);
    verifications += resultat.verifications;
    scripts += resultat.scripts;
    etapes += resultat.etapes;
  }

  if (defauts.length > 0) {
    for (const d of defauts) console.error(formater(d));
    console.error(
      `\n${defauts.length} défaut(s) sur ${fichiers.length} flux de travail, ${verifications} vérification(s).`,
    );
    process.exit(1);
  }

  console.log(
    `${verifications} vérification(s) sur ${fichiers.length} flux de travail ` +
      `(${scripts} script(s) analysé(s) par « bash -n », ${etapes} étape(s)) — aucun défaut.`,
  );
}

main();
