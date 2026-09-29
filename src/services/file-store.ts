/**
 * Coffre de fichiers : stockage local, chiffré, hors de portée des autres applications.
 *
 * ## Où vivent les fichiers
 *
 * Dans le dossier **privé** de l'application (`Paths.document`), sous `coffre/`. Sur iOS,
 * ce dossier n'est pas exposé dans l'application Fichiers, n'apparaît pas dans un partage
 * et n'est pas lisible par une autre application. Rien n'est jamais écrit dans un dossier
 * public, et aucune URL publique n'est produite.
 *
 * ## Ce que contient la base, et ce qu'elle ne contient pas
 *
 * La base SQLite garde les **métadonnées** : type, numéro, dates, chemin relatif. Le
 * contenu — le scan du permis, la photo de la carte grise — vit sur le disque, chiffré en
 * AES-256-GCM avec la clé du coffre. Un vidage de la base ne donne donc aucun document.
 *
 * ## Le nom sur le disque
 *
 * Chaque fichier est écrit sous son **identifiant**, sans extension : `coffre/<uuid>`. Un
 * nom comme `permis-ahmed.pdf` dirait déjà beaucoup à qui lirait la liste du dossier, et
 * une extension permettrait de trier les documents par nature. Le nom d'origine, lui, est
 * conservé en base, à côté du type et du numéro.
 *
 * ## Le port
 *
 * Le disque est derrière `FilePort`. Le magasin lui-même — chemins, empreinte, chiffrement,
 * refus des chemins traversants — s'éprouve donc sans appareil, avec un port en mémoire.
 */

import { Directory, File, Paths } from 'expo-file-system';
import type { StoredFile } from '@/data/mappers';
import { open, seal, sha256Hex, utf8Bytes, bytesToUtf8, type RandomBytes } from './crypto';

/** Dossier du coffre, relatif au dossier privé de l'application. */
export const VAULT_DIRECTORY = 'coffre';

/**
 * Accès disque minimal.
 *
 * Les chemins manipulés ici sont **relatifs** au dossier privé : un port ne peut pas être
 * détourné vers un autre dossier par un chemin absolu fourni par mégarde.
 */
export interface FilePort {
  ensureDirectory(): Promise<void>;
  write(relativePath: string, bytes: Uint8Array): Promise<void>;
  read(relativePath: string): Promise<Uint8Array>;
  remove(relativePath: string): Promise<void>;
  exists(relativePath: string): Promise<boolean>;
  /** Lit un fichier choisi hors du coffre (sélecteur de documents, photothèque). */
  readExternal(uri: string): Promise<Uint8Array>;
}

/**
 * Un chemin relatif est-il acceptable ?
 *
 * On refuse tout ce qui pourrait sortir du coffre : segment vide, `.`, `..`, séparateur
 * inversé, chemin absolu, ou deux-points de lecteur Windows. Le refus est ici, au point
 * d'entrée, et pas seulement à la fabrication du chemin.
 */
