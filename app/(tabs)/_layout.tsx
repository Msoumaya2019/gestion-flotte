/**
 * Barre de navigation basse.
 *
 * ## Cinq onglets, plus une action
 *
 * Accueil, Véhicules, Locations, Finances, Entretien : ce sont les cinq questions qu'on se
 * pose tous les jours. Le bouton « + » n'est **pas** un onglet : il ne mène nulle part, il
 * ouvre une feuille de saisie. Le placer au centre et le distinguer visuellement évite
 * qu'on le confonde avec un écran.
 *
 * ## Le « + » intercepte son propre appui
 *
 * `tabPress` est annulé par `preventDefault()`, et la navigation est détournée vers la
 * feuille de saisie. Sans cela, expo-router afficherait un écran vide en tentant d'ouvrir
 * une route sans contenu.
 */

import type { ReactElement } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import type { IconName } from '@/domain/iconNames';
import { Icon } from '@/ui/components/icons';
import { useTheme } from '@/ui/use-theme';
import { MIN_TOUCH } from '@/ui/theme';

interface TabDefinition {
  name: string;
  title: string;
  icon: IconName;
}

const TABS: readonly TabDefinition[] = [
  { name: 'index', title: 'Accueil', icon: 'home' },
  { name: 'vehicules', title: 'Véhicules', icon: 'car-multiple' },
  { name: 'locations', title: 'Locations', icon: 'key' },
  { name: 'finances', title: 'Finances', icon: 'chart-bar' },
  { name: 'entretien', title: 'Entretien', icon: 'wrench' },
];

export default function TabsLayout(): ReactElement {
  const { colors } = useTheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          // Sur iOS, la barre est plus haute : elle doit laisser passer l'indicateur
          // d'accueil, sinon les libellés passent dessous.
          height: Platform.OS === 'ios' ? 88 : 64,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <Icon name={tab.icon} size={23} color={color} strokeWidth={focused ? 2.1 : 1.8} />
            ),
          }}
        />
      ))}

      <Tabs.Screen
        name="plus"
        options={{
          title: 'Ajouter',
          // Le libellé « Ajouter » ne s'affiche pas sous le bouton : sous le rond plein, en
          // corps 11, il se lisait mal, et le « + » dit déjà ce qu'il fait. Le titre reste —
          // il nomme la route — et l'étiquette d'accessibilité, elle, reste explicite : ce qui
          // disparaît est l'encre, pas l'information.
          tabBarShowLabel: false,
          tabBarAccessibilityLabel: 'Ajouter un paiement, une dépense ou un relevé',
          tabBarIcon: () => (
            <View style={[styles.plus, { backgroundColor: colors.primary }]}>
              <Icon name="plus" size={22} color={colors.onPrimary} strokeWidth={2.4} />
            </View>
          ),
        }}
        listeners={{
          tabPress: (event) => {
            event.preventDefault();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push('/ajout');
          },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  plus: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'ios' ? 2 : 0,
    minHeight: MIN_TOUCH - 8,
  },
});
