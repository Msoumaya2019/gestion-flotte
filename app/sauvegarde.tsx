/**
 * Sauvegarde et restauration.
 *
 * ## Le seul filet de sécurité de l'application
 *
 * Tout vit sur l'appareil, et rien n'est répliqué ailleurs. Un iPhone perdu, une
 * réinstallation, une base corrompue : sans archive exportée, il ne reste rien. C'est
 * pourquoi cet écran est dans les réglages et non enterré plus loin.
 *
 * ## Le mot de passe est la seule protection
 *
 * L'archive contient les documents chiffrés **et** la clé qui les ouvre : sans mot de
 * passe, elle serait lisible par quiconque la trouve. Il n'y a pas de récupération —
 * l'application ne garde aucune copie du mot de passe, et ne peut donc pas le retrouver.
 * Perdre le mot de passe, c'est perdre l'archive.
 *
 * ## La restauration remplace, elle ne fusionne pas
 *
 * C'est un choix, et il est assumé : fusionner deux jeux de données produirait des
 * doublons silencieux — deux fois le même locataire, deux fois les mêmes échéances — et
 * des totaux faux qu'aucun écran ne saurait expliquer. L'écran le dit avant, montre ce que
 * contient l'archive, et exige une confirmation explicite.
 */

import { useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';

import { formatDateTimeFr } from '@/domain/dates';
import { useApp } from '@/state/app-context';
import {
  assertPasswordAcceptable,
  createBackupFile,
  MIN_BACKUP_PASSWORD,
  openBackupEnvelope,
  restoreBackup,
  summarizeBackup,
  type BackupManifest,
  type BackupPayload,
  type RestoreReport,
} from '@/services/backup';
import { deviceRandomBytes } from '@/services/device';
import { discardOutput, formatSize, shareOutput } from '@/services/output';
import { AppText } from '@/ui/components/text';
import { Card, DetailTitle, KeyValue, Screen, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { SwitchRow, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/** Une archive choisie, déchiffrée mais pas encore appliquée. */
interface PendingRestore {
  fileName: string;
  payload: BackupPayload;
  manifest: BackupManifest;
}

export default function BackupScreen(): ReactElement {
  const { db, vault, refresh, now } = useApp();
  const { colors } = useTheme();
  const router = useRouter();

  // --- création -------------------------------------------------------------
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdManifest, setCreatedManifest] = useState<BackupManifest | null>(null);

  // --- restauration --------------------------------------------------------
  const [picked, setPicked] = useState<{ uri: string; name: string } | null>(null);
  const [pending, setPending] = useState<PendingRestore | null>(null);
  const [restorePassword, setRestorePassword] = useState('');
  const [reading, setReading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [report, setReport] = useState<RestoreReport | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const passwordMismatch = confirmation !== '' && confirmation !== password;
  const passwordTooShort = password !== '' && password.length < MIN_BACKUP_PASSWORD;
  const canCreate =
    db !== null &&
    password.length >= MIN_BACKUP_PASSWORD &&
    password === confirmation &&
    !creating;

  // -------------------------------------------------------------------------
  // Créer une archive
  // -------------------------------------------------------------------------

  async function createBackup(): Promise<void> {
    if (db === null) {
      setError('La base n’est pas ouverte : la sauvegarde ne peut pas être produite.');
      return;
    }
    setCreating(true);
    setError(null);
    setNotice(null);
    setCreatedManifest(null);

    let produced: Awaited<ReturnType<typeof createBackupFile>>['file'] | null = null;
    try {
      assertPasswordAcceptable(password);
      const { file, manifest } = await createBackupFile(
        db,
        vault,
        password,
        deviceRandomBytes,
        now(),
      );
      produced = file;
      setCreatedManifest(manifest);

      // Le mot de passe est effacé de l'écran dès que l'archive est écrite : il n'a plus
      // rien à y faire, et le laisser en mémoire affichable n'apporte rien.
      setPassword('');
      setConfirmation('');

      await shareOutput(file, 'Enregistrer la sauvegarde');
      setNotice('Sauvegarde produite. Enregistrez-la hors de l’appareil : Fichiers, AirDrop, Mail.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      // L'archive a été remise au système ; la copie du cache est jetable. Elle contient
      // l'intégralité des données, donc on ne la laisse pas traîner.
      if (produced !== null) discardOutput(produced);
      setCreating(false);
    }
  }

  // -------------------------------------------------------------------------
  // Choisir puis lire une archive
  // -------------------------------------------------------------------------

  /**
   * Deux étapes, dans cet ordre : on choisit le fichier, **puis** on saisit le mot de passe.
   *
   * Demander le mot de passe avant de savoir de quelle archive il s'agit obligerait à le
   * retaper pour chaque essai de fichier, et à le garder en mémoire pendant la navigation
   * dans le sélecteur. Le saisir après permet aussi de refuser tout de suite un mot de passe
   * manifestement trop court, sans ouvrir le sélecteur pour rien.
   */
  async function pickArchive(): Promise<void> {
    setError(null);
    setNotice(null);
    setReport(null);
    setPending(null);
    setAcknowledged(false);

    const result = await DocumentPicker.getDocumentAsync({
      type: ['*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset === undefined) return;

    setPicked({ uri: asset.uri, name: asset.name });
  }

  /** Déchiffre l'archive choisie. Le mot de passe est vérifié par l'authentification GCM. */
  async function readArchive(): Promise<void> {
    if (picked === null) return;
    setReading(true);
    setError(null);
    setNotice(null);
    try {
      // `bytes()` est asynchrone : sans `await`, c'est une promesse qui partirait au
      // déchiffrement, et la restauration échouerait sur l'appareil sans rien expliquer.
      const bytes = await new File(picked.uri).bytes();
      const payload = await openBackupEnvelope(bytes, restorePassword);
      setPending({ fileName: picked.name, payload, manifest: summarizeBackup(payload) });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setReading(false);
    }
  }

  // -------------------------------------------------------------------------
  // Restaurer
  // -------------------------------------------------------------------------

  async function restore(): Promise<void> {
    if (db === null || pending === null) return;
    setRestoring(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await restoreBackup(db, vault, pending.payload, now());
      setReport(outcome);
      setPending(null);
      setPicked(null);
      setRestorePassword('');
      setAcknowledged(false);
      await refresh();
      setNotice('Restauration terminée. Les données affichées sont celles de l’archive.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <Screen>
      <DetailTitle title="Sauvegarde et restauration" onBack={() => router.back()} />

      <Card style={{ marginBottom: spacing.lg }}>
        <AppText variant="small" color="textMuted">
          L’archive contient toutes les données — véhicules, locataires, locations, échéances,
          dépenses — et les documents chiffrés du coffre. Elle est elle-même chiffrée par un
          mot de passe que vous choisissez. Rien n’est envoyé sur un serveur : c’est vous qui
          décidez où elle va.
        </AppText>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Créer                                                               */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Créer une sauvegarde" icon="download" />
      <Card>
        <TextField
          label="Mot de passe de l’archive"
          value={password}
          onChange={setPassword}
          secure
          autoCapitalize="none"
          placeholder={`Au moins ${MIN_BACKUP_PASSWORD} caractères`}
          hint="Sans lui, l’archive est illisible. L’application ne le conserve pas : personne ne pourra le retrouver."
          error={passwordTooShort ? `Au moins ${MIN_BACKUP_PASSWORD} caractères.` : null}
        />
        <TextField
          label="Confirmation"
          value={confirmation}
          onChange={setConfirmation}
          secure
          autoCapitalize="none"
          error={passwordMismatch ? 'Les deux saisies diffèrent.' : null}
        />

        <View style={{ height: spacing.md }} />
        <AppText variant="caption" color="textFaint">
          Le déchiffrement de l’archive est volontairement lent — des centaines de milliers
          d’itérations — pour qu’un mot de passe court ne puisse pas être deviné en essayant
          toutes les combinaisons. C’est ce qui le rend long à ouvrir, et coûteux à attaquer.
        </AppText>

        <View style={{ height: spacing.lg }} />
        <Button
          label="Créer et enregistrer la sauvegarde"
          icon="download"
          block
          loading={creating}
          disabled={!canCreate}
          onPress={() => void createBackup()}
        />

        {createdManifest === null ? null : (
          <>
            <View style={{ height: spacing.lg }} />
            <AppText variant="small" color="success">
              Archive produite. Voici ce qu’elle contient :
            </AppText>
            <View style={{ height: spacing.sm }} />
            <KeyValue label="Établie le" value={formatDateTimeFr(createdManifest.createdAt)} />
            <KeyValue
              label="Lignes enregistrées"
              value={String(createdManifest.tables.reduce((sum, table) => sum + table.rows, 0))}
            />
            <KeyValue label="Fichiers joints" value={String(createdManifest.fileCount)} />
            <KeyValue label="Poids des fichiers" value={formatSize(createdManifest.fileBytes)} />
            {createdManifest.missingFiles > 0 ? (
              <>
                <View style={{ height: spacing.sm }} />
                <AppText variant="small" color="warning">
                  {`${createdManifest.missingFiles} fichier${createdManifest.missingFiles > 1 ? 's' : ''} décrit${createdManifest.missingFiles > 1 ? 's' : ''} en base ${createdManifest.missingFiles > 1 ? 'sont' : 'est'} absent${createdManifest.missingFiles > 1 ? 's' : ''} du coffre. L’archive les signale sans les inventer.`}
                </AppText>
              </>
            ) : null}
          </>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Restaurer                                                           */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Restaurer une sauvegarde" icon="upload" />

      <Card sunken style={{ marginBottom: spacing.md, borderColor: colors.danger }}>
        <AppText variant="small" color="danger">
          La restauration remplace toutes les données actuelles. Elle ne fusionne pas : tout
          ce qui a été saisi depuis la date de l’archive sera perdu.
        </AppText>
        <View style={{ height: spacing.sm }} />
        <AppText variant="caption" color="textMuted">
          C’est volontaire : fusionner deux jeux de données créerait des doublons silencieux —
          deux fois le même locataire, deux fois les mêmes échéances — et des totaux faux
          qu’aucun écran ne saurait expliquer. Exportez d’abord une archive de l’état actuel
          si vous n’êtes pas sûr.
        </AppText>
      </Card>

      <Card>
        <Button
          label={picked === null ? 'Choisir une archive' : 'Choisir une autre archive'}
          variant="secondary"
          icon="folder"
          block
          onPress={() => void pickArchive()}
        />

        {picked === null ? (
          <>
            <View style={{ height: spacing.md }} />
            <AppText variant="caption" color="textFaint">
              Le fichier attendu se termine par « .flottebackup » et a été produit par cet
              écran. Il peut venir d’un autre appareil, d’un ordinateur ou d’un stockage en
              ligne : l’archive est autonome.
            </AppText>
          </>
        ) : (
          <>
            <View style={{ height: spacing.lg }} />
            <AppText variant="small" color="textMuted">
              {`Archive choisie : ${picked.name}`}
            </AppText>
            <View style={{ height: spacing.md }} />
            <TextField
              label="Mot de passe de l’archive"
              value={restorePassword}
              onChange={setRestorePassword}
              secure
              autoCapitalize="none"
              hint="Celui qui a servi à créer cette archive. Il n’est conservé nulle part."
            />
            <View style={{ height: spacing.md }} />
            <Button
              label="Lire l’archive"
              icon="folder"
              block
              loading={reading}
              disabled={restorePassword === ''}
              onPress={() => void readArchive()}
            />
            <View style={{ height: spacing.sm }} />
            <AppText variant="caption" color="textFaint">
              Rien n’est modifié à cette étape : le déchiffrement sert seulement à vérifier le
              mot de passe et à montrer ce que contient l’archive. Le remplacement vient après.
            </AppText>
          </>
        )}

        {pending === null ? null : (
          <>
            <View style={{ height: spacing.lg }} />
            <AppText variant="small" color="success">
              {`Archive « ${pending.fileName} » lue avec succès.`}
            </AppText>
            <View style={{ height: spacing.sm }} />
            <KeyValue label="Établie le" value={formatDateTimeFr(pending.manifest.createdAt)} />
            <KeyValue
              label="Lignes"
              value={String(pending.manifest.tables.reduce((sum, table) => sum + table.rows, 0))}
            />
            <KeyValue label="Fichiers" value={String(pending.manifest.fileCount)} />
            {pending.manifest.missingFiles > 0 ? (
              <KeyValue
                label="Fichiers manquants"
                value={String(pending.manifest.missingFiles)}
                valueColor="warning"
              />
            ) : null}

            <View style={{ height: spacing.lg }} />
            <SwitchRow
              label="Je remplace les données actuelles par cette archive"
              hint="Cette action n’est pas réversible. Les données actuelles seront perdues."
              value={acknowledged}
              onChange={setAcknowledged}
            />
            <View style={{ height: spacing.md }} />
            <Button
              label="Restaurer et remplacer"
              variant="danger"
              icon="upload"
              block
              loading={restoring}
              disabled={!acknowledged}
              onPress={() => void restore()}
            />
          </>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Rapport                                                             */}
      {/* ------------------------------------------------------------------ */}
      {report === null ? null : (
        <>
          <SectionHeader title="Rapport de restauration" icon="check-circle" />
          <Card>
            <KeyValue
              label="Tables restaurées"
              value={String(report.tables.filter((table) => table.rows > 0).length)}
            />
            <KeyValue label="Fichiers rétablis" value={String(report.filesRestored)} />
            {report.filesMissing > 0 ? (
              <KeyValue
                label="Fichiers introuvables dans l’archive"
                value={String(report.filesMissing)}
                valueColor="warning"
              />
            ) : null}
            {report.unknownTables.length === 0 ? null : (
              <>
                <View style={{ height: spacing.sm }} />
                <AppText variant="small" color="warning">
                  {`Tables inconnues de cette version, ignorées : ${report.unknownTables.join(', ')}. L’archive vient probablement d’une version plus récente.`}
                </AppText>
              </>
            )}
            <View style={{ height: spacing.md }} />
            <AppText variant="caption" color="textFaint">
              Les tables à zéro ligne sont normales : elles existent mais l’archive n’en
              contenait aucune entrée.
            </AppText>
          </Card>
        </>
      )}

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
