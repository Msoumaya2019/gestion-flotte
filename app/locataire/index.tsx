/**
 * Liste des locataires.
 *
 * ## Ce qui décide sur une ligne
 *
 * L'état du dossier, l'argent dû, et la location en cours. Un locataire sans location et
 * sans document est une fiche de contact ; un locataire avec un impayé est une relance à
 * faire. Les deux ne se ressemblent pas, et la ligne doit le dire sans qu'on l'ouvre.
 *
 * ## Les archivés
 *
 * Ils restent consultables, parce qu'un locataire d'il y a trois ans peut revenir et que sa
 * fiche porte l'historique de ses locations. Ils sont masqués par défaut : une liste qui
 * grandit sans fin ne se parcourt plus.
 *
 * Cette promesse était **fausse** jusqu'ici : `loadEverything` lit `list()`, qui exclut les
 * archivés, donc `archivedAt` était toujours `null` dans `data.tenants` — le compteur, la
 * pastille et le filtre étaient du code mort. Les archivés sont désormais lus à part, par
 * `useArchived`, et le filtre fait ce qu'il annonce.
 *
 * ## Retirer, en un geste
 *
 * Un balayage vers la gauche révèle « Retirer », et « Restaurer » sur une fiche déjà
 * archivée. La décision vient de `verdictSuppression` — la même règle que les formulaires.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { formatFr, todayIso } from '@/domain/dates';
import { formatMoney } from '@/domain/money';
import { effectivePaymentStatus, paymentBalance } from '@/domain/rental';
import { verdictSuppression } from '@/domain/suppression';
import { tenantFullName } from '@/domain/tables';
import type { Tenant } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { useArchived } from '@/state/use-archived';
import { AppText } from '@/ui/components/text';
import { Badge, Card, EmptyState, IconBubble, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button, Chip } from '@/ui/components/button';
import { SearchField } from '@/ui/components/fields';
import { Icon } from '@/ui/components/icons';
import { SwipeAction } from '@/ui/components/swipe';
import { confirmer } from '@/ui/confirm';
import { normalize } from '@/domain/search';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

export default function TenantsScreen(): ReactElement {
  const { data, repositories, refresh, now } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const today = todayIso();

  const [query, setQuery] = useState('');
  const [onlyDebtors, setOnlyDebtors] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const archived = useArchived<Tenant>(
    repositories === null ? null : () => repositories.tenants.listArchived(),
    data.tenants,
  );

  const archivedCount = archived.length;

  /** Retire un locataire : refus si une location court, archivage sinon. */
  async function retirer(tenant: Tenant, nom: string): Promise<void> {
    if (repositories === null) return;
    try {
      const impact = await repositories.liens.pourLocataire(tenant.id);
      const verdict = verdictSuppression('locataire', nom === '' ? tenantFullName(tenant) : nom, impact);

      if (verdict.kind === 'refus') {
        Alert.alert('Retrait impossible', verdict.message);
        return;
      }

      const accepte = await confirmer({
        titre: verdict.titre,
        message: verdict.message,
        libelle: verdict.libelle,
      });
      if (!accepte) return;

      await repositories.tenants.archive(tenant.id, now());
      await refresh();
    } catch (caught) {
      Alert.alert('Retrait impossible', caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function restaurer(tenant: Tenant): Promise<void> {
    if (repositories === null) return;
    try {
      await repositories.tenants.restore(tenant.id);
      await refresh();
    } catch (caught) {
      Alert.alert(
        'Restauration impossible',
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  }

  const rows = useMemo(() => {
    const needle = normalize(query);

    // Les archivés sont lus à part ; on ne les réunit qu'au moment de les montrer. Le
    // filtre reste même si `data.tenants` ne devrait porter aucun archivé : si un jour
    // `loadEverything` change, la liste ne se mettra pas à les mélanger en silence.
    const visibles = showArchived ? [...data.tenants, ...archived] : data.tenants;

    return visibles
      .filter((tenant) => (showArchived ? true : tenant.archivedAt === null))
      .map((tenant) => {
        const rentals = data.rentals.filter((rental) => rental.tenantId === tenant.id);
        const activeRental = rentals.find((rental) => rental.status === 'active') ?? null;
        const payments = data.payments.filter((payment) => payment.tenantId === tenant.id);

        // Ce qui est dû, et non ce qui a été facturé : c'est le chiffre qui déclenche une
        // relance, et lui seul.
        let owedCents = 0;
        let lateCount = 0;
        for (const payment of payments) {
          const status = effectivePaymentStatus(payment, today);
          if (status !== 'retard' && status !== 'impaye') continue;
          owedCents += paymentBalance(payment).remainingCents;
          lateCount += 1;
        }

        const documents = data.tenantDocuments.filter(
          (document) => document.tenantId === tenant.id,
        );
        const expired = documents.filter(
          (document) => document.expiryDate !== null && document.expiryDate < today,
        ).length;

        return {
          tenant,
          name: `${tenant.firstName} ${tenant.lastName}`.trim(),
          activeRental,
          rentalsCount: rentals.length,
          owedCents,
          lateCount,
          documentsCount: documents.length,
          expired,
        };
      })
      .filter((row) => {
        if (onlyDebtors && row.owedCents === 0) return false;
        if (needle === '') return true;
        const haystack = normalize(
          [row.name, row.tenant.phone, row.tenant.email, row.tenant.licenseNumber, row.tenant.vtcNumber]
            .filter((part) => part !== '')
            .join(' '),
        );
        return haystack.includes(needle);
      })
      .sort((a, b) => {
        // Les débiteurs d'abord, puis les locataires en cours : l'ordre suit l'urgence.
        if (a.owedCents !== b.owedCents) return b.owedCents - a.owedCents;
        const activeA = a.activeRental === null ? 0 : 1;
        const activeB = b.activeRental === null ? 0 : 1;
        if (activeA !== activeB) return activeB - activeA;
        return a.name.localeCompare(b.name, 'fr');
      });
  }, [data.tenants, data.rentals, data.payments, data.tenantDocuments, archived, query, onlyDebtors, showArchived, today]);

  const debtorCount = data.tenants.filter((tenant) => {
    if (tenant.archivedAt !== null) return false;
    return data.payments.some(
      (payment) =>
        payment.tenantId === tenant.id &&
        (effectivePaymentStatus(payment, today) === 'retard' ||
          effectivePaymentStatus(payment, today) === 'impaye'),
    );
  }).length;

  return (
    <Screen
      header={
        <View>
          {/* `data.tenants` ne porte que des fiches actives : les compter ici demanderait
              un filtre qui, avant, ne retirait jamais rien. */}
          <ScreenTitle
            title="Locataires"
            subtitle={`${data.tenants.length} fiche${data.tenants.length > 1 ? 's' : ''} active${data.tenants.length > 1 ? 's' : ''}`}
          />
          <View style={styles.actions}>
            <Button
              label="Ajouter"
              icon="plus"
              variant="secondary"
              onPress={() => router.push('/ajout/locataire')}
            />
          </View>
        </View>
      }
    >
      <SearchField value={query} onChange={setQuery} placeholder="Nom, téléphone, permis, VTC" />

      <View style={styles.chips}>
        <Chip
          label={debtorCount === 0 ? 'Impayés' : `Impayés (${debtorCount})`}
          selected={onlyDebtors}
          onPress={() => setOnlyDebtors(!onlyDebtors)}
        />
        {archivedCount === 0 ? null : (
          <Chip
            label={showArchived ? 'Masquer les archivés' : `Voir les archivés (${archivedCount})`}
            selected={showArchived}
            onPress={() => setShowArchived(!showArchived)}
          />
        )}
      </View>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            icon="users"
            title={query === '' ? 'Aucun locataire' : 'Aucun résultat'}
            message={
              query === ''
                ? 'Ajoutez un locataire pour lui rattacher des locations, des paiements et des documents.'
                : 'Aucune fiche ne correspond à cette recherche.'
            }
            action={
              query === '' ? (
                <Button
                  label="Ajouter un locataire"
                  icon="plus"
                  onPress={() => router.push('/ajout/locataire')}
                />
              ) : (
                <Button label="Effacer la recherche" variant="secondary" onPress={() => setQuery('')} />
              )
            }
          />
        </Card>
      ) : (
        rows.map((row) => {
          const estArchive = row.tenant.archivedAt !== null;
          return (
            <SwipeAction
              key={row.tenant.id}
              style={styles.ligne}
              label={estArchive ? 'Restaurer' : 'Retirer'}
              icon={estArchive ? 'rotate' : 'archive'}
              tone={estArchive ? 'accent' : 'danger'}
              onTrigger={() => (estArchive ? restaurer(row.tenant) : retirer(row.tenant, row.name))}
            >
              {/* Une fiche archivée ne s'ouvre pas : sa fiche détaillée se lit dans
                  `data.tenants`, qui ne la contient plus. Le geste la restaure. */}
              <Card onPress={estArchive ? undefined : () => router.push(`/locataire/${row.tenant.id}`)}>
                <View style={styles.row}>
                  <IconBubble
                    icon="user"
                    size={44}
                    tone={
                      row.owedCents > 0
                        ? 'danger'
                        : row.activeRental === null
                          ? 'neutral'
                          : 'accent'
                    }
                  />
                  <View style={styles.rowBody}>
                    <AppText variant="title" numberOfLines={1}>
                      {row.name === '' ? 'Locataire sans nom' : row.name}
                    </AppText>
                    <AppText variant="small" color="textMuted" numberOfLines={1}>
                      {[row.tenant.phone, row.tenant.email].filter((part) => part !== '').join(' · ')}
                    </AppText>
                  </View>
                  {row.owedCents > 0 ? (
                    <AppText variant="title" color="danger" tabular>
                      {formatMoney(row.owedCents, { currency: '' }).trim()}
                    </AppText>
                  ) : null}
                </View>

                <View style={[styles.badges, { borderTopColor: colors.separator }]}>
                  {estArchive ? (
                    <View style={styles.badge}>
                      <Badge label="Archivé" tone="neutral" />
                    </View>
                  ) : null}
                  {row.activeRental === null ? (
                    <View style={styles.badge}>
                      <Badge label="Sans location" tone="neutral" />
                    </View>
                  ) : (
                    <View style={styles.badge}>
                      <Badge label={`Loue depuis le ${formatFr(row.activeRental.startDate)}`} tone="accent" />
                    </View>
                  )}
                  <View style={styles.badge}>
                    <Badge
                      label={`${row.rentalsCount} location${row.rentalsCount > 1 ? 's' : ''}`}
                      tone="neutral"
                    />
                  </View>
                  <View style={styles.badge}>
                    <Badge
                      label={`${row.documentsCount} document${row.documentsCount > 1 ? 's' : ''}`}
                      tone={row.expired > 0 ? 'danger' : 'neutral'}
                    />
                  </View>
                </View>

                {row.lateCount === 0 ? null : (
                  <View style={styles.alert}>
                    <Icon name="alert-circle" size={13} color={colors.danger} strokeWidth={2} />
                    <AppText variant="caption" color="danger" style={{ marginLeft: 5 }}>
                      {`${row.lateCount} échéance${row.lateCount > 1 ? 's' : ''} en retard`}
                    </AppText>
                  </View>
                )}
                {row.expired === 0 ? null : (
                  <View style={styles.alert}>
                    <Icon name="alert-triangle" size={13} color={colors.warning} strokeWidth={2} />
                    <AppText variant="caption" color="warning" style={{ marginLeft: 5 }}>
                      {`${row.expired} document${row.expired > 1 ? 's' : ''} expiré${row.expired > 1 ? 's' : ''}`}
                    </AppText>
                  </View>
                )}
              </Card>
            </SwipeAction>
          );
        })
      )}

      {rows.length === 0 ? null : (
        <>
          <SectionHeader title="Ajouter" />
          <Button
            label="Nouveau locataire"
            icon="plus"
            variant="secondary"
            block
            onPress={() => router.push('/ajout/locataire')}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.md },
  // Porté par le conteneur du balayage : l'action révélée n'a pas cette marge, et une
  // carte plus courte que son action laisserait un décrochage visible.
  ligne: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  rowBody: { flex: 1, marginHorizontal: spacing.md },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  badge: { marginRight: spacing.sm, marginBottom: spacing.xs },
  alert: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
});
