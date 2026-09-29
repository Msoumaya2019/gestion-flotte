/**
 * Doublure de `expo-file-system` pour les tests.
 *
 * ## Ce que cette doublure est, et ce qu'elle n'est pas
 *
 * C'est un **système de fichiers en mémoire**. Il permet d'éprouver la logique qui écrit et
 * relit des fichiers — nommage, refus des chemins traversants, nettoyage des aperçus —
 * sans appareil et sans écrire sur le disque de la machine.
 *
 * Un test qui passe contre cette doublure prouve la **logique**, pas la **plateforme**. Il
 * ne dit rien du comportement réel de l'API `File` sur iOS : ni la persistance, ni les
 * permissions, ni les différences de séparateur. Ces points-là ne s'éprouvent que sur un
 * appareil, et le croire serait le défaut classique du banc qui rassure à tort.
 */

class FakeEntry {
  constructor(name, parent) {
    this.name = name;
    this.parent = parent;
    this._content = null;
    this._isDirectory = false;
  }

  get uri() {
    const base = this.parent === null ? '/' : this.parent.uri.replace(/\/$/, '');
    return `${base}/${this.name}`;
  }

  get exists() {
    return this._content !== null;
  }

  get size() {
    return this._content === null ? null : this._content.length;
  }
}

/** Contenu partagé par toutes les instances : le disque. */
const disk = new Map();

function keyOf(uri) {
  return uri.replace(/\/+$/, '');
}

export class File extends FakeEntry {
  constructor(...segments) {
    const last = segments[segments.length - 1];
    const parent = segments.length > 1 ? segments[segments.length - 2] : null;
    super(String(last), parent instanceof FakeEntry ? parent : null);
    this._uri = segments.map((segment) => (segment instanceof FakeEntry ? segment.uri : String(segment))).join('/');
  }

  get uri() {
    return this._uri;
  }

  get exists() {
    return disk.has(keyOf(this._uri));
  }

  get size() {
    const entry = disk.get(keyOf(this._uri));
    return entry === undefined || entry.kind !== 'file' ? null : entry.bytes.length;
  }

  create() {
    if (disk.has(keyOf(this._uri))) {
      throw new Error(`Le fichier existe déjà : ${this._uri}`);
    }
    disk.set(keyOf(this._uri), { kind: 'file', bytes: new Uint8Array(0) });
  }

  write(content) {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    disk.set(keyOf(this._uri), { kind: 'file', bytes: Uint8Array.from(bytes) });
  }

  bytes() {
    const entry = disk.get(keyOf(this._uri));
    if (entry === undefined || entry.kind !== 'file') {
      throw new Error(`Fichier absent : ${this._uri}`);
    }
    return Uint8Array.from(entry.bytes);
  }

  text() {
    return new TextDecoder().decode(this.bytes());
  }

  delete() {
    disk.delete(keyOf(this._uri));
  }

  move(target) {
    const entry = disk.get(keyOf(this._uri));
    if (entry === undefined) throw new Error(`Fichier absent : ${this._uri}`);
    disk.set(keyOf(target.uri), entry);
    disk.delete(keyOf(this._uri));
  }

  list() {
    const prefix = `${keyOf(this._uri)}/`;
    const names = new Set();
    for (const stored of disk.keys()) {
      if (!stored.startsWith(prefix)) continue;
      const rest = stored.slice(prefix.length);
      if (rest.includes('/')) continue;
      names.add(rest);
    }
    return [...names].map((name) => new File(this._uri, name));
  }
}

export class Directory extends FakeEntry {
  constructor(...segments) {
    super(String(segments[segments.length - 1]), null);
    this._uri = segments.map((segment) => (segment instanceof FakeEntry ? segment.uri : String(segment))).join('/');
  }

  get uri() {
    return this._uri;
  }

  get exists() {
    return disk.has(keyOf(this._uri)) || [...disk.keys()].some((stored) => stored.startsWith(`${keyOf(this._uri)}/`));
  }

  create() {
    disk.set(keyOf(this._uri), { kind: 'directory', bytes: new Uint8Array(0) });
  }
}

export const Paths = {
  get document() {
    return new Directory('/document');
  },
  get cache() {
    return new Directory('/cache');
  },
};

/** Vide le disque simulé. À appeler entre deux tests. */
export function __resetFakeDisk() {
  disk.clear();
}
