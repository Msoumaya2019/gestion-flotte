/**
 * Doublure de `react-native`.
 *
 * Aucun composant n'est rendu hors d'un appareil ou d'un moteur de rendu de test : cette
 * doublure ne dessine rien. Elle fournit les quelques valeurs que des modules **non
 * graphiques** pourraient lire — `Platform`, `AppState`, `StyleSheet` — et fait échouer
 * bruyamment toute tentative de créer un composant.
 *
 * C'est volontaire : un test qui croirait rendre un écran ne rendrait rien, et passerait
 * en ne vérifiant rien.
 */

export const Platform = {
  OS: 'ios',
  Version: '18.0',
  select: (options) => options.ios ?? options.default,
};

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => undefined }),
};

export const StyleSheet = {
  create: (styles) => styles,
  hairlineWidth: 0.5,
  absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
};

export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
};

export const PixelRatio = {
  get: () => 3,
  getFontScale: () => 1,
};

function unavailable(name) {
  return function MissingComponent() {
    throw new Error(
      `react-native.${name} n’est pas doublé : un test ne rend pas de composant. ` +
        'La vérification des écrans passe par la compilation du paquet.',
    );
  };
}

export const View = unavailable('View');
export const Text = unavailable('Text');
export const TextInput = unavailable('TextInput');
export const ScrollView = unavailable('ScrollView');
export const Pressable = unavailable('Pressable');
export const Switch = unavailable('Switch');
export const ActivityIndicator = unavailable('ActivityIndicator');
export const Image = unavailable('Image');
export const FlatList = unavailable('FlatList');
export const SafeAreaView = unavailable('SafeAreaView');
