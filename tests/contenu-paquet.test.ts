/**
 * Banc du contrôle de contenu d'un paquet livré.
 *
 * ## Le cas qui compte le plus
 *
 * Le bundle de release est du bytecode **Hermes**. Une chaîne purement ASCII y est rangée
 * en ASCII, mais une chaîne contenant **un seul caractère hors ASCII** est rangée en
 * **UTF-16LE**. Un contrôle qui ne chercherait qu'en UTF-8 déclarerait donc « absent » un
 * paquet parfaitement correct — et l'absence est exactement ce que ce contrôle refuse.
 *
 * Le cas « un témoin rangé en UTF-16LE est trouvé » est le cœur de ce banc. Il n'éprouve pas
 * une commodité : il éprouve la seule raison pour laquelle la recherche a deux branches.
 *
 * ## Ce qu'il éprouve, et comment
 *
 * Les paquets sont **fabriqués** : on écrit les octets, on ne compile rien. Le banc ne
 * mesure donc pas Metro ni Hermes, mais ce contrôle-ci — ce qui est le sujet.
 *
 * La liste des témoins par défaut n'est pas recopiée ici : elle est **lue dans la sortie du
 * contrôle**, en le lançant sur un fichier qui ne contient rien. Une liste recopiée
 * dériverait en silence ; une liste lue ne le peut pas.
 *
 * ## Ce qu'il n'éprouve pas
 *
 * Que l'écran s'affiche, ni que la base accepte les appels. Le contrôle lui-même ne le
 * prétend pas.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const RACINE = dirname(dirname(fileURLToPath(import.meta.url)));
const CONTROLE = join(RACINE, 'scripts', 'verifier-contenu-paquet.mjs');

interface Resultat {
  code: number;
  sortie: string;
}

/** Lance le contrôle sur un contenu, dans un dossier temporaire, et rend son verdict. */
function surUnPaquet(contenu: Buffer, temoins: string[] = []): Resultat {
  const dossier = mkdtempSync(join(tmpdir(), 'contenu-paquet-'));
  try {
    const chemin = join(dossier, 'paquet.bin');
    writeFileSync(chemin, contenu);
    const resultat = spawnSync(process.execPath, [CONTROLE, chemin, ...temoins], { encoding: 'utf8' });
    return { code: resultat.status ?? -1, sortie: `${resultat.stdout}${resultat.stderr}` };
  } finally {
    try {
      rmSync(dossier, { recursive: true, force: true });
    } catch {
      // Sans conséquence : le dossier est dans le répertoire temporaire du système.
    }
  }
}

/** Un fichier inexistant, pour éprouver le refus de lecture. */
function surUnCheminAbsent(): Resultat {
  const dossier = mkdtempSync(join(tmpdir(), 'contenu-paquet-'));
  try {
    const resultat = spawnSync(process.execPath, [CONTROLE, join(dossier, 'jamais-ecrit.bin')], {
      encoding: 'utf8',
    });
    return { code: resultat.status ?? -1, sortie: `${resultat.stdout}${resultat.stderr}` };
  } finally {
    try {
      rmSync(dossier, { recursive: true, force: true });
    } catch {
      // Sans conséquence.
    }
  }
}

/**
 * Un paquet contenant les témoins demandés.
 *
 * Le remplissage initial évite le cas « fichier vide », qui a son propre refus : sans lui,
 * un banc qui croit éprouver l'absence de témoin éprouverait en réalité la vacuité.
 */
function paquet(contenus: Array<{ texte: string; encodage: 'utf8' | 'utf16le' }>): Resultat {
  const morceaux = [Buffer.alloc(64, 0x7a)];
  for (const { texte, encodage } of contenus) {
    morceaux.push(Buffer.from(texte, encodage));
  }
  const temoins = contenus.map((c) => c.texte);
  return surUnPaquet(Buffer.concat(morceaux), temoins);
}

