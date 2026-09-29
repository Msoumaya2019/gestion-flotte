/**
 * Tous les documents, locataires et véhicules confondus.
 *
 * ## Pourquoi un écran à part
 *
 * Chaque fiche a sa propre liste de documents, mais la question qui revient n'est pas
 * « quels sont les papiers de M. X » — c'est « qu'est-ce qui expire bientôt ». Cette
 * question traverse les fiches, et aucune fiche ne peut y répondre seule. D'où cet écran,
 * trié par urgence et non par personne.
 *
 * ## Ce que la confidentialité impose
 *
 * Les pièces sont chiffrées et vivent dans le dossier privé de l'application. Rien n'est
 * envoyé nulle part : appuyer sur une ligne déchiffre le fichier dans le cache, le remet à
 * la feuille de partage du système, puis efface la copie claire. C'est le seul chemin de
 * sortie, et il est toujours déclenché par l'utilisateur.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { documentValidity } from '@/domain/documents';
import { normalize } from '@/domain/search';
import type { DocumentStatus, Id, IsoDate } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
import { openAttachment } from '@/services/open-attachment';
import { AppText } from '@/ui/components/text';
import { Card, DetailTitle, EmptyState, KeyValue, Screen, SectionHeader } from '@/ui/components/base';
import { Button, IconButton, SegmentedControl } from '@/ui/components/button';
import { SearchField } from '@/ui/components/fields';
import { DocumentLine } from '@/ui/lines';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

type ScopeFilter = 'tous' | 'locataire' | 'vehicule';
type StatusFilter = 'tous' | 'a_surveiller' | 'expire' | 'sans_echeance';

interface DocumentEntry {
  id: Id;
  scope: 'locataire' | 'vehicule';
  /** Locataire ou véhicule auquel la pièce se rattache. */
  ownerId: Id;
  ownerLabel: string;
  typeLabel: string;
  number: string;
  expiryDate: IsoDate | null;
  hasExpiry: boolean;
  fileId: Id | null;
  fileName: string;
  status: DocumentStatus;
  daysRemaining: number | null;
}

