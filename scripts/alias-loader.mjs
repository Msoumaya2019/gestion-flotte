/**
 * Chargeur de résolution pour `node --test`.
 *
 * Node n'applique pas les `paths` de `tsconfig.json` : un import `@/domain/money` échoue
 * avec `ERR_MODULE_NOT_FOUND`. Il n'applique pas non plus la résolution « sans extension »
 * d'un empaqueteur : `import { … } from './dates'` échoue de la même façon, alors que
 * Metro, Webpack et `tsc` l'acceptent tous les trois.
 *
 * Ce chargeur comble les deux, avec **le même ordre de candidats que TypeScript** — c'est
 * ce qui garantit qu'un test et l'application résolvent le même fichier. L'ordre est
 * vérifié par `tsc -p tsconfig.tests.json`, qui typecheck les mêmes sources.
 *
 * Il fournit aussi des doublures pour les paquets natifs, qu'un processus Node ne peut pas
 * charger : `react-native`, `expo-*`. Les doublures sont listées **une par une** : une
 * règle par préfixe remplacerait en silence un paquet qu'on voulait réellement charger.
 */

import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_ROOT = `${PROJECT_ROOT}src/`;

/** Ordre identique à la résolution `bundler` de TypeScript. */
const EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js'];

/** Doublures de paquets natifs, par nom exact. */
const STUBS = new Map([
  ['react-native', './stubs/react-native.mjs'],
  ['expo-crypto', './stubs/expo-crypto.mjs'],
  ['expo-sqlite', './stubs/expo-sqlite.mjs'],
  ['expo-file-system', './stubs/expo-file-system.mjs'],
  ['expo-secure-store', './stubs/expo-secure-store.mjs'],
  ['expo-notifications', './stubs/expo-notifications.mjs'],
  ['expo-print', './stubs/expo-print.mjs'],
  ['expo-sharing', './stubs/expo-sharing.mjs'],
  ['expo-local-authentication', './stubs/expo-local-authentication.mjs'],
  ['expo-document-picker', './stubs/expo-document-picker.mjs'],
  ['expo-image-picker', './stubs/expo-image-picker.mjs'],
  ['expo-haptics', './stubs/expo-haptics.mjs'],
  ['expo-router', './stubs/expo-router.mjs'],
]);

function firstExisting(base) {
  if (existsSync(base) && statSync(base).isFile()) return base;
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

export function resolve(specifier, context, next) {
  const stub = STUBS.get(specifier);
  if (stub !== undefined) {
    return next(new URL(stub, import.meta.url).href, context);
  }

  if (specifier.startsWith('@/')) {
    const resolved = firstExisting(SOURCE_ROOT + specifier.slice(2));
    if (resolved === null) {
      throw new Error(`Alias « @/ » non résolu : « ${specifier} » (cherché sous ${SOURCE_ROOT}${specifier.slice(2)})`);
    }
    return next(pathToFileURL(resolved).href, context);
  }

  // Imports relatifs sans extension : `./dates`, `../domain/money`.
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL !== undefined) {
    const parentPath = fileURLToPath(context.parentURL);
    const base = new URL(specifier, context.parentURL);
    const resolved = firstExisting(fileURLToPath(base));
    if (resolved === null) {
      throw new Error(
        `Import relatif non résolu : « ${specifier} » depuis ${parentPath} (cherché ${fileURLToPath(base)})`,
      );
    }
    return next(pathToFileURL(resolved).href, context);
  }

  return next(specifier, context);
}
