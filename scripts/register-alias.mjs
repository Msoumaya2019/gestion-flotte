/**
 * Enregistre le chargeur de résolution avant la découverte des tests.
 * `--import` exécute ce fichier avant que `node --test` ne charge quoi que ce soit.
 */

import { register } from 'node:module';

register('./alias-loader.mjs', import.meta.url);
