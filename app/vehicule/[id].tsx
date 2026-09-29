/**
 * Fiche d'un véhicule.
 *
 * ## Dix sections, une seule page
 *
 * Le résumé, la location en cours, les finances, les paiements, l'entretien, le kilométrage,
 * les documents, les contrats, l'historique et les incidents tiennent dans un même écran.
 * Séparer chacun en une page aurait donné dix navigations pour une question qui se pose en
 * une : « où en est ce véhicule ? ».
 *
 * ## Une barre de sections qui ne défile pas
 *
 * Les pastilles de section sont dans l'en-tête, sur une ligne qui défile horizontalement.
 * Les laisser dans le corps les ferait disparaître dès qu'on descend dans une liste — et
 * changer de section demanderait de remonter d'abord.
 *
 * ## Rien n'est chargé à la demande
 *
 * Toutes les données sont déjà en mémoire (voir `state/app-context`). Changer de section est
 * donc instantané, et aucune section ne peut afficher un total périmé.
 */

import { useState, type ReactElement } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useApp } from '@/state/app-context';
import { Card, DetailTitle, EmptyState, Screen } from '@/ui/components/base';
import { Button, Chip } from '@/ui/components/button';
import { VehicleMileageSection, VehicleMaintenanceSection, VehiclePaymentsSection } from '@/ui/vehicle/activity';
import { VehicleFinanceSection, VehicleRentalSection, VehicleSummarySection } from '@/ui/vehicle/overview';
import {
  VehicleContractsSection,
  VehicleDamagesSection,
  VehicleDocumentsSection,
  VehicleHistorySection,
} from '@/ui/vehicle/records';
import { spacing } from '@/ui/theme';

type SectionKey =
  | 'resume'
  | 'location'
  | 'finances'
  | 'paiements'
  | 'entretien'
  | 'kilometrage'
  | 'documents'
  | 'contrats'
  | 'historique'
  | 'incidents';

const SECTIONS: readonly { key: SectionKey; label: string }[] = [
  { key: 'resume', label: 'Résumé' },
  { key: 'location', label: 'Location' },
  { key: 'finances', label: 'Finances' },
  { key: 'paiements', label: 'Paiements' },
  { key: 'entretien', label: 'Entretien' },
  { key: 'kilometrage', label: 'Kilométrage' },
  { key: 'documents', label: 'Documents' },
  { key: 'contrats', label: 'Contrats' },
  { key: 'historique', label: 'Historique' },
  { key: 'incidents', label: 'Incidents' },
];

export default function VehicleDetailScreen(): ReactElement {
  const { data } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; section?: string }>();
  const id = params.id ?? '';

  const [section, setSection] = useState<SectionKey>(() => {
    const requested = SECTIONS.find((candidate) => candidate.key === params.section);
    return requested?.key ?? 'resume';
  });

  const vehicle = data.vehicles.find((candidate) => candidate.id === id) ?? null;

  if (vehicle === null) {
    return (
      <Screen
        header={<DetailTitle title="Véhicule" onBack={() => router.back()} />}
      >
        <Card>
          <EmptyState
            icon="car"
            title="Véhicule introuvable"
            message="Il a peut-être été archivé. Les archives ne sont pas encore consultables depuis cet écran."
            action={<Button label="Retour à la liste" onPress={() => router.replace('/vehicules')} />}
          />
        </Card>
      </Screen>
    );
  }

  const name = `${vehicle.brand} ${vehicle.model}`.trim();
  const subtitle = [vehicle.trim, vehicle.plate].filter((part) => part !== '').join(' · ');

  return (
    <Screen
      header={
        <View>
          <DetailTitle
            title={name === '' ? vehicle.plate || 'Véhicule' : name}
            subtitle={subtitle === '' ? undefined : subtitle}
            onBack={() => router.back()}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sections}
          >
            {SECTIONS.map((candidate) => (
              <Chip
                key={candidate.key}
                label={candidate.label}
                selected={section === candidate.key}
                onPress={() => setSection(candidate.key)}
              />
            ))}
          </ScrollView>
        </View>
      }
    >
      {section === 'resume' ? <VehicleSummarySection vehicle={vehicle} /> : null}
      {section === 'location' ? <VehicleRentalSection vehicle={vehicle} /> : null}
      {section === 'finances' ? <VehicleFinanceSection vehicle={vehicle} /> : null}
      {section === 'paiements' ? <VehiclePaymentsSection vehicle={vehicle} /> : null}
      {section === 'entretien' ? <VehicleMaintenanceSection vehicle={vehicle} /> : null}
      {section === 'kilometrage' ? <VehicleMileageSection vehicle={vehicle} /> : null}
      {section === 'documents' ? <VehicleDocumentsSection vehicle={vehicle} /> : null}
      {section === 'contrats' ? <VehicleContractsSection vehicle={vehicle} /> : null}
      {section === 'historique' ? <VehicleHistorySection vehicle={vehicle} /> : null}
      {section === 'incidents' ? <VehicleDamagesSection vehicle={vehicle} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sections: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
});