export function isSafeRelativePath(relativePath: string): boolean {
  if (relativePath === '' || relativePath.startsWith('/') || relativePath.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(relativePath)) return false;
  if (relativePath.includes('\\')) return false;
  const segments = relativePath.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function assertSafeRelativePath(relativePath: string): void {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Chemin de coffre refusé : « ${relativePath} ».`);
  }
}

/** Port réel, adossé à `expo-file-system`. */
export const expoFilePort: FilePort = {
  async ensureDirectory(): Promise<void> {
    // `Directory`, et non `File` : `create()` existe sur les deux, et `FileCreateOptions`
    // accepte aussi `intermediates` — le typage ne dit donc rien. Mais un `File` créerait
    // un **fichier** nommé `coffre`, et l'écriture de `coffre/<id>` échouerait ensuite.
    const directory = new Directory(Paths.document, VAULT_DIRECTORY);
    if (!directory.exists) {
      // `intermediates` crée le dossier privé s'il manque encore au tout premier lancement.
      directory.create({ intermediates: true });
    }
  },

  async write(relativePath: string, bytes: Uint8Array): Promise<void> {
    assertSafeRelativePath(relativePath);
    const file = new File(Paths.document, ...relativePath.split('/'));
    // `create` est nécessaire avant `write` : `write` ne crée pas le fichier.
    if (!file.exists) file.create();
    file.write(bytes);
  },

  async read(relativePath: string): Promise<Uint8Array> {
    assertSafeRelativePath(relativePath);
    const file = new File(Paths.document, ...relativePath.split('/'));
    if (!file.exists) {
      throw new Error(`Fichier absent du coffre : « ${relativePath} ».`);
    }
    return file.bytes();
  },

  async remove(relativePath: string): Promise<void> {
    assertSafeRelativePath(relativePath);
    const file = new File(Paths.document, ...relativePath.split('/'));
    if (file.exists) file.delete();
  },

  async exists(relativePath: string): Promise<boolean> {
    if (!isSafeRelativePath(relativePath)) return false;
    return new File(Paths.document, ...relativePath.split('/')).exists;
  },

  async readExternal(uri: string): Promise<Uint8Array> {
    return new File(uri).bytes();
  },
};

export interface SaveFileInput {
  kind: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  notes?: string;
}

export interface VaultFileStore {
  /** Enregistre des octets et rend la ligne à insérer en base. */
  save(input: SaveFileInput): Promise<StoredFile>;
  /**
   * Enregistre des octets à un chemin **imposé**.
   *
   * Réservé à la restauration : une sauvegarde contient des lignes `files` qui désignent
   * chacune un chemin précis, et la ligne restaurée pointera ce chemin-là. Écrire le
   * contenu sous un identifiant neuf rendrait chaque document introuvable — la ligne
   * désignerait un chemin que rien n'occupe.
   *
   * Le chemin est validé comme les autres : une archive est une donnée extérieure.
   */
  saveAt(relativePath: string, bytes: Uint8Array): Promise<void>;
  /** Enregistre depuis un fichier choisi hors du coffre. */
  saveFromUri(input: Omit<SaveFileInput, 'bytes'> & { uri: string }): Promise<StoredFile>;
  /** Relit et déchiffre le contenu. Lève si l'authentification GCM échoue. */
  read(file: Pick<StoredFile, 'relativePath' | 'fileName'>): Promise<Uint8Array>;
  /** Relit du texte — pour un export CSV ou un HTML de contrat relu depuis le coffre. */
  readText(file: Pick<StoredFile, 'relativePath' | 'fileName'>): Promise<string>;
  /** Supprime le contenu. La ligne en base est archivée séparément, par le dépôt. */
  remove(file: Pick<StoredFile, 'relativePath'>): Promise<void>;
  exists(file: Pick<StoredFile, 'relativePath'>): Promise<boolean>;
}

export interface VaultFileStoreOptions {
  port: FilePort;
  /** Clé du coffre. Sa taille est validée par `seal`. */
  key: Uint8Array;
  random: RandomBytes;
  newId: () => string;
  now: () => string;
}

export function createVaultFileStore(options: VaultFileStoreOptions): VaultFileStore {
  const { port, key, random, newId, now } = options;

  async function writeNew(
    input: SaveFileInput,
  ): Promise<StoredFile> {
    await port.ensureDirectory();
    const id = newId();
    // Pas d'extension sur le disque : voir l'en-tête du module.
    const relativePath = `${VAULT_DIRECTORY}/${id}`;

    const container = seal(key, input.bytes, random);
    await port.write(relativePath, container);

    const timestamp = now();
    return {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      // La taille enregistrée est celle du contenu **en clair** : c'est ce que l'utilisateur
      // reconnaît, et la taille du conteneur dépendrait du remplissage du chiffrement.
      sizeBytes: input.bytes.length,
      relativePath,
      encrypted: true,
      // L'empreinte porte sur le contenu en clair, donc elle est comparable d'un appareil à
      // l'autre après restauration d'une sauvegarde.
      sha256: sha256Hex(input.bytes),
      notes: input.notes ?? '',
    };
  }

  /**
   * Hisse la lecture hors du littéral : `this` ne survit pas à une déstructuration, et un
   * magasin passé en paramètre est précisément le cas d'usage courant.
   */
  async function readBytes(file: Pick<StoredFile, 'relativePath' | 'fileName'>): Promise<Uint8Array> {
    const container = await port.read(file.relativePath);
    try {
      return open(key, container);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      // Message explicite : les deux causes possibles sont une clé de coffre qui a changé
      // et un fichier altéré. Les confondre laisserait l'utilisateur sans piste.
      throw new Error(
        `« ${file.fileName} » n’a pas pu être déchiffré (${detail}). ` +
          'La clé du coffre de cet appareil ne correspond probablement plus à ce fichier.',
      );
    }
  }

  async function saveFromUri(
    input: Omit<SaveFileInput, 'bytes'> & { uri: string },
  ): Promise<StoredFile> {
    const bytes = await port.readExternal(input.uri);
    return writeNew({
      kind: input.kind,
      fileName: input.fileName,
      mimeType: input.mimeType,
      bytes,
      notes: input.notes,
    });
  }

  async function readText(file: Pick<StoredFile, 'relativePath' | 'fileName'>): Promise<string> {
    return bytesToUtf8(await readBytes(file));
  }

  async function remove(file: Pick<StoredFile, 'relativePath'>): Promise<void> {
    await port.remove(file.relativePath);
  }

  async function exists(file: Pick<StoredFile, 'relativePath'>): Promise<boolean> {
    return port.exists(file.relativePath);
  }

  async function saveAt(relativePath: string, bytes: Uint8Array): Promise<void> {
    assertSafeRelativePath(relativePath);
    await port.ensureDirectory();
    await port.write(relativePath, seal(key, bytes, random));
  }

  return { save: writeNew, saveAt, saveFromUri, read: readBytes, readText, remove, exists };
}

/** Longueur d'un conteneur chiffré pour un contenu de `plainBytes` octets. */
export function sealedLength(plainBytes: number): number {
  // En-tête (4 + 1) + nonce (12) + cryptogramme (contenu + étiquette GCM de 16).
  return 5 + 12 + plainBytes + 16;
}

/** Ré-export utilitaire : un contenu texte devient des octets UTF-8. */
export function textBytes(text: string): Uint8Array {
  return utf8Bytes(text);
}
