/**
 * Réglages.
 *
 * Un seul écran, en sections : profil du loueur, sécurité, documents obligatoires,
 * rappels, seuils d'alerte, données. Tout est enregistré au fil de la saisie, sans bouton
 * « Enregistrer » — sur un téléphone, un bouton d'enregistrement en bas d'un long écran se
 * perd, et on ne sait plus si la modification a été prise.
 *
 * ## Ce que cet écran doit dire honnêtement
 *
 * Deux choses que l'utilisateur doit savoir, et qui sont écrites noir sur blanc plutôt que
 * cachées dans une politique de confidentialité : la base SQLite **n'est pas chiffrée**,
 * les documents du coffre **le sont** ; et le verrouillage protège de quelqu'un qui a
 * l'appareil en main, pas d'une analyse du stockage.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { LOCK_DELAY_OPTIONS, REMINDER_PRESETS } from '@/domain/settings';
import { useApp } from '@/state/app-context';
import { AppText } from '@/ui/components/text';
import { Card, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button, Chip, MenuRow } from '@/ui/components/button';
import { NumberField, SelectField, SwitchRow, TextField } from '@/ui/components/fields';
import { Icon } from '@/ui/components/icons';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';
import { clearPin, pinIsSet, setPin } from '@/services/security';
import { deviceRandomBytes } from '@/services/device';

export default function SettingsScreen(): ReactElement {
  const { data, patchSettings, repositories, vault, vaultError, refresh } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const settings = data.settings;

  const [hasPin, setHasPin] = useState(false);
  const [pinDraft, setPinDraft] = useState('');
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [owner, setOwner] = useState(settings.owner);

  useEffect(() => {
    if (repositories === null) return;
    void pinIsSet(repositories).then(setHasPin);
  }, [repositories]);

  useEffect(() => {
    setOwner(settings.owner);
  }, [settings.owner]);

  /** Enregistre le profil du loueur. Il est reporté automatiquement dans les contrats. */
  async function saveOwner(): Promise<void> {
    await patchSettings({ owner });
  }

  async function savePin(): Promise<void> {
    if (repositories === null) return;
    try {
      await setPin(pinDraft, repositories, deviceRandomBytes);
      setHasPin(true);
      setPinDraft('');
      setPinMessage('Code enregistré.');
      await patchSettings({ pinEnabled: true });
    } catch (error) {
      setPinMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function removePin(): Promise<void> {
    if (repositories === null) return;
    await clearPin(repositories);
    setHasPin(false);
    setPinMessage('Code supprimé.');
    await patchSettings({ pinEnabled: false, biometricsEnabled: false });
  }

  return (
    <Screen>
      <ScreenTitle title="Réglages" />

      {/* ------------------------------------------------------------------ */}
      {/* Profil du loueur                                                     */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Profil du loueur" icon="user" />
      <Card style={{ marginBottom: spacing.lg }}>
        <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>
          Ces informations sont reportées automatiquement dans chaque contrat de location.
        </AppText>
        <TextField label="Prénom" value={owner.firstName} onChange={(v) => setOwner({ ...owner, firstName: v })} autoCapitalize="words" />
        <TextField label="Nom" value={owner.lastName} onChange={(v) => setOwner({ ...owner, lastName: v })} autoCapitalize="words" />
        <TextField label="Société" value={owner.company} onChange={(v) => setOwner({ ...owner, company: v })} hint="Laisser vide si vous louez en votre nom propre." />
        <TextField label="Adresse" value={owner.address} onChange={(v) => setOwner({ ...owner, address: v })} multiline />
        <TextField label="Téléphone" value={owner.phone} onChange={(v) => setOwner({ ...owner, phone: v })} keyboard="phone-pad" />
        <TextField label="Courriel" value={owner.email} onChange={(v) => setOwner({ ...owner, email: v })} keyboard="email-address" autoCapitalize="none" />
        <TextField label="SIRET" value={owner.siret} onChange={(v) => setOwner({ ...owner, siret: v })} keyboard="number-pad" />
        <Button label="Enregistrer le profil" onPress={() => void saveOwner()} variant="secondary" block />
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Sécurité                                                            */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Sécurité" icon="lock" />
      <Card style={{ marginBottom: spacing.lg }}>
        <SwitchRow
          label="Déverrouillage par Face ID"
          hint={hasPin ? 'Face ID évite de saisir le code à chaque ouverture.' : 'Un code doit d’abord être posé.'}
          value={settings.biometricsEnabled && hasPin}
          onChange={(value) => void patchSettings({ biometricsEnabled: value })}
        />
        <View style={{ height: spacing.md }} />
        <AppText variant="label" color="textMuted">
          {hasPin ? 'Modifier le code' : 'Poser un code'}
        </AppText>
        <View style={{ height: spacing.sm }} />
        <TextField
          label="Code à 6 chiffres minimum"
          value={pinDraft}
          onChange={setPinDraft}
          keyboard="number-pad"
          placeholder="••••••"
          hint="Sert de secours quand Face ID n’est pas disponible."
        />
        <View style={styles.row}>
          <Button
            label={hasPin ? 'Remplacer le code' : 'Poser le code'}
            onPress={() => void savePin()}
            disabled={pinDraft.length < 6}
            variant="secondary"
          />
          {hasPin ? (
            <Button
              label="Supprimer"
              variant="ghost"
              onPress={() =>
                Alert.alert('Supprimer le code ?', 'Le verrouillage sera désactivé.', [
                  { text: 'Annuler', style: 'cancel' },
                  { text: 'Supprimer', style: 'destructive', onPress: () => void removePin() },
                ])
              }
            />
          ) : null}
        </View>
        {pinMessage === null ? null : (
          <AppText variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
            {pinMessage}
          </AppText>
        )}

        <View style={{ height: spacing.lg }} />
        <SelectField
          label="Verrouillage automatique"
          value={String(settings.lockDelaySeconds)}
          options={LOCK_DELAY_OPTIONS.map((option) => ({
            value: String(option.seconds),
            label: option.label,
          }))}
          onChange={(value) => void patchSettings({ lockDelaySeconds: Number(value) })}
          grid
          hint="Délai après un passage en arrière-plan."
        />

        <Card sunken>
          <View style={styles.noticeRow}>
            <Icon name="shield" size={16} color={colors.textMuted} strokeWidth={2} />
            <AppText variant="caption" color="textMuted" style={{ marginLeft: 6, flex: 1 }}>
              Les documents (permis, carte grise, factures) sont chiffrés sur cet appareil.
              La base elle-même — montants, noms, dates — n’est pas chiffrée. Le verrouillage
              protège de quelqu’un qui a l’appareil en main, pas d’une analyse du stockage.
            </AppText>
          </View>
        </Card>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Documents obligatoires                                              */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Documents obligatoires" icon="file-check" />
      <Card style={{ marginBottom: spacing.lg }}>
        <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>
          Cochés, ces documents sont vérifiés avant l’activation d’une location. Un document
          manquant donne un avertissement, jamais un blocage : vous pouvez forcer.
        </AppText>
        <View style={styles.chips}>
          {data.documentTypes
            .filter((type) => type.scope === 'locataire')
            .map((type) => {
              const selected = settings.requiredDocumentTypeIds.includes(type.id);
              return (
                <Chip
                  key={type.id}
                  label={type.label}
                  selected={selected}
                  onPress={() =>
                    void patchSettings({
                      requiredDocumentTypeIds: selected
                        ? settings.requiredDocumentTypeIds.filter((id) => id !== type.id)
                        : [...settings.requiredDocumentTypeIds, type.id],
                    })
                  }
                />
              );
            })}
        </View>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Rappels et seuils                                                   */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Rappels" icon="bell" />
      <Card style={{ marginBottom: spacing.lg }}>
        <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>
          Jours avant échéance auxquels un rappel est programmé.
        </AppText>
        <View style={styles.chips}>
          {[...new Set([...REMINDER_PRESETS, ...settings.reminderDays])]
            .sort((a, b) => b - a)
            .map((days) => {
              const selected = settings.reminderDays.includes(days);
              return (
                <Chip
                  key={days}
                  label={`${days} j`}
                  selected={selected}
                  onPress={() =>
                    void patchSettings({
                      reminderDays: selected
                        ? settings.reminderDays.filter((value) => value !== days)
                        : [...settings.reminderDays, days].sort((a, b) => b - a),
                    })
                  }
                />
              );
            })}
        </View>
        <MenuRow
          label="Voir les rappels programmés"
          icon="bell"
          onPress={() => router.push('/notifications')}
        />
      </Card>

      <SectionHeader title="Seuils d’alerte" icon="alert-triangle" />
      <Card style={{ marginBottom: spacing.lg }}>
        <NumberField
          label="Entretien — seuil d’avertissement"
          value={settings.maintenanceWarningKm}
          onChange={(value) => void patchSettings({ maintenanceWarningKm: value ?? 2000 })}
          suffix="km"
        />
        <NumberField
          label="Entretien — seuil critique"
          value={settings.maintenanceCriticalKm}
          onChange={(value) => void patchSettings({ maintenanceCriticalKm: value ?? 500 })}
          suffix="km"
        />
        <NumberField
          label="Document — avertissement"
          value={settings.documentWarningDays}
          onChange={(value) => void patchSettings({ documentWarningDays: value ?? 30 })}
          suffix="jours"
        />
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Données                                                             */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Données et sauvegarde" icon="archive" />
      <Card style={{ marginBottom: spacing.lg }}>
        <AppText variant="caption" color="textMuted" style={{ marginBottom: spacing.md }}>
          Tout vit sur cet appareil : il n’y a ni serveur, ni compte, ni synchronisation.
          Une sauvegarde manuelle est donc la seule protection contre une perte de téléphone.
        </AppText>
        <MenuRow label="Sauvegarde et restauration" icon="download" onPress={() => router.push('/sauvegarde')} />
        <MenuRow label="Exporter en CSV" icon="file-spreadsheet" onPress={() => router.push('/export')} />
        <MenuRow label="Rechercher" icon="search" onPress={() => router.push('/recherche')} />
      </Card>

      <SectionHeader title="Coffre des documents" icon="folder" />
      <Card style={{ marginBottom: spacing.lg }}>
        {vault === null ? (
          <View style={styles.noticeRow}>
            <Icon name="alert-triangle" size={16} color={colors.danger} strokeWidth={2} />
            <AppText variant="small" color="danger" style={{ marginLeft: 6, flex: 1 }}>
              {vaultError ?? 'Le coffre local n’est pas disponible sur cet appareil.'}
            </AppText>
          </View>
        ) : (
          <View style={styles.noticeRow}>
            <Icon name="check-circle" size={16} color={colors.success} strokeWidth={2} />
            <AppText variant="small" color="textMuted" style={{ marginLeft: 6, flex: 1 }}>
              {`Coffre actif. ${data.tenantDocuments.length + data.vehicleDocuments.length} document(s) enregistré(s), chiffrés localement.`}
            </AppText>
          </View>
        )}
        <View style={{ height: spacing.md }} />
        <MenuRow label="Voir tous les documents" icon="folder" onPress={() => router.push('/documents')} />
      </Card>

      <SectionHeader title="À propos" icon="sparkles" />
      <Card>
        <MenuRow label="Version" value="1.0.0" />
        <MenuRow label="Fonctionne hors ligne" value="oui" />
        <MenuRow label="Données envoyées" value="aucune" />
        <View style={{ height: spacing.md }} />
        <Button
          label="Recharger les données"
          variant="secondary"
          block
          onPress={() => void refresh()}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start' },
});
