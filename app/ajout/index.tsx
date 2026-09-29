/**
 * Feuille de saisie rapide.
 *
 * ## Le principe : trois gestes au maximum
 *
 * Enregistrer un loyer encaissé doit se faire sans réfléchir. La feuille propose donc les
 * sept gestes du quotidien, et chaque destination ouvre un formulaire **déjà pré-rempli**
 * avec ce qui est devinable — le véhicule s'il n'y en a qu'un, la date du jour, le montant
 * attendu du loyer en cours.
 *
 * ## L'ordre des entrées
 *
 * Paiement, dépense, kilométrage d'abord : ce sont les trois qu'on fait tous les jours.
 * Ensuite entretien, réparation, document, incident. L'ordre n'est pas alphabétique, il est
 * celui de la fréquence.
 */

import type { ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { IconName } from '@/domain/iconNames';
import { AppText } from '@/ui/components/text';
import { Icon } from '@/ui/components/icons';
import { Card, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { radius, spacing, toneColors } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import type { Tone } from '@/domain/catalog';

interface Action {
  route: string;
  icon: IconName;
  tone: Tone;
  label: string;
  hint: string;
}

const DAILY: readonly Action[] = [
  {
    route: '/ajout/paiement',
    icon: 'banknote',
    tone: 'ok',
    label: 'Loyer reçu',
    hint: 'Encaisser une échéance, en totalité ou en partie',
  },
  {
    route: '/ajout/depense',
    icon: 'receipt',
    tone: 'warn',
    label: 'Dépense',
    hint: 'Assurance, carburant, nettoyage, frais divers',
  },
  {
    route: '/ajout/kilometrage',
    icon: 'gauge',
    tone: 'accent',
    label: 'Kilométrage',
    hint: 'Relever le compteur et recalculer les échéances',
  },
];

const OCCASIONAL: readonly Action[] = [
  {
    route: '/ajout/entretien',
    icon: 'wrench',
    tone: 'accent',
    label: 'Entretien',
    hint: 'Vidange, filtres, pneus — met à jour la prochaine échéance',
  },
  {
    route: '/ajout/reparation',
    icon: 'truck',
    tone: 'danger',
    label: 'Réparation',
    hint: 'Panne, carrosserie, sinistre',
  },
  {
    route: '/ajout/document',
    icon: 'file-text',
    tone: 'info',
    label: 'Document',
    hint: 'Permis, assurance, carte grise — stocké localement, chiffré',
  },
  {
    route: '/ajout/incident',
    icon: 'alert-triangle',
    tone: 'danger',
    label: 'Incident ou dommage',
    hint: 'Rayure, bosse, choc — avec photo et coût estimé',
  },
];

export default function QuickAddScreen(): ReactElement {
  const { colors } = useTheme();
  const router = useRouter();

  function renderAction(action: Action): ReactElement {
    const palette = toneColors(colors, action.tone);
    return (
      <Pressable
        key={action.route}
        onPress={() => router.replace(action.route as never)}
        style={({ pressed }) => [
          styles.action,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
          pressed ? { opacity: 0.7 } : null,
        ]}
      >
        <View style={[styles.actionIcon, { backgroundColor: palette.background }]}>
          <Icon name={action.icon} size={22} color={palette.foreground} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="title">{action.label}</AppText>
          <AppText variant="caption" color="textMuted" style={{ marginTop: 1 }}>
            {action.hint}
          </AppText>
        </View>
        <Icon name="chevron-right" size={18} color={colors.textFaint} strokeWidth={2} />
      </Pressable>
    );
  }

  return (
    <Screen>
      <ScreenTitle title="Ajouter" subtitle="Que voulez-vous enregistrer ?" />

      <SectionHeader title="Tous les jours" />
      {DAILY.map(renderAction)}

      <SectionHeader title="De temps en temps" />
      {OCCASIONAL.map(renderAction)}

      <SectionHeader title="Fiches" />
      <Card padded={false} style={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.xs }}>
        <Pressable onPress={() => router.replace('/ajout/vehicule')} style={styles.action}>
          <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
            <Icon name="car" size={22} color={colors.primary} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title">Nouveau véhicule</AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 1 }}>
              Carte grise, prix d’achat, amortissement
            </AppText>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textFaint} strokeWidth={2} />
        </Pressable>

        <Pressable onPress={() => router.replace('/ajout/locataire')} style={styles.action}>
          <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
            <Icon name="user" size={22} color={colors.primary} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title">Nouveau locataire</AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 1 }}>
              Coordonnées, permis, carte VTC
            </AppText>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textFaint} strokeWidth={2} />
        </Pressable>

        <Pressable onPress={() => router.replace('/ajout/location')} style={styles.action}>
          <View style={[styles.actionIcon, { backgroundColor: colors.primarySoft }]}>
            <Icon name="key" size={22} color={colors.primary} strokeWidth={1.9} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText variant="title">Nouvelle location</AppText>
            <AppText variant="caption" color="textMuted" style={{ marginTop: 1 }}>
              Conditions, échéancier, contrat à signer
            </AppText>
          </View>
          <Icon name="chevron-right" size={18} color={colors.textFaint} strokeWidth={2} />
        </Pressable>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  actionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
});
