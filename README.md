# Gestion de flotte

Application iPhone pour gérer un parc de véhicules mis en location : véhicules,
locataires, locations, paiements, dépenses, entretien, documents, contrats et états
des lieux.

L'application fonctionne **hors ligne**. Elle ne parle à aucun serveur : pas de compte
à créer, pas de backend, pas de synchronisation. Les données vivent dans une base SQLite
sur l'appareil, et les pièces justificatives des locataires dans un coffre chiffré qui
ne quitte jamais le téléphone.

## Sommaire

- [Ce que fait l'application](#ce-que-fait-lapplication)
- [Ce qui ne quitte jamais l'appareil](#ce-qui-ne-quitte-jamais-lappareil)
- [Démarrer](#démarrer)
- [Vérifier](#vérifier)
- [Construire pour l'iPhone](#construire-pour-liphone)
- [Architecture](#architecture)
- [Modèle de données](#modèle-de-données)
- [Export et sauvegarde](#export-et-sauvegarde)
- [Limites connues](#limites-connues)

## Ce que fait l'application

### Accueil

Le tableau de bord répond aux questions du quotidien, sur la période choisie (ce mois,
le mois dernier, l'année, depuis le début, ou une plage libre) :

- recettes, dépenses et résultat ;
- loyers à encaisser et loyers en retard, avec le nombre de jours de retard ;
- véhicules loués et véhicules disponibles ;
- taille du parc et valeur d'acquisition ;
- investissement total et investissement déjà récupéré, avec barre de progression ;
- documents qui expirent bientôt ;
- entretiens à prévoir ;
- un graphique des recettes et dépenses par mois.

Un filtre par véhicule restreint tout le tableau de bord à un seul véhicule.

### Véhicules

Nombre illimité. Pour chacun : photo, marque, modèle, finition, année, immatriculation,
VIN, date et prix d'achat, frais d'acquisition, kilométrage à l'achat et kilométrage
actuel, carburant, assurance et son échéance, et un statut parmi *Disponible*, *Loué*,
*En entretien*, *En réparation*, *Indisponible*, *Vendu*.

La fiche d'un véhicule regroupe son aperçu, ses locations, ses relevés de kilométrage,
ses dépenses, son entretien, ses dommages, ses documents et son historique. La
rentabilité y est calculée : recettes, dépenses, amortissement selon la durée et la
méthode choisies, et investissement restant à récupérer.

### Locataires

Fiche complète : identité, date de naissance, adresse, téléphone, e-mail, numéro et date
de permis, carte VTC, notes. Chaque locataire rassemble ses locations, ses contrats, ses
paiements, ses documents et ses incidents.

### Locations

Le parcours de création suit l'ordre du métier : **véhicule → nouvelle location →
locataire → conditions → contrat → signature → activation**.

La périodicité du loyer n'est pas limitée au mois : hebdomadaire, bimensuelle, mensuelle
ou personnalisée, avec génération automatique de l'échéancier à partir de la date de
début.

Le **moment du paiement** se choisit aussi, indépendamment de la fréquence :

| Moment | Ce que cela donne | Cas d'usage |
| --- | --- | --- |
| **Début de période** (défaut) | Une location à la semaine démarrée un lundi se règle **ce lundi-là** | Le cas courant, le loyer payé d'avance |
| **Fin de période** | La même location se règle le **lundi suivant** | Un véhicule confié à la semaine, réglé quand la semaine se referme — « à terme échu » |

Le passage à « fin de période » **décale** chaque échéance d'une période, il n'en retire
aucune. C'est délibéré, et le compte le justifie : une location du 1er au 31 janvier
engendre une période, donc un loyer dû. Payé d'avance il tombe le 1er janvier, à terme
échu le 1er février — **après** la fin de la location, et c'est exactement ce que « échu »
veut dire. Écarter cette date parce qu'elle dépasse la fin ferait disparaître un loyer, et
le total facturé mentirait.

Chaque date est recalculée **depuis l'ancre**, décalage compris, jamais en ajoutant une
période à une date déjà produite : partir d'une ancre au 31 janvier donnerait sinon 28
février, puis 28 mars. Ce défaut a été introduit puis attrapé par le banc — voir
`src/domain/rental.ts`.

### Paiements

Statuts *À venir*, *Payé*, *Partiellement payé*, *En retard*, *Impayé*, *Annulé*.

Deux points volontaires :

- Le statut n'est pas stocké tel quel. Seules les décisions humaines (*annulé*,
  *impayé*) sont enregistrées ; *payé*, *partiel*, *en retard* et *à venir* sont
  **recalculés à partir de la date du jour** et des montants. Un loyer entièrement payé
  n'est donc jamais signalé en retard.
- Chaque paiement porte un champ **Payer / provenance**. Le locataire est le cas
  courant, pas une hypothèse : un tiers, un employeur ou une aide peuvent régler.

Les paiements partiels sont gérés : 300 € attendus, 250 € reçus, le solde reste visible
sur la location et sur l'échéance.

Les moyens de paiement sont une liste modifiable.

### Dépenses

Catégories par défaut et catégories personnalisées. Les dépenses alimentent la
rentabilité du véhicule.

### Entretien

Aucune fréquence n'est imposée. Un plan d'entretien se définit selon trois modes :

- **kilométrage** — le prochain entretien est dû à tel kilométrage ;
- **temps** — dû à telle date ;
- **mixte** — les deux, le premier atteint déclenche l'alerte.

L'échéance suivante se calcule à partir de la **dernière intervention réellement
enregistrée**, pas d'un calendrier théorique. L'historique complet des interventions est
conservé.

### États des lieux et dommages

État des lieux de départ et de retour, avec photos. Les dommages sont enregistrés par
type, avec photo et commentaire. Le retour de véhicule affiche un récapitulatif
(kilométrage parcouru, dommages relevés, paiements en attente) avant clôture.

### Contrats

Génération du contrat dans l'application, pré-rempli depuis la location, le véhicule, le
locataire et les réglages du propriétaire. Les **clauses sont modifiables** : elles
vivent en base et se modifient depuis les paramètres, elles ne sont pas codées en dur.

Signature au doigt dans l'application. Le document se prévisualise, s'imprime, se
partage (AirDrop, Mail, WhatsApp) et s'exporte en PDF.

### Documents des locataires

Type, numéro, date de délivrance, date d'expiration, commentaire, et le fichier joint.
Statut calculé : ✅ *Valide*, 🟠 *Expire bientôt*, 🔴 *Expiré*, ou *Sans échéance*.

Les rappels sont configurables : 90, 60, 30, 15, 7 jours, ou un seuil personnalisé.

Une liste de **documents exigés** se règle dans les paramètres. Avant d'activer une
location, le dossier est contrôlé et le message nomme ce qui manque —
« Impossible de valider complètement le dossier : assurance manquante. ». Ce contrôle
**n'est pas bloquant** : on peut forcer la validation, et le dossier reste signalé comme
incomplet.

### Notifications

Tout est local, planifié par l'appareil : loyer à échoir, loyer en retard, échéance
d'assurance, contrôle technique, expiration d'un document, expiration du permis ou de la
carte VTC, entretien à prévoir.

### Recherche

Une recherche globale sur les véhicules, les locataires et les locations.

### Retirer une fiche, en un geste

Sur la liste des véhicules comme sur celle des locataires, un **balayage vers la gauche**
révèle « Retirer ». Un second balayage, sur une ligne déjà archivée, révèle « Restaurer ».

Ce que le geste fait n'est pas décidé par l'écran : c'est la même règle que celle des
formulaires, écrite une seule fois dans `src/domain/suppression.ts` et éprouvée à part.

| Situation | Ce qui se passe |
| --- | --- |
| Une location est en cours | **Refus**, avec le motif : il faut d'abord la terminer. Sinon le véhicule sorti deviendrait introuvable pendant que la location continue de le désigner. |
| Des données s'y rattachent | **Archivage** : la fiche est masquée, son historique conservé, et la confirmation annonce le détail (« 12 échéances, 3 locations et 1 dépense »). |
| Rien du tout | **Archivage** aussi, et la confirmation le dit. |

**Rien n'est détruit par ce geste.** Les clés étrangères du schéma sont toutes en
`ON DELETE RESTRICT` : la base refuserait d'elle-même de supprimer un véhicule que des
échéances désignent. Le comptage sert à le dire **avant**, la contrainte le garantit
**après** — les deux sont éprouvés.

Les fiches archivées se retrouvent par la pastille « Archivés » de chaque liste, qui les
compte et les affiche. Sans elle, le geste serait un aller sans retour.

### Vider les données, ou tout remettre à zéro

`Paramètres → Zone de danger`. Deux gestes distincts, parce qu'ils n'ont pas les mêmes
conséquences :

- **Vider les données** — véhicules, locataires, locations, échéances, dépenses, entretiens,
  états des lieux, documents. Les **catalogues** (catégories de dépense, moyens de paiement,
  types d'entretien, types de document, clauses) et les **réglages**, code compris, sont
  conservés : l'application repart à zéro sans être à reconfigurer.
- **Tout remettre à zéro** — la base entière, catalogues compris, les documents du coffre, et
  les réglages. Les catalogues sont **réamorcés** dans la foulée : une application sans type
  de document ni moyen de paiement ne serait plus utilisable.

Les deux annoncent d'abord **ce qu'ils vont effacer**, chiffres à l'appui, puis exigent que
soit écrit le mot `SUPPRIMER`. La vérification est dans le code, pas seulement dans l'aspect
du bouton — un bouton grisé se contourne, une garde non.

Le jeu de démonstration **ne revient pas** après une remise à zéro : c'est la promesse
écrite dans `src/data/bootstrap.ts`, et elle est éprouvée.

## Ce qui ne quitte jamais l'appareil

C'est la contrainte structurante du projet, et elle est tenue par construction :

- **Aucun appel réseau.** Le code de `src/` et `app/` ne contient ni `fetch`, ni
  `XMLHttpRequest`, ni client HTTP. Aucune dépendance réseau (Supabase, Firebase, axios)
  n'est déclarée dans `package.json`.
- **Les pièces justificatives des locataires sont stockées uniquement sur l'iPhone**,
  dans un répertoire privé de l'application, chiffré (AES-256-GCM), et **invisible dans
  l'application Fichiers**. Elles ne sont jamais copiées sur un serveur.
- **L'accès au coffre est protégé** par Face ID, avec un code PIN en secours, et un
  verrouillage automatique dont le délai se règle (immédiat, 1, 5, 15 minutes, ou
  jamais).
- **La sauvegarde est un fichier local** que vous choisissez d'écrire où vous voulez,
  protégé par un mot de passe. Rien n'est téléversé.
- **L'export CSV n'emporte pas le contenu des documents**, seulement leurs métadonnées
  (type, numéro, dates, statut, et si une pièce est jointe). Emporter les pièces est le
  rôle de la sauvegarde, qui les chiffre. Un tableau CSV laissé dans un dossier partagé
  ne doit pas contenir un permis de conduire scanné.
- Les **permissions déclarées sont limitées à ce qui est réellement utilisé** :
  photothèque et Face ID. Ni appareil photo, ni microphone — et il ne s'agit pas d'une
  omission : le manifeste Android les **retire** explicitement
  (`"tools:node": "remove"`), de sorte qu'une bibliothèque qui les ajouterait ne pourrait
  pas les faire entrer. Un contrôle vérifie cette propriété à chaque poussée, en lisant les
  listes de la configuration évaluée (`npm run verifier:permissions`).

## Démarrer

### Prérequis

- **Node.js 22.18 ou plus récent** (le banc de tests utilise l'exécution directe du
  TypeScript et le module `node:sqlite`, tous deux intégrés à Node).
- **npm**.
- Pour un lancement sur iPhone : l'application **Expo Go**, ou une compilation de
  développement (voir plus bas).

### Installation et lancement

```bash
npm install
npm start
```

Puis scannez le QR code avec Expo Go, ou appuyez sur `i` pour ouvrir le simulateur iOS.

Certaines fonctions natives — Face ID, notifications locales, coffre chiffré, impression
et partage de PDF — se comportent mieux dans une **compilation de développement** que
dans Expo Go. Pour l'obtenir :

```bash
npx expo run:ios          # nécessite Xcode, donc macOS
```

Sur Windows, passez par un build EAS (voir [Construire pour
l'iPhone](#construire-pour-liphone)).

## Vérifier

```bash
npm run controle
```

Cette commande enchaîne les cinq contrôles, dans cet ordre :

| Commande | Ce qu'elle vérifie |
| --- | --- |
| `npm run verifier:flux` | Les flux de travail GitHub Actions |
| `npm run verifier` | TypeScript sur l'application (`app/` et `src/`) |
| `npm run verifier:tests` | TypeScript sur les bancs de test |
| `npm test` | Les tests |
| `npm run verifier:permissions` | Les permissions natives réellement déclarées |

Le contrôle des flux passe en premier parce qu'il coûte quelques secondes, là où les autres
compilent : un `run:` mal formé ne se voit qu'à l'exécution, et serait découvert après
l'installation complète. Le contrôle des permissions passe en dernier parce qu'il est le
plus lent — il fait tourner l'introspection d'Expo.

Ils peuvent aussi être lancés séparément :

```bash
npm run verifier:flux         # node scripts/check-workflows.mjs
npm run verifier              # tsc --noEmit
npm run verifier:tests        # tsc --noEmit -p tsconfig.tests.json
npm test                      # 293 tests
npm run verifier:permissions  # introspection Expo, puis contrôle des permissions
```

### Le contrôle des flux de travail

`scripts/check-workflows.mjs` lit `.github/workflows/`, passe **chaque** script `run:` à
`bash -n`, et vérifie la forme : déclencheur présent, `permissions` déclaré, `runs-on`
présent, actions épinglées, étapes qui font réellement quelque chose, et `contents: write`
quand une étape publie une version.

Deux points à savoir :

- **Il ne lit pas le YAML**, il lit son texte. Un YAML mal formé ne sera donc pas signalé
  ici — GitHub le fait à la poussée, immédiatement et sans frais. Il ne remplace pas non
  plus un essai sur appareil : `bash -n` analyse sans évaluer, et accepte `echo ${a b}`,
  qui échoue à l'exécution.
- **La liste des flux attendus est fermée**, dans les deux sens : un flux qui disparaît est
  signalé, et un flux ajouté sans être déclaré l'est aussi. C'est le seul contrôle du
  fichier dont l'absence d'un sujet produirait un vert silencieux — il faut donc le
  déclarer dans `FLUX_ATTENDUS`.

Le contrôle et son banc ont été éprouvés par falsification : neuf mutations du flux réel
(déclencheur renommé, permissions retirées, action non épinglée, `runs-on` retiré, étape
vide, trois formes de script invalide, publication sans droit d'écriture) produisent
chacune leur marqueur, et le fichier est restauré à l'octet près. Le banc éprouve en plus la
liste fermée sur des copies du dossier réel, chaque sens neutralisé séparément ne faisant
tomber que son cas.

### Le contrôle des permissions natives

`scripts/verifier-permissions.mjs` examine la sortie de `npx expo config --type introspect`
— le seul mode qui **exécute** les greffons de `app.json` — et vérifie que les permissions
déclarées sont bien celles qu'on croit : photothèque et Face ID présentes, appareil photo et
microphone absents.

Il lit les **listes**, il ne cherche pas des chaînes. La différence n'est pas cosmétique, et
elle a été mesurée : `android.permission.CAMERA` est bel et bien présente dans la sortie,
dans une entrée qui la **retire** du manifeste Android :

```json
{ "android:name": "android.permission.CAMERA", "tools:node": "remove" }
```

Un `grep` accuse donc une configuration correcte. Le contrôle distingue « déclarée » de
« retirée », et son banc rejoue ce défaut d'origine pour vérifier qu'il l'attraperait.

### Intégration continue

`.github/workflows/ci.yml` exécute, à chaque poussée sur `main` et à chaque demande de
fusion, deux travaux sur un exécuteur Linux avec Node 22 :

- **Types et tests** — le contrôle des flux, puis `tsc` sur l'application, `tsc` sur les
  bancs, puis la suite de tests ;
- **Configuration native** — l'introspection d'Expo, puis le contrôle des permissions.

Il n'y a rien à déployer : le projet n'a pas de backend. La compilation des binaires a ses
deux propres flux, décrits plus haut — ils ne tournent **pas** à chaque poussée, parce
qu'une compilation iOS coûte un quart d'heure d'exécuteur et ne se justifie qu'à la demande
ou sur une étiquette de version.

Le banc de test n'ajoute **aucune dépendance** : il s'exécute avec le lanceur `node:test`
intégré à Node, et il ouvre une **vraie base SQLite** grâce à `node:sqlite`. Les
migrations et les dépôts sont donc réellement exécutés, pas simulés.

Les calculs métier — montants, dates, échéanciers, statuts de paiement, amortissement,
récupération de l'investissement, échéances d'entretien, validité des documents,
génération CSV et contrat — sont couverts par des tests unitaires, dans une couche
`src/domain/` qui n'importe ni base de données ni interface.

## Construire les binaires

### Par GitHub Actions — c'est le chemin qui ne demande ni Mac ni compte développeur

Deux flux compilent les binaires et les attachent à une **publication GitHub** :

| Flux | Exécuteur | Produit |
| --- | --- | --- |
| `.github/workflows/android-apk.yml` | `ubuntu-latest` | `gestion-flotte-<version>.apk` |
| `.github/workflows/ios-ipa.yml` | `macos-26` | `gestion-flotte-<version>-non-signe.ipa` |

Deux versions ont abouti, et voici ce qu'elles ont produit — des tailles **mesurées** par les
flux eux-mêmes, pas estimées :

| Fichier | Taille | État |
| --- | --- | --- |
| `gestion-flotte-1.0.0.apk` | 113 703 672 octets (108 Mo) | installable directement, signé de la clé de débogage d'Expo |
| `gestion-flotte-1.0.0-non-signe.ipa` | 14 313 125 octets (13,6 Mo), 108 entrées | compilation **appareil**, à re-signer |
| `gestion-flotte-1.1.0.apk` | 113 729 720 octets (108 Mo) | idem, avec le retrait en un geste et la remise à zéro |
| `gestion-flotte-1.1.0-non-signe.ipa` | 14 326 071 octets (13,7 Mo), 108 entrées | idem |

Le bundle Android a été retrouvé intact dans l'APK — six témoins sur six, dans un
`bundle-android.hbc` de 4 183 736 octets — et le binaire iOS porte `DTPlatformName = iphoneos`
**et** `LC_BUILD_VERSION = IOS`, les deux témoins concordant. Sur l'IPA de la version 1.1.0, ces
deux témoins ont été relus **sur le fichier publié**, avec `CFBundleShortVersionString = 1.1.0`
et `CFBundleVersion = 2` : la montée de version est bien dans le binaire, et non seulement dans
le dépôt.

Ils se déclenchent de deux façons : à la main (onglet **Actions**, bouton *Run workflow*), ou
en poussant une étiquette `v<version>` :

```bash
git tag v1.2.0 && git push origin v1.2.0
```

Une compilation peut aussi être relancée seule, sans nouvelle étiquette, quand le code a changé
sans que la version change : `gh workflow run android-apk.yml --ref main`. C'est le chemin qui a
servi à valider la correction du tas de Gradle, et il **remplace** le fichier de la version
existante — le nom porte la version, donc l'écrasement est voulu.

Les deux commencent par `npm run controle` : **un binaire qui compile n'est pas un binaire
juste**, et la porte est franchie avant que Gradle ou Xcode ne démarre. Les deux vérifient
ensuite que le paquet livré **contient réellement l'application**, en cherchant des chemins
de routes dans le bundle Hermes (`scripts/verifier-contenu-paquet.mjs`). Ce contrôle a été
éprouvé sur de vrais exports des deux plateformes avant d'être branché.

Deux mesures s'ajoutent, une par plateforme, et chacune couvre un défaut qui ne se voit
nulle part ailleurs :

- **Android** — `apksigner verify --print-certs` dit avec quelle clé le fichier a été signé.
  Un APK non signé ne s'installe pas, et rien ne le signale au moment de la compilation.
- **iOS** — la plateforme du binaire est lue sur deux témoins indépendants
  (`DTPlatformName` dans `Info.plist`, `LC_BUILD_VERSION` dans chaque tranche Mach-O). Sans
  cela, un binaire de **simulateur** serait livré comme « à re-signer » — or il ne
  s'installera sur aucun iPhone, même signé.

Un réglage de compilation s'y ajoute, et il vient d'une panne réelle. `expo prebuild` écrit un
`android/gradle.properties` qui fixe `org.gradle.jvmargs=-Xmx2048m` ; la fusion des dex par D8
est passée juste au-dessus pour la version 1.1.0, et la compilation Android est morte après
vingt-quatre minutes sur `java.lang.OutOfMemoryError: Java heap space`. Le flux relève donc le
tas **après** `prebuild` — le poser avant serait perdu, puisque `prebuild` réécrit ce fichier —
et relit la ligne écrite : une substitution qui n'a pas mordu fait échouer l'étape en une
seconde, au lieu de laisser la panne se reproduire vingt-quatre minutes plus tard.

### Ce qu'il faut savoir sur les deux fichiers

**L'APK s'installe directement.** C'est le seul des deux qui soit utilisable tel quel.

**L'IPA ne s'installe pas tel quel.** Il n'est **pas signé**, et iOS refuse tout ce qui n'a
pas de signature. C'est un produit intermédiaire : il se re-signe sur un Mac (Sideloadly,
AltStore) ou sur l'iPhone (eSign). Le résumé de l'exécution porte la procédure complète.
Trois points qui font perdre du temps :

- **Mode développeur obligatoire** (iOS 16+) : Réglages → Confidentialité et sécurité →
  Mode développeur, puis redémarrer. Sans lui, l'installation échoue.
- Le **mot de passe principal** de l'identifiant Apple, et non un mot de passe
  d'application : celui-ci est refusé avec un compte gratuit.
- Sous Windows, iTunes doit venir du **site d'Apple** — la version du Microsoft Store
  n'installe pas les pilotes Apple Mobile Device, et Sideloadly répond
  « No devices detected ».

**L'APK est un paquet universel**, et c'est ce qui explique ses 108 Mo : il embarque quatre
architectures (`arm64-v8a`, `armeabi-v7a`, `x86`, `x86_64`) alors qu'un Android récent n'en
utilise qu'une. Un APK limité à `arm64-v8a` serait environ quatre fois plus léger. Le
réglage vit dans `android/gradle.properties`, un fichier **généré** par `expo prebuild` :
le modifier à la main serait perdu à la compilation suivante.

**L'APK est signé avec la clé de débogage publique d'Expo**, sauf si les secrets
`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` et
`ANDROID_KEY_PASSWORD` sont renseignés dans le dépôt. Ce n'est pas une supposition, c'est
mesuré sur le fichier livré : `apksigner` y lit
`CN=Android Debug, OU=Android, O=Unknown, C=US`, empreinte SHA-256
`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`. Il s'installe
parfaitement, mais une clé de débogage ne permet pas de **remplacer** une installation par
une autre version — il faut désinstaller d'abord — et un `.aab` signé ainsi serait refusé par
Google Play. Pour une vraie clé, voir `signer-une-application-android-sans-exposer-la-cle`.

### Par EAS Build

Le projet est aussi configuré pour **EAS Build** (`eas.json`), avec trois profils :

| Profil | Usage |
| --- | --- |
| `development` | Compilation de développement, client interne |
| `preview` | Build interne installable sur un iPhone |
| `production` | Build de distribution, version incrémentée automatiquement |

```bash
npx eas-cli build --platform ios --profile preview
```

EAS signe réellement, mais demande un compte Apple Developer. Les flux GitHub Actions,
eux, ne demandent ni compte payant ni Mac.

Identifiants du paquet : `fr.gestionflotte.app` (iOS et Android).
Schéma d'URL : `gestion-flotte`.

## Architecture

```
app/                    Routes (expo-router, routage par fichiers)
  (tabs)/               Les cinq onglets + « Plus »
  ajout/                Formulaires de création rapide
  vehicule/[id].tsx     Fiche véhicule
  locataire/            Liste et fiche locataire
  location/[id].tsx     Fiche location
  contrat/[id].tsx      Contrat et signature
  etat-lieux/           État des lieux
  retour/               Retour de véhicule
  documents, notifications, parametres, recherche, export, sauvegarde

src/domain/             Règles métier pures — aucun import de base ni d'interface
src/data/               SQLite : schéma, migrations, dépôts
src/services/           Matériel et système : chiffrement, fichiers, notifications, PDF
src/state/              Contexte applicatif et valeurs dérivées
src/ui/                 Composants réutilisables, thème, graphiques

tests/                  Bancs de test (node:test + node:sqlite)
scripts/                Chargeur d'alias ESM, doublures des modules natifs,
                        contrôle des flux de travail, contrôle des permissions
.github/workflows/      Intégration continue
```

Quelques décisions qui expliquent le reste du code :

- **La couche `domain/` est pure.** Elle ne connaît ni SQLite ni React. C'est ce qui rend
  les calculs testables sans rien simuler, et c'est là que vivent toutes les règles.
- **L'argent est un entier de centimes**, jamais un flottant. Les dates métier sont des
  chaînes `AAAA-MM-JJ`, comparables telles quelles.
- **Aucun geste courant ne détruit.** Les enregistrements sont archivés (`archivedAt`), et
  les clés étrangères sont en `ON DELETE RESTRICT`. Un véhicule vendu reste dans
  l'historique. Deux exceptions, et deux seulement, explicites et gardées : la **zone de
  danger** des réglages, et la suppression des **fichiers** du coffre. Encore la base
  refuse-t-elle d'elle-même ce qu'une clé étrangère protège.
- **Le schéma est versionné** par `PRAGMA user_version`, avec des migrations additives.
- **Les fichiers joints sont adressés par identifiant**, jamais par un chemin choisi par
  l'utilisateur, pour qu'un déplacement de l'application ne casse pas les liens.

## Modèle de données

23 tables, 36 index, deux migrations.

| Domaine | Tables |
| --- | --- |
| Parc | `vehicles`, `insurances`, `mileage_records`, `vehicle_documents` |
| Locations | `rentals`, `contracts`, `clauses`, `inspections`, `damages` |
| Personnes | `tenants`, `tenant_documents` |
| Argent | `payments`, `payment_methods`, `expenses`, `expense_categories` |
| Entretien | `maintenance_plans`, `maintenance_records`, `maintenance_types` |
| Référentiels | `document_types`, `settings`, `notifications`, `files`, `meta` |

Les listes de référence (types de documents, catégories de dépenses, moyens de paiement,
types d'entretien, clauses) sont des tables : elles se modifient depuis l'application,
elles ne sont pas figées dans le code.

### Faire évoluer le schéma

Le schéma a une version, portée par `PRAGMA user_version`, et **une version ne se réécrit
jamais**. `SCHEMA_V1` décrit la forme que portent les bases déjà installées : y ajouter une
colonne ne la donnerait qu'aux bases neuves, et laisserait les autres sans elle alors que la
version resterait à 1 — donc aucune migration ne serait jouée. Le défaut ne se verrait que sur
un appareil qui a déjà servi, c'est-à-dire partout sauf sur la machine où le code est écrit.

Une évolution s'ajoute donc comme **une nouvelle entrée** dans `MIGRATIONS`, jamais comme une
retouche. Une base neuve joue toutes les migrations dans l'ordre ; une base installée joue les
manquantes. Les deux lisent la même liste, donc elles ne peuvent pas diverger.

Le banc `tests/migration.test.ts` construit une base **ancienne et remplie**, la migre, et
compare sa forme — colonnes **et leur ordre**, plus les index — à celle d'une base neuve. Le
contrôle décisif n'est pas « les données sont encore là » : une colonne oubliée passe ce
premier contrôle et échoue au second. Trois gardes empêchent un vert creux : la base de départ
ne doit pas déjà porter la colonne, la table visée ne doit pas être vide, et le nombre de
tables doit correspondre à `TABLES`.

## Export et sauvegarde

### Export (`Paramètres → Export`)

Deux modes :

- **Tableaux (CSV)** — véhicules, locataires, locations, paiements, dépenses, entretien,
  kilométrage, documents. Chaque jeu de données affiche son nombre de lignes et refuse
  l'export s'il est vide. « Tout exporter » les enchaîne et vous dit lesquels sont déjà
  sortis si le partage est interrompu.
- **États (PDF)** — un rapport de parc, et un rapport par véhicule (revenus,
  exploitation, amortissement, récupération, identification).

Dans les CSV, les montants sont écrits en décimales françaises, les distances en nombres
bruts (pour qu'un tableur puisse les sommer), et une valeur absente est une cellule vide,
jamais un `0`.

### Sauvegarde (`Paramètres → Sauvegarde`)

Export d'une archive complète, chiffrée par un mot de passe que vous choisissez, écrite à
l'emplacement que vous désignez. La restauration se fait depuis cette archive. C'est le
seul moyen d'emporter les pièces justificatives du coffre, et il est chiffré.

## Limites connues

- **Le moment du paiement se choisit à la création, et ne se modifie plus ensuite.** Il n'existe
  pas d'écran pour modifier les conditions d'une location après coup : les seules actions
  possibles sont l'activation, la clôture et l'annulation. Changer le moment du paiement sur une
  location en cours demanderait de **régénérer** un échéancier dont une partie est peut-être déjà
  réglée — une opération qui touche à l'argent et qui mérite son propre écran, pas un bouton.
- **Le libellé de l'onglet « + » a été retiré, mais son rendu n'a pas été vu.** L'option
  `tabBarShowLabel: false` existe bien dans la version installée (vérifié dans les types du
  paquet), et le « + » reste, avec son étiquette d'accessibilité. Reste à confirmer sur un
  téléphone que le rond n'est pas décalé par la place libérée.
- **Les tests ne couvrent pas la couche `app/`.** Ils portent sur les règles métier et la
  persistance. Les écrans sont vérifiés par le contrôle de types, pas par des tests de
  rendu. Les doublures de `scripts/stubs/` remplacent les modules natifs : un défaut qui
  ne se manifesterait que sur l'appareil — par exemple un répertoire créé comme un
  fichier — ne serait pas vu par le banc.
- **Aucun linter n'est installé.** Le brief en prévoyait un en intégration continue, mais
  `npm install --save-dev eslint eslint-config-expo` a échoué sur cette machine, et
  `package.json` a été laissé intact plutôt que modifié à moitié. La chaîne vérifie donc
  les types, les tests et la configuration — pas le style. Pour l'ajouter :

  ```bash
  npm install --save-dev eslint eslint-config-expo
  npx expo lint
  ```

  puis une étape `npm run lint` dans `.github/workflows/ci.yml`.
- **`react-native-reanimated` et `react-native-worklets` sont inutilisés par le code, mais
  présents dans le paquet.** Mesuré le 29 septembre 2026 sur un bundle de développement :
  1 408 occurrences de `react-native-reanimated`. La cause n'est pas `expo-router` mais
  `react-native-gesture-handler`, dont le point d'entrée réexporte ses composants fondés sur
  Reanimated — et `app/_layout.tsx` importe `GestureHandlerRootView` depuis ce point d'entrée.
  Les retirer demanderait de renoncer à `gesture-handler` ; le gain est un poids de bundle,
  pas un défaut de fonctionnement.
- **Le balayage ne se vérifie pas sans appareil.** Le paquet se construit avec le composant
  (prouvé : `SwipeAction` et `overshootRight` sont dans les bundles Android et iOS), mais
  qu'un doigt ouvre réellement le panneau, que le seuil soit confortable et que le geste
  n'entre pas en conflit avec le défilement de la liste : cela demande un téléphone. C'est le
  même pas qui reste pour les deux binaires.
- **Les binaires existent, mais aucun n'a encore été installé sur un appareil.** Les deux flux
  de compilation ont abouti pour les versions `1.0.0` et `1.1.0` et publié leurs fichiers, chacun vérifié —
  contenu du paquet, signature côté Android, plateforme côté iOS. Mais « le paquet contient
  l'application » n'est pas « l'application s'ouvre et fonctionne » : ce dernier pas demande un
  téléphone, et c'est le seul qui reste.
- **Android n'a jamais été exécuté.** Le code est écrit pour être compatible, le paquet est
  renseigné et l'APK se compile, mais aucune exécution sur Android n'a servi de référence :
  seuls iOS et le contrôle de types l'ont été. Les différences les plus probables sont
  d'ordre visuel (barre d'état, marges sûres) et non fonctionnel.
