/**
 * Recherche globale.
 *
 * ## Ce que cet écran cherche vraiment
 *
 * Pas « dans quelle table est cette ligne », mais les questions qu'on se pose debout, une
 * clé à la main : la voiture de telle plaque, le locataire qui appelle, le contrat dont on a
 * la référence sous les yeux, le document qui expire. Le corpus aplatit donc véhicules,
 * locataires, locations, contrats, paiements, dépenses, entretiens et documents dans une
 * seule liste — voir `buildSearchCorpus`, qui porte les choix d'indexation.
 *
 * ## Le tri est par pertinence, pas par ordre alphabétique
 *
 * Une plaque saisie exactement sort avant un commentaire qui la mentionne. C'est le rôle de
 * `searchDocuments`, qui note titre, sous-titre et champs séparément.
 *
 * ## Rien n'est cherché tant que rien n'est tapé
 *
 * Aucun résultat n'est affiché à vide : une liste de tout le contenu de l'application n'est
 * pas une réponse, c'est du bruit. L'écran montre à la place ce qu'il contient, famille par
 * famille, pour qu'on sache ce qui est cherchable.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import type { IconName } from '@/domain/iconNames';
import { searchDocuments, type SearchHit, type SearchKind } from '@/domain/search';
import { useApp } from '@/state/app-context';
import { buildSearchCorpus } from '@/state/use-derived';
import { AppText } from '@/ui/components/text';
import {
  Card,
  DetailTitle,
  EmptyState,
  KeyValue,
  ListRow,
  Screen,
  SectionHeader,
} from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { SearchField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/**
 * Présentation d'une famille de résultats.
 *
 * Elle vit ici, et non dans `search.ts` : le domaine dit ce qu'est un résultat, l'interface
 * dit comment il se montre. `search.ts` n'importe rien, et cette table est le seul endroit
 * qui a besoin de traduire une famille en libellé et en icône.
 */
const KIND_PRESENTATION: Record<SearchKind, { label: string; icon: IconName }> = {
  vehicule: { label: 'Véhicules', icon: 'car' },
  locataire: { label: 'Locataires', icon: 'user' },
  location: { label: 'Locations', icon: 'key' },
  contrat: { label: 'Contrats', icon: 'file-text' },
  paiement: { label: 'Paiements', icon: 'wallet' },
  depense: { label: 'Dépenses', icon: 'receipt' },
  entretien: { label: 'Entretien', icon: 'wrench' },
  document: { label: 'Documents', icon: 'folder' },
};

/** Ordre d'affichage des familles : ce qu'on cherche le plus souvent d'abord. */
const KIND_ORDER: readonly SearchKind[] = [
  'vehicule',
  'locataire',
  'location',
  'contrat',
  'paiement',
  'document',
  'entretien',
  'depense',
];

/** Exemples proposés à vide : ils montrent ce que la recherche sait trouver. */
const EXAMPLES: readonly { label: string; query: string }[] = [
  { label: 'Une plaque', query: 'AB-123-CD' },
  { label: 'Un nom', query: 'Belkacem' },
  { label: 'Un modèle', query: 'Corolla' },
  { label: 'Une référence de contrat', query: 'CT-' },
];

export default function SearchScreen(): ReactElement {
  const { data } = useApp();
  const { colors } = useTheme();
  const router = useRouter();

  const [query, setQuery] = useState('');

  const corpus = useMemo(() => buildSearchCorpus(data), [data]);

  const hits: SearchHit[] = useMemo(() => searchDocuments(query, corpus), [query, corpus]);

  const grouped = useMemo(() => {
    const byKind = new Map<SearchKind, SearchHit[]>();
    for (const hit of hits) {
      const list = byKind.get(hit.kind);
      if (list === undefined) byKind.set(hit.kind, [hit]);
      else list.push(hit);
    }
    return KIND_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
      kind,
      hits: byKind.get(kind) ?? [],
    }));
  }, [hits]);

  /** Nombre d'entrées indexées par famille, pour dire ce qui est cherchable. */
  const corpusCounts = useMemo(() => {
    const counts = new Map<SearchKind, number>();
    for (const document of corpus) {
      counts.set(document.kind, (counts.get(document.kind) ?? 0) + 1);
    }
    return counts;
  }, [corpus]);

  const trimmed = query.trim();

  return (
    <Screen>
      <DetailTitle title="Rechercher" onBack={() => router.back()} />

      <SearchField value={query} onChange={setQuery} placeholder="Plaque, nom, référence…" />

      {trimmed === '' ? (
        <>
          <SectionHeader title="Exemples" icon="search" />
          <Card>
            <View style={styles.examples}>
              {EXAMPLES.map((example) => (
                <Button
                  key={example.query}
                  label={example.label}
                  variant="secondary"
                  onPress={() => setQuery(example.query)}
                  style={styles.exampleButton}
                />
              ))}
            </View>
            <View style={{ height: spacing.md }} />
            <AppText variant="caption" color="textFaint">
              La recherche ignore les accents et la casse, et accepte un fragment : « coroll »
              trouve « Corolla ». Les tirets et les espaces sont équivalents, donc une plaque
              se saisit comme on veut.
            </AppText>
          </Card>

          <SectionHeader title="Ce qui est cherchable" icon="list" />
          <Card>
            {KIND_ORDER.map((kind) => (
              <KeyValue
                key={kind}
                label={KIND_PRESENTATION[kind].label}
                value={String(corpusCounts.get(kind) ?? 0)}
              />
            ))}
          </Card>
        </>
      ) : grouped.length === 0 ? (
        <Card>
          <EmptyState
            icon="search"
            title="Aucun résultat"
            message={`Rien ne correspond à « ${trimmed} ». Les documents archivés ne sont pas cherchés, et un véhicule vendu reste trouvable par sa plaque.`}
            action={<Button label="Effacer" variant="secondary" onPress={() => setQuery('')} />}
          />
        </Card>
      ) : (
        <>
          <View style={{ height: spacing.md }} />
          <AppText variant="caption" color="textFaint">
            {`${hits.length} résultat${hits.length > 1 ? 's' : ''} sur ${corpus.length} entrées indexées.`}
          </AppText>
          {grouped.map((group) => (
            <View key={group.kind}>
              <SectionHeader
                title={`${KIND_PRESENTATION[group.kind].label} (${group.hits.length})`}
                icon={KIND_PRESENTATION[group.kind].icon}
              />
              <Card padded={false}>
                {group.hits.map((hit) => (
                  <View key={`${hit.kind}:${hit.id}`} style={[styles.row, { borderColor: colors.border }]}>
                    <ListRow
                      title={hit.title}
                      subtitle={hit.subtitle === '' ? undefined : hit.subtitle}
                      icon={KIND_PRESENTATION[hit.kind].icon}
                      chevron
                      onPress={() => router.push(hit.href)}
                    />
                    {hit.matchedIn === 'champ' ? null : (
                      <AppText variant="caption" color="textFaint" style={styles.matched}>
                        {`Correspondance sur le ${hit.matchedIn}`}
                      </AppText>
                    )}
                  </View>
                ))}
              </Card>
            </View>
          ))}
        </>
      )}

      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  examples: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  exampleButton: { marginRight: spacing.sm, marginBottom: spacing.sm },
  row: { borderBottomWidth: StyleSheet.hairlineWidth },
  matched: { marginLeft: spacing.lg, marginBottom: spacing.sm },
});
