/**
 * Doublure de `expo-router`.
 *
 * Les écrans ne sont pas testés ici — ils le sont par la compilation et par la vérification
 * du paquet. Cette doublure existe pour que le graphe de modules se charge si un module non
 * graphique venait à importer un utilitaire de navigation, et pour rendre explicite qu'un
 * `router.push` appelé dans un test ne navigue nulle part.
 */

const calls = [];

function record(kind, argument) {
  calls.push({ kind, argument });
}

export function useRouter() {
  return {
    push: (href) => record('push', href),
    replace: (href) => record('replace', href),
    back: () => record('back', undefined),
    dismiss: () => record('dismiss', undefined),
    dismissAll: () => record('dismissAll', undefined),
    navigate: (href) => record('navigate', href),
  };
}

export function useLocalSearchParams() {
  return {};
}

export function useSegments() {
  return [];
}

export function usePathname() {
  return '/';
}

export function useFocusEffect() {
  return undefined;
}

export function Link() {
  throw new Error('expo-router.Link n’est pas utilisable hors d’une application Expo.');
}

export const Redirect = Link;

export function __navigationCalls() {
  return [...calls];
}

export function __resetNavigation() {
  calls.length = 0;
}