export default function DocumentsScreen(): ReactElement {
  const { data, repositories, vault, today } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ vehicleId?: string }>();

  const todayDate = today();

  const [scope, setScope] = useState<ScopeFilter>(params.vehicleId === undefined ? 'tous' : 'vehicule');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('tous');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const entries: DocumentEntry[] = useMemo(() => {
    const warningDays = data.settings.documentWarningDays;
    const list: DocumentEntry[] = [];

    for (const document of data.tenantDocuments) {
      if (document.archivedAt !== null) continue;
      const type = data.documentTypes.find((candidate) => candidate.id === document.typeId);
      const validity = documentValidity(document.expiryDate, todayDate, warningDays);
      list.push({
        id: document.id,
        scope: 'locataire',
        ownerId: document.tenantId,
        ownerLabel: tenantName(data, document.tenantId),
        typeLabel: type?.label ?? 'Document',
        number: document.number,
        expiryDate: document.expiryDate,
        hasExpiry: type?.hasExpiry ?? true,
        fileId: document.fileId,
        fileName: document.fileName,
        status: validity.status,
        daysRemaining: validity.daysRemaining,
      });
    }

    for (const document of data.vehicleDocuments) {
      if (document.archivedAt !== null) continue;
      const type = data.documentTypes.find((candidate) => candidate.id === document.typeId);
      const validity = documentValidity(document.expiryDate, todayDate, warningDays);
      list.push({
        id: document.id,
        scope: 'vehicule',
        ownerId: document.vehicleId,
        ownerLabel: vehicleName(data, document.vehicleId),
        typeLabel: type?.label ?? 'Document',
        number: document.number,
        expiryDate: document.expiryDate,
        hasExpiry: type?.hasExpiry ?? true,
        fileId: document.fileId,
        fileName: document.fileName,
        status: validity.status,
        daysRemaining: validity.daysRemaining,
      });
    }

    return list;
  }, [data, todayDate]);

  /**
   * Restriction au véhicule demandé, appliquée **avant** tout le reste.
   *
   * `?vehicleId=` restreint vraiment la liste : se contenter de présélectionner l'onglet
   * « Véhicules » montrerait les papiers de toute la flotte à qui arrive depuis la fiche
   * d'une voiture précise — l'écran ne répondrait pas à la question posée.
   */
  const scopedEntries = useMemo(
    () =>
      params.vehicleId === undefined
        ? entries
        : entries.filter((entry) => entry.ownerId === params.vehicleId),
    [entries, params.vehicleId],
  );

  const visible = useMemo(() => {
    const needle = normalize(query);
    return scopedEntries.filter((entry) => {
      if (scope !== 'tous' && entry.scope !== scope) return false;
      if (statusFilter === 'expire' && entry.status !== 'expire') return false;
      if (statusFilter === 'a_surveiller' && entry.status !== 'expire_bientot') return false;
      if (statusFilter === 'sans_echeance' && entry.status !== 'sans_echeance') return false;
      if (needle !== '') {
        const haystack = normalize(
          `${entry.typeLabel} ${entry.number} ${entry.ownerLabel} ${entry.fileName}`,
        );
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [scopedEntries, scope, statusFilter, query]);

  /** Le plus urgent d'abord : un document expiré passe avant un document valide. */
  const sorted = useMemo(() => {
    const rank: Record<DocumentStatus, number> = {
      expire: 0,
      expire_bientot: 1,
      valide: 2,
      sans_echeance: 3,
    };
    return [...visible].sort((a, b) => {
      const byStatus = rank[a.status] - rank[b.status];
      if (byStatus !== 0) return byStatus;
      return (a.daysRemaining ?? Number.MAX_SAFE_INTEGER) - (b.daysRemaining ?? Number.MAX_SAFE_INTEGER);
    });
  }, [visible]);

  const counts = useMemo(() => {
    const result = { expire: 0, expire_bientot: 0, valide: 0, sans_echeance: 0, sansPiece: 0 };
    for (const entry of scopedEntries) {
      result[entry.status] += 1;
      if (entry.fileId === null) result.sansPiece += 1;
    }
    return result;
  }, [scopedEntries]);

  const lockedVehicle =
    params.vehicleId === undefined
      ? null
      : (data.vehicles.find((vehicle) => vehicle.id === params.vehicleId) ?? null);

  /**
   * Ouvre la pièce jointe.
   *
   * Un document sans pièce n'est pas une erreur : on le dit et on propose d'en ajouter une,
   * plutôt que d'échouer sur un message de coffre introuvable qui n'aurait rien à voir.
   */
  async function openDocument(entry: DocumentEntry): Promise<void> {
    setError(null);
    setNotice(null);

    if (entry.fileId === null) {
      setNotice(
        `${entry.typeLabel} — ${entry.ownerLabel} : aucune pièce n’est jointe à ce document. Les dates sont enregistrées, le justificatif ne l’est pas.`,
      );
      return;
    }

    try {
      await openAttachment({
        vault,
        repositories,
        fileId: entry.fileId,
        dialogTitle: `${entry.typeLabel} — ${entry.ownerLabel}`,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  return (
    <Screen>
      <DetailTitle
        title="Documents"
        subtitle={
          lockedVehicle === null
            ? `${scopedEntries.length} document${scopedEntries.length > 1 ? 's' : ''} au total`
            : `${vehicleName(data, lockedVehicle.id)} — ${scopedEntries.length} document${scopedEntries.length > 1 ? 's' : ''}`
        }
        onBack={() => router.back()}
        action={
          <IconButton
            icon="plus"
            label="Ajouter un document"
            onPress={() =>
              router.push(
                lockedVehicle === null
                  ? '/ajout/document'
                  : `/ajout/document?vehicleId=${lockedVehicle.id}`,
              )
            }
          />
        }
      />

      {/* ------------------------------------------------------------------ */}
      {/* État du dossier                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Card style={{ marginBottom: spacing.lg }}>
        <KeyValue
          label="Expirés"
          value={String(counts.expire)}
          valueColor={counts.expire > 0 ? 'danger' : 'text'}
        />
        <KeyValue
          label={`Expirent sous ${data.settings.documentWarningDays} jours`}
          value={String(counts.expire_bientot)}
          valueColor={counts.expire_bientot > 0 ? 'warning' : 'text'}
        />
        <KeyValue label="En cours de validité" value={String(counts.valide)} />
        <KeyValue label="Sans échéance" value={String(counts.sans_echeance)} />
        {counts.sansPiece === 0 ? null : (
          <>
            <View style={{ height: spacing.sm }} />
            <AppText variant="caption" color="textMuted">
              {`${counts.sansPiece} document${counts.sansPiece > 1 ? 's' : ''} sans pièce jointe. Les dates sont saisies, le justificatif ne l’est pas — un contrôle ne s’en contentera pas.`}
            </AppText>
          </>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Filtres                                                             */}
      {/* ------------------------------------------------------------------ */}
      {lockedVehicle === null ? (
        <>
          <SegmentedControl
            options={[
              { value: 'tous', label: 'Tous' },
              { value: 'locataire', label: 'Locataires' },
              { value: 'vehicule', label: 'Véhicules' },
            ]}
            value={scope}
            onChange={setScope}
          />
          <View style={{ height: spacing.sm }} />
        </>
      ) : null}
      <SegmentedControl
        options={[
          { value: 'tous', label: 'Tout état' },
          { value: 'expire', label: 'Expirés' },
          { value: 'a_surveiller', label: 'Bientôt' },
          { value: 'sans_echeance', label: 'Sans échéance' },
        ]}
        value={statusFilter}
        onChange={setStatusFilter}
      />
      <View style={{ height: spacing.md }} />
      <SearchField value={query} onChange={setQuery} placeholder="Type, numéro, nom…" />

      {/* ------------------------------------------------------------------ */}
      {/* Liste                                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader
        title={`${sorted.length} document${sorted.length > 1 ? 's' : ''}`}
        icon="folder"
      />
      {sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon="folder"
            title={scopedEntries.length === 0 ? 'Aucun document' : 'Aucun résultat'}
            message={
              scopedEntries.length === 0
                ? 'Ajoutez un permis, une carte VTC, une assurance ou un contrôle technique. Les dates saisies alimentent les rappels.'
                : 'Aucun document ne correspond à ces filtres.'
            }
            action={
              scopedEntries.length === 0 ? (
                <Button
                  label="Ajouter un document"
                  onPress={() =>
                    router.push(
                      lockedVehicle === null
                        ? '/ajout/document'
                        : `/ajout/document?vehicleId=${lockedVehicle.id}`,
                    )
                  }
                />
              ) : (
                <Button
                  label="Réinitialiser les filtres"
                  variant="secondary"
                  onPress={() => {
                    setScope('tous');
                    setStatusFilter('tous');
                    setQuery('');
                  }}
                />
              )
            }
          />
        </Card>
      ) : (
        <Card padded={false}>
          {sorted.map((entry) => (
            <View
              key={entry.id}
              style={[styles.row, { borderColor: colors.border }]}
            >
              <View style={styles.rowBody}>
                <DocumentLine
                  label={entry.typeLabel}
                  number={entry.number}
                  expiryDate={entry.expiryDate}
                  today={todayDate}
                  warningDays={data.settings.documentWarningDays}
                  hasExpiry={entry.hasExpiry}
                  icon={entry.scope === 'locataire' ? 'user' : 'car'}
                  onPress={() => void openDocument(entry)}
                />
                <AppText variant="caption" color="textFaint" style={styles.ownerLine}>
                  {`${entry.scope === 'locataire' ? 'Locataire' : 'Véhicule'} · ${entry.ownerLabel}${
                    entry.fileId === null ? ' · sans pièce jointe' : ''
                  }`}
                </AppText>
              </View>
              <IconButton
                icon="edit"
                label={`Modifier ${entry.typeLabel}`}
                size={36}
                onPress={() => router.push(`/ajout/document?id=${entry.id}`)}
              />
            </View>
          ))}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Aller à la fiche                                                    */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Où les documents se rattachent" />
      <Card>
        <AppText variant="small" color="textMuted">
          Une pièce appartient toujours à un locataire ou à un véhicule : c’est ce rattachement
          qui permet au contrôle du dossier, avant d’activer une location, de savoir ce qui
          manque.
        </AppText>
        <View style={{ height: spacing.md }} />
        <Button
          label="Ajouter un document"
          variant="secondary"
          icon="plus"
          block
          onPress={() => router.push('/ajout/document')}
        />
      </Card>

      {notice === null ? null : (
        <Card sunken style={{ marginTop: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            {notice}
          </AppText>
        </Card>
      )}
      {error === null ? null : (
        <Card sunken style={{ marginTop: spacing.lg, borderColor: colors.danger }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}

      <View style={{ height: spacing.xl }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowBody: { flex: 1 },
  ownerLine: { marginLeft: spacing.lg, marginBottom: spacing.sm },
});