test('un paquet qui contient les témoins passe — c’est le témoin', () => {
  // Sans ce cas, un contrôle qui refuserait tout paquet passerait pour concluant.
  const resultat = paquet([
    { texte: 'contrat/[id]', encodage: 'utf8' },
    { texte: 'sauvegarde', encodage: 'utf8' },
  ]);
  assert.equal(resultat.code, 0, `attendu 0, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /2 témoin\(s\) trouvé\(s\) sur 2/);
});

test('un témoin rangé en UTF-16LE est trouvé, et non déclaré absent', () => {
  // Le défaut réel que la seconde branche de la recherche couvre : Hermes range en
  // UTF-16LE toute chaîne contenant un caractère hors ASCII. Une recherche en UTF-8 seul
  // conclurait ici à une absence.
  const resultat = paquet([{ texte: 'etat-lieux/[rentalId]', encodage: 'utf16le' }]);
  assert.equal(resultat.code, 0, `attendu 0, obtenu ${resultat.code} :\n${resultat.sortie}`);
  // L'encodage est nommé : sans cette assertion, le banc passerait aussi si la recherche
  // en UTF-8 trouvait la chaîne par accident, et n'éprouverait alors rien.
  assert.match(resultat.sortie, /etat-lieux\/\[rentalId\] \(UTF-16LE\)/);
});

test('un témoin absent est nommé, et le paquet est refusé', () => {
  // Un paquet qui contient le premier témoin mais pas le second : c'est la forme réelle du
  // défaut — un écran empaqueté, un autre non.
  const resultat = surUnPaquet(
    Buffer.concat([Buffer.alloc(64, 0x7a), Buffer.from('contrat/[id]', 'utf8')]),
    ['contrat/[id]', 'sauvegarde'],
  );

  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[temoin-absent\] sauvegarde/);
  // Le compte est annoncé : un refus qui ne dit pas combien sur combien laisse croire à une
  // absence unique alors que le paquet peut être entièrement vide.
  assert.match(resultat.sortie, /1 témoin\(s\) absent\(s\) sur 2/);
  // Et le témoin présent n'est pas signalé absent — une seule faute, un seul message.
  assert.doesNotMatch(resultat.sortie, /\[temoin-absent\] contrat/);
});

test('un paquet vide est refusé pour vacuité, et non pour témoins absents', () => {
  // La distinction n'est pas cosmétique : « zéro octet » dit que la compilation a échoué,
  // « témoins absents » dit que le code n'est pas dedans. Deux causes, deux gestes.
  const resultat = surUnPaquet(Buffer.alloc(0), ['contrat/[id]']);
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[bundle-vide\]/);
  assert.doesNotMatch(resultat.sortie, /\[temoin-absent\]/);
});

test('un paquet illisible est refusé', () => {
  const resultat = surUnCheminAbsent();
  assert.equal(resultat.code, 1, `attendu 1, obtenu ${resultat.code} :\n${resultat.sortie}`);
  assert.match(resultat.sortie, /\[bundle-illisible\]/);
});

test('sans témoin nommé, la liste par défaut est employée — et elle est annoncée', () => {
  // Le contrôle doit dire sur quoi il a porté. Un vert qui ne compte pas ses vérifications
  // ne prouve pas qu'il en a fait une.
  const resultat = surUnPaquet(Buffer.alloc(64, 0x7a));
  assert.equal(resultat.code, 1);
  assert.match(resultat.sortie, /témoin\(s\) absent\(s\) sur \d+/);
});

test('chaque témoin par défaut est sans accent, et la liste n’est pas vide', () => {
  // L'en-tête du contrôle affirme que les témoins sont sans accent « ce qui les met à
  // l'abri de la question d'encodage ». Cette affirmation se vérifie ici, et pas seulement
  // dans un commentaire : le jour où quelqu'un ajoutera un témoin accentué, ce cas le dira.
  //
  // La liste est lue dans la sortie du contrôle lui-même, sur un fichier qui ne contient
  // rien : elle ne peut donc pas dériver de l'implémentation.
  const resultat = surUnPaquet(Buffer.alloc(64, 0x7a));
  const defauts = [...resultat.sortie.matchAll(/\[temoin-absent\] (\S+)/g)].map((m) => m[1]);

  assert.ok(defauts.length >= 3, `liste par défaut trop courte : ${defauts.length} témoin(s)`);

  for (const temoin of defauts) {
    // Tout caractère hors de la plage ASCII imprimable signalerait un témoin accentué.
    assert.match(
      temoin,
      /^[\x20-\x7e]+$/,
      `le témoin « ${temoin} » contient un caractère hors ASCII : il dépendrait alors de l'encodage du bundle`,
    );
  }

  // Un témoin par domaine fonctionnel, et non trois du même écran : l'en-tête le promet.
  const domaines = new Set(defauts.map((t) => t.split('/')[0]));
  assert.ok(
    domaines.size >= 3,
    `les témoins couvrent ${domaines.size} domaine(s) fonctionnel(s) : trop peu pour distinguer « le paquet contient l'application » de « le paquet contient un écran »`,
  );
});
