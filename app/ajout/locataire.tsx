/**
 * Fiche d'un locataire — création et modification.
 *
 * ## Ce qui est obligatoire, et ce qui ne l'est pas
 *
 * Seuls le nom et le prénom le sont. Exiger une date de naissance, une adresse ou un
 * numéro de permis à la création ferait perdre du temps au moment où l'on prend juste un
 * contact par téléphone — et un champ obligatoire qu'on ne peut pas remplir se contourne en
 * tapant n'importe quoi, ce qui est pire qu'un champ vide.
 *
 * ## Le dossier de documents
 *
 * L'écran montre où en est le dossier sans le bloquer : ce qui manque est listé, et
 * l'utilisateur peut enregistrer quand même. C'est la même règle que partout ailleurs dans
 * l'application — le logiciel informe, le propriétaire décide. Le détail se remplit depuis
 * la fiche du locataire, où chaque document se dépose.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { DOCUMENT_STATUS_LABELS } from '@/domain/catalog';
import { checkRentalEligibility } from '@/domain/eligibility';
import { formatFr, todayIso } from '@/domain/dates';
import type { Tenant } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { AppText } from '@/ui/components/text';
import { Badge, Card, DetailTitle, Screen, ScreenTitle, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { DateField, TextField } from '@/ui/components/fields';
import { spacing } from '@/ui/theme';

export default function TenantFormScreen(): ReactElement {
  const { data, repositories, refresh, now, newId } = useApp();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const existing = data.tenants.find((candidate) => candidate.id === params.id) ?? null;
  const isEdit = existing !== null;

  const [firstName, setFirstName] = useState(existing?.firstName ?? '');
  const [lastName, setLastName] = useState(existing?.lastName ?? '');
  const [birthDate, setBirthDate] = useState<string | null>(existing?.birthDate ?? null);
  const [address, setAddress] = useState(existing?.address ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [email, setEmail] = useState(existing?.email ?? '');
  const [licenseNumber, setLicenseNumber] = useState(existing?.licenseNumber ?? '');
  const [licenseDate, setLicenseDate] = useState<string | null>(existing?.licenseDate ?? null);
  const [vtcNumber, setVtcNumber] = useState(existing?.vtcNumber ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * État du dossier. Sur une création, il n'y a évidemment aucun document : le bloc
   * n'apparaît donc qu'en modification, où il a quelque chose à dire.
   */
  const eligibility = useMemo(() => {
    if (existing === null) return null;
    const requirements = data.settings.requiredDocumentTypeIds
      .map((typeId) => data.documentTypes.find((type) => type.id === typeId))
      .filter((type): type is NonNullable<typeof type> => type !== undefined)
      .map((type) => ({ typeId: type.id, label: type.label }));

    return checkRentalEligibility({
      requirements,
      documents: data.tenantDocuments
        .filter((document) => document.tenantId === existing.id)
        .map((document) => ({
          id: document.id,
          typeId: document.typeId,
          expiryDate: document.expiryDate,
        })),
      today: todayIso(),
      warningDays: data.settings.documentWarningDays,
    });
  }, [data.documentTypes, data.settings, data.tenantDocuments, existing]);

  const birthDateInFuture = birthDate !== null && birthDate > todayIso();
  const licenseDateInFuture = licenseDate !== null && licenseDate > todayIso();

  async function save(): Promise<void> {
    if (repositories === null) return;
    if (firstName.trim() === '' || lastName.trim() === '') {
      setError('Le prénom et le nom sont nécessaires.');
      return;
    }
    if (birthDateInFuture) {
      setError('La date de naissance ne peut pas être dans le futur.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const timestamp = now();
      const tenant: Tenant = {
        id: existing?.id ?? newId(),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        archivedAt: existing?.archivedAt ?? null,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        birthDate,
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        licenseNumber: licenseNumber.trim(),
        licenseDate,
        vtcNumber: vtcNumber.trim(),
        notes,
      };

      if (existing === null) await repositories.tenants.insert(tenant);
      else await repositories.tenants.update(tenant);

      await refresh();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  async function archive(): Promise<void> {
    if (repositories === null || existing === null) return;
    const active = data.rentals.some(
      (rental) => rental.tenantId === existing.id && rental.status === 'active',
    );
    if (active) {
      setError('Ce locataire a une location en cours : terminez-la avant de l’archiver.');
      return;
    }
    setSaving(true);
    try {
      await repositories.tenants.archive(existing.id, now());
      await refresh();
      router.back();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen
      footer={
        <Button
          label={isEdit ? 'Enregistrer les modifications' : 'Ajouter le locataire'}
          onPress={() => void save()}
          loading={saving}
          disabled={repositories === null}
          block
        />
      }
    >
      {isEdit ? (
        <DetailTitle
          title="Modifier le locataire"
          subtitle={`${existing?.firstName ?? ''} ${existing?.lastName ?? ''}`.trim()}
          onBack={() => router.back()}
        />
      ) : (
        <ScreenTitle title="Nouveau locataire" subtitle="Coordonnées, permis, carte VTC" />
      )}

      <SectionHeader title="Identité" />
      <TextField
        label="Prénom"
        required
        value={firstName}
        onChange={setFirstName}
        autoCapitalize="words"
      />
      <TextField
        label="Nom"
        required
        value={lastName}
        onChange={setLastName}
        autoCapitalize="words"
      />
      <DateField
        label="Date de naissance"
        value={birthDate}
        onChange={setBirthDate}
        error={birthDateInFuture ? 'Dans le futur.' : null}
      />

      <SectionHeader title="Coordonnées" />
      <TextField
        label="Adresse"
        value={address}
        onChange={setAddress}
        multiline
        placeholder="Numéro, rue, code postal, ville"
      />
      <TextField
        label="Téléphone"
        value={phone}
        onChange={setPhone}
        keyboard="phone-pad"
        placeholder="06 12 34 56 78"
      />
      <TextField
        label="Courriel"
        value={email}
        onChange={setEmail}
        keyboard="email-address"
        autoCapitalize="none"
        placeholder="nom@exemple.fr"
      />

      <SectionHeader title="Permis et carte professionnelle" />
      <TextField
        label="Numéro de permis"
        value={licenseNumber}
        onChange={setLicenseNumber}
        autoCapitalize="characters"
      />
      <DateField
        label="Date de délivrance du permis"
        value={licenseDate}
        onChange={setLicenseDate}
        error={licenseDateInFuture ? 'Dans le futur.' : null}
      />
      <TextField
        label="Numéro de carte VTC"
        value={vtcNumber}
        onChange={setVtcNumber}
        autoCapitalize="characters"
        hint="Si le locataire exerce une activité de transport."
      />

      <SectionHeader title="Notes" />
      <TextField
        label="Observations"
        value={notes}
        onChange={setNotes}
        multiline
        placeholder="Employeur, garant, remarques sur les locations précédentes…"
      />

      {eligibility === null ? null : (
        <>
          <SectionHeader title="Dossier de documents" />
          <Card>
            {eligibility.items.length === 0 ? (
              <AppText variant="small" color="textMuted">
                Aucun type de document n’est exigé. Cette liste se règle dans les paramètres,
                à la rubrique des documents obligatoires.
              </AppText>
            ) : (
              <>
                {eligibility.message === null ? (
                  <AppText variant="small" color="success">
                    Dossier complet : tous les documents exigés sont présents et valides.
                  </AppText>
                ) : (
                  <AppText variant="small" color="warning">
                    {eligibility.message}
                  </AppText>
                )}
                <View style={{ height: spacing.md }} />
                {eligibility.items.map((item) => (
                  <View
                    key={item.typeId}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}
                  >
                    <AppText variant="small" style={{ flex: 1 }}>
                      {item.label}
                    </AppText>
                    {item.expiryDate === null ? null : (
                      <AppText variant="caption" color="textFaint" style={{ marginRight: spacing.sm }}>
                        {formatFr(item.expiryDate)}
                      </AppText>
                    )}
                    <Badge {...DOCUMENT_STATUS_LABELS[item.status]} />
                  </View>
                ))}
                <View style={{ height: spacing.sm }} />
                <AppText variant="caption" color="textFaint">
                  Le dossier se complète depuis la fiche du locataire. Il ne bloque pas
                  l’enregistrement : il informe.
                </AppText>
              </>
            )}
          </Card>
        </>
      )}

      {error === null ? null : (
        <Card sunken style={{ marginTop: spacing.lg }}>
          <AppText variant="small" color="danger">
            {error}
          </AppText>
        </Card>
      )}

      {isEdit ? (
        <>
          <SectionHeader title="Retirer des locataires" />
          <Card>
            <AppText variant="small" color="textMuted">
              Archiver conserve l’historique des locations, des paiements et des contrats.
              Le locataire sort des listes sans que rien ne soit perdu.
            </AppText>
            <View style={{ height: spacing.md }} />
            <Button
              label="Archiver ce locataire"
              variant="secondary"
              block
              onPress={() => void archive()}
            />
          </Card>
        </>
      ) : null}
    </Screen>
  );
}
