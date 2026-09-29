/**
 * Retirer une fiche du parc ou du carnet d'adresses.
 *
 * ## Pourquoi une règle, et pas un `if` dans chaque écran
 *
 * La même décision était recopiée dans le formulaire du véhicule et dans celui du
 * locataire : « une location en cours ? alors on refuse ». Elle allait l'être une
 * troisième et une quatrième fois par le balayage des listes. Quatre copies d'une règle
 * qui décide d'une perte de données, c'est trois occasions de l'écrire de travers.
 *
 * ## Ce que la règle décide, et pourquoi dans cet ordre
 *
 * 1. **Une location en cours fait refuser.** Le véhicule est sorti, le locataire l'a en
 *    main. Le retirer de la liste le rendrait introuvable pendant que la location, elle,
 *    continue de le désigner.
 * 2. **Sinon, on archive — jamais on ne détruit.** Le reste de l'application est bâti
 *    là-dessus : les échéances, les dépenses et les états des lieux d'une année passée
 *    portent les chiffres qu'on relit. Les détruire rendrait ces chiffres faux.
 *
 * Le module ne connaît ni React ni SQLite : il reçoit des **entiers** et rend une phrase.
 * C'est ce qui permet de l'éprouver sans monter une base ni un écran.
 */

/** Ce que l'on retire. Le libellé s'accorde, et le refus ne dit pas la même chose. */
export type Cible = 'vehicule' | 'locataire';

/**
 * Ce qui pointe vers une fiche.
 *
 * `locations` compte **toutes** les locations, `locationsEnCours` seulement celles qui
 * courent : la première nourrit le message, la seconde déclenche le refus.
 */
export interface Liens {
  readonly locationsEnCours: number;
  readonly locations: number;
  readonly echeances: number;
  readonly depenses: number;
  readonly entretiens: number;
  readonly documents: number;
  /** Assurances, plans d'entretien, relevés de kilométrage, états des lieux, dommages. */
  readonly autres: number;
}

/** Le refus porte un motif ; l'archivage porte de quoi remplir une confirmation. */
export type Verdict =
  | { readonly kind: 'refus'; readonly message: string }
  | {
      readonly kind: 'archivage';
      readonly titre: string;
      readonly message: string;
      readonly libelle: string;
    };

const VIDE: Liens = {
  locationsEnCours: 0,
  locations: 0,
  echeances: 0,
  depenses: 0,
  entretiens: 0,
  documents: 0,
  autres: 0,
};

/** Comble les familles absentes : un appelant n'énumère que ce qu'il connaît. */
export function liens(partiel: Partial<Liens> = {}): Liens {
  return { ...VIDE, ...partiel };
}

export function totalLiens(valeurs: Liens): number {
  return (
    valeurs.locations +
    valeurs.echeances +
    valeurs.depenses +
    valeurs.entretiens +
    valeurs.documents +
    valeurs.autres
  );
}

/**
 * « 1 document », « 4 dépenses ».
 *
 * En français, zéro et un prennent le singulier : « 0 location », « 1 location ». Le seuil
 * est donc `> 1`, et non `!== 1`. Les familles de ce module ont toutes un pluriel
 * régulier ; une famille irrégulière devrait passer son pluriel à la main.
 *
 * Exporté : l'inventaire des réglages annonce les mêmes familles, et deux accords
 * divergents se liraient comme deux bugs.
 */
export function compter(nombre: number, singulier: string, pluriel?: string): string {
  if (nombre <= 1) return `${nombre} ${singulier}`;
  return `${nombre} ${pluriel ?? `${singulier}s`}`;
}

/** Les familles non vides, dans l'ordre où on les annonce : le plus lourd d'abord. */
function familles(valeurs: Liens): string[] {
  const annonces: { poids: number; texte: string }[] = [
    { poids: valeurs.locations, texte: compter(valeurs.locations, 'location') },
    { poids: valeurs.echeances, texte: compter(valeurs.echeances, 'échéance') },
    { poids: valeurs.depenses, texte: compter(valeurs.depenses, 'dépense') },
    { poids: valeurs.entretiens, texte: compter(valeurs.entretiens, 'entretien') },
    { poids: valeurs.documents, texte: compter(valeurs.documents, 'document') },
    { poids: valeurs.autres, texte: compter(valeurs.autres, 'autre écriture') },
  ];
  return annonces
    .filter((annonce) => annonce.poids > 0)
    .sort((a, b) => b.poids - a.poids)
    .map((annonce) => annonce.texte);
}

/** « a, b et c » — une énumération qui se lit, sans virgule avant le dernier terme. */
function enumerer(elements: readonly string[]): string {
  if (elements.length <= 1) return elements.join('');
  return `${elements.slice(0, -1).join(', ')} et ${elements[elements.length - 1]}`;
}

const NOM_CIBLE: Record<Cible, string> = {
  vehicule: 'ce véhicule',
  locataire: 'ce locataire',
};

/**
 * Le refus, mot pour mot celui des formulaires.
 *
 * Il est écrit en dur plutôt que composé : c'est une phrase qu'un utilisateur a déjà lue,
 * et la recomposer ferait diverger la liste de la fiche à la première retouche.
 */
const REFUS: Record<Cible, string> = {
  vehicule: 'Ce véhicule a une location en cours : terminez-la avant de l’archiver.',
  locataire: 'Ce locataire a une location en cours : terminez-la avant de l’archiver.',
};

/** Décide, et rédige. */
export function verdictSuppression(cible: Cible, nom: string, valeurs: Liens): Verdict {
  if (valeurs.locationsEnCours > 0) {
    return { kind: 'refus', message: REFUS[cible] };
  }

  const annonces = familles(valeurs);
  const titre = `Retirer ${NOM_CIBLE[cible]} ?`;
  const etiquette = nom.trim() === '' ? 'Cette fiche' : `« ${nom.trim()} »`;

  const message =
    annonces.length === 0
      ? `${etiquette} ne porte aucune donnée. Il sera archivé : masqué des listes, et restaurable à tout moment.`
      : `${etiquette} porte ${enumerer(annonces)}. Il sera archivé : masqué des listes, son historique est conservé et vous pourrez le restaurer.`;

  return { kind: 'archivage', titre, message, libelle: 'Archiver' };
}
