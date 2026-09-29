/**
 * Production de fichiers destinés à sortir de l'application : PDF, CSV, archives.
 *
 * ## Un seul chemin, quel que soit le format
 *
 * Le fichier est écrit dans le dossier **cache**, puis remis au système par la feuille de
 * partage. C'est la seule façon, sur iOS, de laisser l'utilisateur choisir lui-même la
 * destination : Fichiers, AirDrop, Mail, WhatsApp, une application de scan. Imposer un
 * dossier à notre place serait plus simple à écrire et moins utile.
 *
 * ## Pourquoi le cache, et pas un dossier définitif
 *
 * Le cache est effacé par le système quand l'espace manque. C'est exactement ce qu'on veut
 * pour un PDF régénérable : le conserver indéfiniment ferait grossir l'application sans
 * qu'on sache plus tard ce qui est encore utile. Le contrat signé, lui, est conservé dans
 * le coffre — c'est la seule copie qui compte.
 *
 * ## Le nom du fichier
 *
 * Il est nettoyé par `safeFileName` : un nom de locataire saisi par l'utilisateur peut
 * contenir une barre oblique ou des points de tête. Le laisser passer ferait écrire dans
 * un autre dossier, ou produirait un fichier caché.
 */

import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { safeFileName } from '@/domain/csv';

export interface OutputFile {
  /** URI absolue du fichier écrit. */
  uri: string;
  /** Nom du fichier, tel que le système le présentera. */
  name: string;
  sizeBytes: number;
}

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  csv: 'text/csv',
  json: 'application/json',
  txt: 'text/plain',
  html: 'text/html',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  webp: 'image/webp',
};

/** Types UTI Apple : sans eux, certaines applications refusent d'apparaître dans le partage. */
const UTI_TYPES: Record<string, string> = {
  pdf: 'com.adobe.pdf',
  csv: 'public.comma-separated-values-text',
  json: 'public.json',
  txt: 'public.plain-text',
  html: 'public.html',
  jpg: 'public.jpeg',
  jpeg: 'public.jpeg',
  png: 'public.png',
  heic: 'public.heic',
  webp: 'org.webmproject.webp',
};

export function mimeFor(extension: string): string {
  return MIME_TYPES[extension.toLowerCase()] ?? 'application/octet-stream';
}

function utiFor(extension: string): string | undefined {
  return UTI_TYPES[extension.toLowerCase()];
}

/** Écrit un fichier dans le cache. Le nom est nettoyé, l'extension est normalisée. */
function writeToCache(base: string, extension: string, content: string | Uint8Array): OutputFile {
  const name = safeFileName(base, extension.replace(/^\./, '').toLowerCase());
  const file = new File(Paths.cache, name);
  // `create` refuse d'écraser : un export du même nom deux fois de suite doit pourtant
  // fonctionner, donc on repart d'un fichier neuf.
  if (file.exists) file.delete();
  file.create();
  file.write(content);
  return { uri: file.uri, name, sizeBytes: file.size ?? 0 };
}

export function writeTextOutput(base: string, extension: string, text: string): OutputFile {
  return writeToCache(base, extension, text);
}

export function writeBytesOutput(base: string, extension: string, bytes: Uint8Array): OutputFile {
  return writeToCache(base, extension, bytes);
}

/**
 * Rend un HTML en PDF.
 *
 * Le HTML est passé tel quel au moteur de rendu du système : c'est lui qui sait composer
 * une page A4, couper les tableaux et paginer. Les feuilles de style de `domain/html`
 * sont écrites pour ce moteur.
 */
export async function pdfFromHtml(html: string, base: string): Promise<OutputFile> {
  const result = await Print.printToFileAsync({ html });
  const target = new File(Paths.cache, safeFileName(base, 'pdf'));
  if (target.exists) target.delete();

  // `printToFileAsync` écrit dans un fichier temporaire au nom imprévisible ; on le
  // déplace vers un nom lisible, sans quoi la feuille de partage proposerait
  // « Print-1234-5678.pdf » et l'utilisateur ne saurait pas ce qu'il envoie.
  const produced = new File(result.uri);
  produced.move(target);

  return { uri: target.uri, name: target.name, sizeBytes: target.size ?? 0 };
}

/**
 * Ouvre la boîte de dialogue d'impression.
 * Rend `false` si l'utilisateur annule : ce n'est pas une erreur.
 */
export async function printHtml(html: string): Promise<boolean> {
  try {
    await Print.printAsync({ html });
    return true;
  } catch {
    return false;
  }
}

export async function sharingAvailable(): Promise<boolean> {
  return Sharing.isAvailableAsync();
}

/**
 * Remet un fichier au système.
 *
 * La feuille de partage est le point de sortie unique : enregistrer dans Fichiers,
 * envoyer par Mail, transférer par AirDrop ou imprimer depuis une autre application
 * passent tous par là.
 */
export async function shareOutput(file: OutputFile, dialogTitle: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage n'est pas disponible sur cet appareil.");
  }
  const extension = file.name.split('.').pop() ?? '';
  await Sharing.shareAsync(file.uri, {
    dialogTitle,
    mimeType: mimeFor(extension),
    UTI: utiFor(extension),
  });
}

/** Supprime un fichier produit. Le cache s'en chargerait, mais on ne compte pas dessus. */
export function discardOutput(file: OutputFile): void {
  const target = new File(file.uri);
  if (target.exists) target.delete();
}

/** Taille lisible : « 1,4 Mo ». */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0).replace('.', ',')} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
