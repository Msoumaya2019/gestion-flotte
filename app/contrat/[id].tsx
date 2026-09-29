/**
 * Contrat de location — préparation, signature, PDF.
 *
 * ## Le texte juridique n'est pas ici
 *
 * Les clauses vivent en base, et le propriétaire les modifie, les désactive ou en ajoute
 * sans qu'on touche à ce fichier. L'écran ne fait que trois choses : choisir quelles
 * clauses retenir, substituer les variables, et mettre en page. C'est ce qui permet
 * d'adapter un contrat à son activité sans livrer une nouvelle version de l'application.
 *
 * ## Ce qui est figé au moment de la signature, et pourquoi
 *
 * Un contrat signé ne doit plus bouger. Si le locataire change d'adresse le mois suivant,
 * le contrat déjà signé doit continuer d'afficher l'adresse du jour de la signature — sans
 * quoi deux exemplaires du même contrat, imprimés à un mois d'intervalle, ne diraient plus
 * la même chose, et c'est le genre d'écart qui fait perdre un litige.
 *
 * D'où les instantanés : à chaque enregistrement, les cinq vues (loueur, locataire,
 * véhicule, conditions, clauses retenues) sont sérialisées dans le contrat. Tant qu'il est
 * en brouillon, l'aperçu suit les données vivantes ; dès qu'il est signé, il se relit
 * **depuis les instantanés**, et les données vivantes ne l'atteignent plus.
 *
 * ## L'aperçu passe par la boîte d'impression
 *
 * Il n'y a pas de `WebView` dans ce projet, et en ajouter une pour afficher un document
 * qu'iOS sait déjà composer serait payer cher un rendu moins fidèle. La boîte d'impression
 * du système montre exactement ce qui sortira sur papier, et permet de zoomer.
 *
 * ## La signature est dessinée au doigt
 *
 * Elle est stockée en tracés SVG dans un repère fixe (1000 × 400), donc indépendante de la
 * taille de l'écran : la même signature se replace correctement sur un iPhone SE comme sur
 * un iPad, et dans le PDF.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { CONTRACT_STATUS_LABELS, DOCUMENT_STATUS_LABELS, FREQUENCY_LABELS, FUEL_TYPE_LABELS } from '@/domain/catalog';
import {
  buildContractVariables,
  clausePreview,
  renderContractHtml,
  unknownVariables,
  type ContractClauseView,
  type ContractRenderInput,
} from '@/domain/contract';
import { formatFr } from '@/domain/dates';
import { documentValidity, isUsable } from '@/domain/documents';
import { checkRentalEligibility } from '@/domain/eligibility';
import { formatKm, formatMoney } from '@/domain/money';
import { openEndedHorizon, scheduleLabel } from '@/domain/rental';
import type { Contract, ContractStatus, DocumentStatus } from '@/domain/types';
import { useApp } from '@/state/app-context';
import { tenantName, vehicleName } from '@/state/use-derived';
import { storeAttachmentFromUri } from '@/services/attachments';
import { discardOutput, pdfFromHtml, printHtml, shareOutput } from '@/services/output';
import { AppText } from '@/ui/components/text';
import { Badge, Card, DetailTitle, EmptyState, KeyValue, Screen, SectionHeader } from '@/ui/components/base';
import { Button } from '@/ui/components/button';
import { SwitchRow } from '@/ui/components/fields';
import { SignaturePad } from '@/ui/components/signature';
import { spacing } from '@/ui/theme';
import { useTheme } from '@/ui/use-theme';

/**
 * Contenu de `Contract.clausesSnapshot`.
 *
 * Les documents retenus y sont joints : leurs **libellés et états** au moment de la
 * signature ne se recalculent pas plus tard. Un permis valide le jour de la signature et
 * expiré trois mois après doit rester « valide » sur l'exemplaire signé — c'est ce qu'il
 * disait, et c'est ce qui a été paraphé.
 */
interface ClauseSnapshot {
  clauses: { id: string; title: string; body: string; enabled: boolean }[];
  documents: { id: string; label: string; status: DocumentStatus | 'absent' }[];
}

/** Relit un instantané. Une valeur illisible rend `null` plutôt que de lever. */
function parseJson<T>(raw: string | null | undefined): T | null {
  if (raw === null || raw === undefined || raw.trim() === '') return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed as T;
  } catch {
    return null;
  }
}

export default function ContractScreen(): ReactElement {
  const { data, repositories, refresh, now, today, newId, vault } = useApp();
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();

  const rental = data.rentals.find((candidate) => candidate.id === params.id) ?? null;
  const vehicle =
    rental === null ? null : (data.vehicles.find((v) => v.id === rental.vehicleId) ?? null);
  const tenant =
    rental === null ? null : (data.tenants.find((t) => t.id === rental.tenantId) ?? null);

  // Plusieurs contrats peuvent exister pour une location (un avenant, une reprise). On
  // travaille sur le plus récent non archivé.
  const existing = useMemo(() => {
    if (rental === null) return null;
    const candidates = data.contracts
      .filter((contract) => contract.rentalId === rental.id && contract.archivedAt === null)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return candidates[0] ?? null;
  }, [data.contracts, rental]);

  const todayDate = today();

  /** Capturé une fois : un horodatage recalculé à chaque rendu ferait bouger le document. */
  const [generatedAt] = useState(() => now());

  const [reference, setReference] = useState<string | null>(existing?.reference ?? null);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const [ownerSignature, setOwnerSignature] = useState<string | null>(existing?.ownerSignature ?? null);
  const [tenantSignature, setTenantSignature] = useState<string | null>(
    existing?.tenantSignature ?? null,
  );

  const [chosenClauseIds, setChosenClauseIds] = useState<Set<string> | null>(null);
  const [chosenDocumentIds, setChosenDocumentIds] = useState<Set<string> | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Référence du contrat
  // -------------------------------------------------------------------------

  useEffect(() => {
    if (existing !== null || repositories === null) return;
    let cancelled = false;
    repositories.contracts
      .nextReference(Number(todayDate.slice(0, 4)))
      .then((value) => {
        if (!cancelled) setReference(value);
      })
      .catch((caught: unknown) => {
        // On n'invente pas de référence de repli : un numéro déjà pris sur un contrat
        // archivé produirait deux documents différents portant la même référence.
        if (!cancelled) {
          setReferenceError(
            `La référence du contrat n’a pas pu être calculée : ${
              caught instanceof Error ? caught.message : String(caught)
            }`,
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [existing, repositories, todayDate]);

  // -------------------------------------------------------------------------
  // Clauses retenues
  // -------------------------------------------------------------------------

  const savedSnapshot = useMemo(
    () => parseJson<ClauseSnapshot>(existing?.clausesSnapshot ?? null),
    [existing?.clausesSnapshot],
  );

  const enabledClauses = useMemo(
    () =>
      data.clauses
        .filter((clause) => clause.enabled && clause.archivedAt === null)
        .sort((a, b) => a.position - b.position),
    [data.clauses],
  );

  const initialClauseIds = useMemo(() => {
    if (savedSnapshot !== null) {
      return savedSnapshot.clauses.filter((clause) => clause.enabled).map((clause) => clause.id);
    }
    return enabledClauses.map((clause) => clause.id);
  }, [savedSnapshot, enabledClauses]);

  const selectedClauseIds = useMemo(
    () => chosenClauseIds ?? new Set(initialClauseIds),
    [chosenClauseIds, initialClauseIds],
  );

  // -------------------------------------------------------------------------
  // Documents justificatifs du locataire
  // -------------------------------------------------------------------------

  const tenantDocuments = useMemo(
    () =>
      tenant === null
        ? []
        : data.tenantDocuments.filter(
            (document) => document.tenantId === tenant.id && document.archivedAt === null,
          ),
    [data.tenantDocuments, tenant],
  );

  const documentEntries = useMemo(
    () =>
      tenantDocuments.map((document) => {
        const type = data.documentTypes.find((candidate) => candidate.id === document.typeId);
        const status = documentValidity(
          document.expiryDate,
          todayDate,
          data.settings.documentWarningDays,
        ).status;
        const number = document.number.trim() === '' ? '' : ` n° ${document.number.trim()}`;
        return {
          id: document.id,
          label: `${type?.label ?? 'Document'}${number}`,
          status,
        };
      }),
    [tenantDocuments, data.documentTypes, data.settings.documentWarningDays, todayDate],
  );

  const initialDocumentIds = useMemo(() => {
    if (existing !== null) return existing.documentIds;
    return documentEntries.filter((entry) => isUsable(entry.status)).map((entry) => entry.id);
  }, [existing, documentEntries]);

  const selectedDocumentIds = useMemo(
    () => chosenDocumentIds ?? new Set(initialDocumentIds),
    [chosenDocumentIds, initialDocumentIds],
  );

  // -------------------------------------------------------------------------
  // Vues du contrat
  // -------------------------------------------------------------------------

  /**
   * Clauses retenues, **avec leur identifiant**.
   *
   * L'identifiant n'est pas décoratif : c'est lui qui est réécrit dans l'instantané du
   * contrat. Une première version appariait les clauses par leur position dans la liste
   * filtrée — dès qu'une seule était décochée, l'identifiant d'une clause se retrouvait
   * attribué au texte d'une autre, et le contrat signé relisait ensuite une clause qui
   * n'était pas celle qu'on croyait avoir retenue.
   */
  const selectedClauseEntries = useMemo(() => {
    if (savedSnapshot !== null && existing?.status === 'signe') {
      return savedSnapshot.clauses.filter((clause) => clause.enabled);
    }
    return enabledClauses
      .filter((clause) => selectedClauseIds.has(clause.id))
      .map((clause) => ({ id: clause.id, title: clause.title, body: clause.body, enabled: true }));
  }, [savedSnapshot, existing?.status, enabledClauses, selectedClauseIds]);

  const clauseViews: ContractClauseView[] = useMemo(
    () => selectedClauseEntries.map((clause) => ({ title: clause.title, body: clause.body })),
    [selectedClauseEntries],
  );

  /**
   * Documents retenus, avec leur identifiant, pour la même raison que les clauses.
   *
   * Sur un contrat signé, l'instantané fait foi et n'est plus filtré : il contient déjà
   * exactement ce qui a été paraphé, états compris.
   */
  const selectedDocumentEntries = useMemo(() => {
    if (savedSnapshot !== null && existing?.status === 'signe') {
      return savedSnapshot.documents;
    }
    return documentEntries.filter((entry) => selectedDocumentIds.has(entry.id));
  }, [savedSnapshot, existing?.status, documentEntries, selectedDocumentIds]);

  const documentViews = useMemo(
    () => selectedDocumentEntries.map((entry) => ({ label: entry.label, status: entry.status })),
    [selectedDocumentEntries],
  );

  const bothSigned = ownerSignature !== null && tenantSignature !== null;

  /**
   * Date portée par le document.
   *
   * Sur un contrat signé, c'est la date de signature : c'est ce qui est écrit sur
   * l'exemplaire papier, et le rouvrir un an plus tard ne doit pas le re-dater.
   */
  const documentDate =
    existing?.signedAt != null ? existing.signedAt.slice(0, 10) : todayDate;

  const renderInput: ContractRenderInput | null = useMemo(() => {
    if (rental === null || vehicle === null || tenant === null || reference === null) return null;

    return {
      reference,
      generatedAt,
      currency: data.settings.currency,
      owner: data.settings.owner,
      tenant: {
        firstName: tenant.firstName,
        lastName: tenant.lastName,
        birthDate: tenant.birthDate,
        address: tenant.address,
        phone: tenant.phone,
        email: tenant.email,
        licenseNumber: tenant.licenseNumber,
        licenseDate: tenant.licenseDate,
        vtcNumber: tenant.vtcNumber,
      },
      vehicle: {
        brand: vehicle.brand,
        model: vehicle.model,
        trim: vehicle.trim,
        year: vehicle.year,
        plate: vehicle.plate,
        vin: vehicle.vin,
        fuelLabel: FUEL_TYPE_LABELS[vehicle.fuelType],
        currentMileageKm: vehicle.currentMileageKm,
      },
      terms: {
        startDate: rental.startDate,
        endDate: rental.endDate,
        openEnded: rental.openEnded,
        rentAmountCents: rental.rentAmountCents,
        frequencyLabel: FREQUENCY_LABELS[rental.frequency],
        dueLabel: scheduleLabel(rental),
        depositCents: rental.depositCents,
        allowedKm: rental.allowedKm,
        excessKmPriceCents: rental.excessKmPriceCents,
        feesCents: rental.feesCents,
        startMileageKm: rental.startMileageKm,
      },
      clauses: clauseViews,
      documents: documentViews,
      signatures: {
        owner: ownerSignature,
        tenant: tenantSignature,
        signedAt: existing?.signedAt ?? null,
      },
      today: documentDate,
    };
  }, [
    rental,
    vehicle,
    tenant,
    reference,
    generatedAt,
    data.settings.currency,
    data.settings.owner,
    clauseViews,
    documentViews,
    ownerSignature,
    tenantSignature,
    existing?.signedAt,
    documentDate,
  ]);

  const variables = useMemo(
    () => (renderInput === null ? {} : buildContractVariables(renderInput)),
    [renderInput],
  );

  // -------------------------------------------------------------------------
  // Dossier du locataire — le même contrôle que celui de la création
  // -------------------------------------------------------------------------

  const eligibility = useMemo(() => {
    if (tenant === null) return null;

    // Un identifiant de type qui ne correspond plus à rien est ignoré : le réglage a
    // survécu à la suppression du type, et exiger « Document » sans nom ne veut rien dire.
    const requirements = data.settings.requiredDocumentTypeIds
      .map((typeId) => data.documentTypes.find((type) => type.id === typeId))
      .filter((type): type is NonNullable<typeof type> => type !== undefined)
      .map((type) => ({ typeId: type.id, label: type.label }));

    return checkRentalEligibility({
      requirements,
      documents: tenantDocuments.map((document) => ({
        id: document.id,
        typeId: document.typeId,
        expiryDate: document.expiryDate,
      })),
      today: todayDate,
      warningDays: data.settings.documentWarningDays,
    });
  }, [
    tenant,
    tenantDocuments,
    data.settings.requiredDocumentTypeIds,
    data.documentTypes,
    data.settings.documentWarningDays,
    todayDate,
  ]);

  // -------------------------------------------------------------------------
  // Garde : données manquantes
  // -------------------------------------------------------------------------

  if (rental === null || vehicle === null || tenant === null) {
    return (
      <Screen>
        <DetailTitle title="Contrat" onBack={() => router.back()} />
        <Card>
          <EmptyState
            icon="file-text"
            title="Contrat introuvable"
            message="La location, le véhicule ou le locataire de ce contrat n’existe plus."
            action={<Button label="Retour" onPress={() => router.back()} />}
          />
        </Card>
      </Screen>
    );
  }

  /**
   * Ce que les fonctions internes ont besoin de savoir, figé après la garde.
   *
   * Elles sont déclarées par `function`, donc **hissées** : TypeScript ne peut pas prouver
   * qu'elles s'exécutent après la garde ci-dessus, et redemande une vérification de nullité
   * à chaque usage — vérification impossible à satisfaire, puisque le retour anticipé a
   * déjà eu lieu. Ces liaisons non nulles portent l'information à leur place.
   */
  const rentalId = rental.id;
  const rentalStartDate = rental.startDate;
  const rentalEndDate = rental.endDate;
  const tenantId = tenant.id;

  // -------------------------------------------------------------------------
  // Libellés dérivés
  // -------------------------------------------------------------------------

  const ownerLabel =
    data.settings.owner.company.trim() !== ''
      ? data.settings.owner.company
      : `${data.settings.owner.firstName} ${data.settings.owner.lastName}`.trim();

  const periodLabel =
    rental.openEnded || rental.endDate === null
      ? `À partir du ${formatFr(rental.startDate)}, sans date de fin`
      : `Du ${formatFr(rental.startDate)} au ${formatFr(rental.endDate)}`;

  // -------------------------------------------------------------------------
  // Écriture du contrat
  // -------------------------------------------------------------------------

  /** Instantané des vues au moment de l'enregistrement. Voir l'en-tête du fichier. */
  function buildContract(status: ContractStatus, pdfFileId: string | null, signedAt: string | null): Contract {
    const timestamp = now();
    const input = renderInput;

    return {
      id: existing?.id ?? newId(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      archivedAt: null,
      rentalId,
      reference: reference ?? existing?.reference ?? '',
      status,
      generatedAt: existing?.generatedAt ?? (pdfFileId === null ? null : timestamp),
      ownerSnapshot: JSON.stringify(input?.owner ?? data.settings.owner),
      tenantSnapshot: JSON.stringify(input?.tenant ?? {}),
      vehicleSnapshot: JSON.stringify(input?.vehicle ?? {}),
      rentalSnapshot: JSON.stringify(input?.terms ?? {}),
      clausesSnapshot: JSON.stringify({
        clauses: selectedClauseEntries.map((clause) => ({
          id: clause.id,
          title: clause.title,
          body: clause.body,
          enabled: true,
        })),
        documents: selectedDocumentEntries.map((entry) => ({
          id: entry.id,
          label: entry.label,
          status: entry.status,
        })),
      } satisfies ClauseSnapshot),
      documentIds: selectedDocumentEntries.map((entry) => entry.id),
      ownerSignature,
      tenantSignature,
      signedAt,
      pdfFileId: pdfFileId ?? existing?.pdfFileId ?? null,
    };
  }

  async function persist(
    status: ContractStatus,
    pdfFileId: string | null,
    signedAt: string | null,
  ): Promise<void> {
    if (repositories === null) return;
    const contract = buildContract(status, pdfFileId, signedAt);
    if (existing === null) await repositories.contracts.insert(contract);
    else await repositories.contracts.update(contract);
    await refresh();
  }

  /**
   * Enregistre les signatures.
   *
   * Le statut ne passe à « signé » que lorsque les **deux** signatures sont là : une
   * signature seule ne vaut pas contrat, et l'annoncer signé donnerait une fausse
   * assurance au moment d'activer la location.
   */
  async function saveSignatures(): Promise<void> {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const signedAt = bothSigned ? (existing?.signedAt ?? now()) : null;
      await persist(bothSigned ? 'signe' : 'brouillon', null, signedAt);
      setNotice(
        bothSigned
          ? 'Signatures enregistrées. Le contrat est signé et ne bougera plus.'
          : 'Signature enregistrée. Il manque encore l’autre partie pour que le contrat soit signé.',
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  /**
   * Aperçu à l'écran : la boîte d'impression du système, qui compose déjà l'A4.
   *
   * `printHtml` ne distingue pas une annulation d'un échec de composition — les deux se
   * traduisent par une promesse rejetée. Le message le dit plutôt que d'affirmer une
   * annulation qui n'a peut-être pas eu lieu : un gabarit cassé passerait sinon pour une
   * fermeture de fenêtre, et personne ne chercherait pourquoi rien ne s'imprime.
   */
  async function preview(): Promise<void> {
    if (renderInput === null) return;
    setError(null);
    setNotice(null);
    try {
      const printed = await printHtml(renderContractHtml(renderInput));
      if (!printed) {
        setNotice(
          'Aperçu fermé sans impression. Si la fenêtre ne s’est pas ouverte du tout, c’est que le document n’a pas pu être composé.',
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  /**
   * Produit le PDF, l'archive dans le coffre, puis le remet au système.
   *
   * L'ordre compte : le PDF est **d'abord** rangé dans le coffre, et ce n'est qu'ensuite
   * qu'on propose le partage. Partager d'abord ferait dépendre l'archivage d'une action
   * de l'utilisateur — s'il ferme la feuille de partage, le contrat n'est pas conservé.
   */
  async function generatePdf(): Promise<void> {
    if (renderInput === null || repositories === null || vault === null) {
      setError('Le coffre est indisponible : le PDF ne peut pas être archivé.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);

    let produced: Awaited<ReturnType<typeof pdfFromHtml>> | null = null;
    try {
      produced = await pdfFromHtml(renderContractHtml(renderInput), `Contrat ${reference ?? ''}`);

      const stored = await storeAttachmentFromUri({
        vault,
        repositories,
        kind: 'contrat',
        uri: produced.uri,
        fileName: produced.name,
        mimeType: 'application/pdf',
        notes: `Contrat ${reference ?? ''} — ${tenantName(data, tenantId)}`,
      });

      const signedAt = bothSigned ? (existing?.signedAt ?? now()) : null;
      await persist(bothSigned ? 'signe' : 'genere', stored.id, signedAt);

      await shareOutput(produced, 'Envoyer le contrat');
      setNotice(`Contrat ${reference ?? ''} archivé dans le coffre.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      // La copie du cache est jetable : l'archive est dans le coffre. La garder ferait
      // grossir le cache sans que rien ne la retrouve.
      if (produced !== null) discardOutput(produced);
      setBusy(false);
    }
  }

  /** Activation depuis le contrat : c'est le dernier écran du parcours de création. */
  async function activateRental(): Promise<void> {
    if (repositories === null) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await repositories.rentals.activate({
        id: rentalId,
        until: rentalEndDate ?? openEndedHorizon(rentalStartDate, 12),
        methodId: data.paymentMethods[0]?.id ?? null,
        now: now(),
      });
      await refresh();
      setNotice('Location activée : le véhicule est marqué loué et l’échéancier est engendré.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const toggleClause = (id: string): void => {
    const next = new Set(selectedClauseIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosenClauseIds(next);
  };

  const toggleDocument = (id: string): void => {
    const next = new Set(selectedDocumentIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setChosenDocumentIds(next);
  };

  const missingClauses = enabledClauses.filter((clause) =>
    unknownVariables(clause.body, variables),
  );
  const status: ContractStatus =
    existing?.status === 'signe' && bothSigned
      ? 'signe'
      : existing?.pdfFileId != null
        ? 'genere'
        : 'brouillon';

  return (
    <Screen
      footer={
        <View>
          <Button
            label="Aperçu et impression"
            variant="secondary"
            icon="printer"
            block
            disabled={renderInput === null}
            onPress={() => void preview()}
          />
          <View style={{ height: spacing.sm }} />
          <Button
            label="Générer le PDF et le partager"
            icon="share"
            block
            loading={busy}
            disabled={renderInput === null || repositories === null}
            onPress={() => void generatePdf()}
          />
        </View>
      }
    >
      <DetailTitle
        title="Contrat de location"
        subtitle={`${vehicleName(data, vehicle.id)} · ${tenantName(data, tenant.id)}`}
        onBack={() => router.back()}
      />

      {/* ------------------------------------------------------------------ */}
      {/* État du contrat                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Card style={{ marginBottom: spacing.lg }}>
        <View style={styles.statusRow}>
          <Badge {...CONTRACT_STATUS_LABELS[status]} />
          <AppText variant="small" color="textMuted" style={{ marginLeft: spacing.sm }}>
            {reference ?? 'Référence en cours d’attribution…'}
          </AppText>
        </View>
        <View style={{ height: spacing.sm }} />
        <AppText variant="caption" color="textFaint">
          {existing?.signedAt != null
            ? `Signé le ${formatFr(existing.signedAt.slice(0, 10))}. Le contrat se relit désormais depuis les données figées à cette date.`
            : 'Tant que le contrat n’est pas signé, l’aperçu suit les données actuelles : une correction de loyer ou d’adresse s’y reflète immédiatement.'}
        </AppText>
        {existing?.pdfFileId != null ? (
          <>
            <View style={{ height: spacing.sm }} />
            <KeyValue label="PDF archivé" value="Dans le coffre, chiffré sur cet appareil" valueColor="success" />
          </>
        ) : null}
        {referenceError === null ? null : (
          <AppText variant="small" color="danger" style={{ marginTop: spacing.sm }}>
            {referenceError}
          </AppText>
        )}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Ce que le contrat dira                                              */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Ce que le contrat dira" icon="file-check" />
      <Card>
        <KeyValue
          label="Loueur"
          value={ownerLabel === '' ? 'Non renseigné' : ownerLabel}
          valueColor={ownerLabel === '' ? 'danger' : 'text'}
        />
        <KeyValue label="Locataire" value={tenantName(data, tenant.id)} />
        <KeyValue label="Véhicule" value={`${vehicleName(data, vehicle.id)} — ${vehicle.plate}`} />
        <KeyValue label="Période" value={periodLabel} />
        <KeyValue label="Loyer" value={`${formatMoney(rental.rentAmountCents)} ${FREQUENCY_LABELS[rental.frequency].toLowerCase()}`} />
        <KeyValue label="Échéance" value={scheduleLabel(rental)} />
        <KeyValue label="Dépôt de garantie" value={formatMoney(rental.depositCents)} />
        <KeyValue label="Kilométrage autorisé" value={rental.allowedKm === null ? 'Illimité' : formatKm(rental.allowedKm)} />
        <KeyValue label="Dépassement" value={rental.excessKmPriceCents === 0 ? 'Non facturé' : `${formatMoney(rental.excessKmPriceCents)} / km`} />
        <KeyValue label="Kilométrage au départ" value={formatKm(rental.startMileageKm)} />
        {ownerLabel === '' ? (
          <>
            <View style={{ height: spacing.sm }} />
            <AppText variant="small" color="warning">
              Le profil du loueur est vide. Un contrat sans nom ni adresse de loueur ne vaut
              rien : complétez-le dans les réglages avant de le faire signer.
            </AppText>
          </>
        ) : null}
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Clauses                                                             */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader
        title={`Clauses (${selectedClauseIds.size}/${enabledClauses.length})`}
        icon="file-text"
        action={
          <Button
            label="Tout"
            variant="ghost"
            onPress={() => setChosenClauseIds(new Set(enabledClauses.map((clause) => clause.id)))}
          />
        }
      />
      {enabledClauses.length === 0 ? (
        <Card>
          <AppText variant="small" color="warning">
            Aucune clause active. Un contrat sans conditions générales ne protège personne :
            ajoutez-en depuis les réglages.
          </AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {enabledClauses.map((clause) => {
            const unknowns = unknownVariables(clause.body, variables);
            return (
              <View key={clause.id} style={[styles.clauseRow, { borderColor: colors.border }]}>
                <SwitchRow
                  label={clause.title}
                  value={selectedClauseIds.has(clause.id)}
                  onChange={() => toggleClause(clause.id)}
                />
                <AppText variant="caption" color="textMuted" numberOfLines={3}>
                  {clausePreview(clause.body, variables, 180)}
                </AppText>
                {unknowns.length === 0 ? null : (
                  <AppText variant="caption" color="warning" style={{ marginTop: 4 }}>
                    {`Variable${unknowns.length > 1 ? 's' : ''} inconnue${unknowns.length > 1 ? 's' : ''} : ${unknowns.join(', ')}. Le texte sera laissé tel quel dans le contrat.`}
                  </AppText>
                )}
              </View>
            );
          })}
        </Card>
      )}
      {missingClauses.length === 0 ? null : (
        <AppText variant="caption" color="textFaint" style={{ marginTop: spacing.sm }}>
          {`${missingClauses.length} clause${missingClauses.length > 1 ? 's' : ''} contien${missingClauses.length > 1 ? 'nent' : 't'} une variable inconnue. À corriger dans les réglages si c’est une faute de frappe.`}
        </AppText>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Documents justificatifs                                             */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader
        title={`Documents joints (${selectedDocumentIds.size}/${documentEntries.length})`}
        icon="folder"
      />
      {documentEntries.length === 0 ? (
        <Card>
          <AppText variant="small" color="textMuted">
            Aucun document au dossier de ce locataire. Le contrat le mentionnera comme tel —
            ce qui est exact, et ce qui vous protège si le dossier est incomplet.
          </AppText>
        </Card>
      ) : (
        <Card padded={false}>
          {documentEntries.map((entry) => (
            <View key={entry.id} style={[styles.clauseRow, { borderColor: colors.border }]}>
              <SwitchRow
                label={entry.label}
                hint={DOCUMENT_STATUS_LABELS[entry.status].label}
                value={selectedDocumentIds.has(entry.id)}
                onChange={() => toggleDocument(entry.id)}
              />
            </View>
          ))}
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Signatures                                                          */}
      {/* ------------------------------------------------------------------ */}
      <SectionHeader title="Signatures" icon="signature" />
      {existing?.status === 'signe' ? (
        <Card sunken style={{ marginBottom: spacing.lg }}>
          <AppText variant="small" color="textMuted">
            Ce contrat est signé. Les zones ci-dessous sont en lecture seule : une signature
            apposée ne se redessine pas. Pour corriger, archivez ce contrat et en préparez un
            nouveau — l’ancien doit rester tel qu’il a été signé.
          </AppText>
        </Card>
      ) : null}
      <Card>
        <SignaturePad
          label="Le loueur"
          value={ownerSignature}
          onChange={setOwnerSignature}
          height={150}
          readOnly={existing?.status === 'signe'}
        />
        <View style={{ height: spacing.lg }} />
        <SignaturePad
          label="Le locataire — « Lu et approuvé »"
          value={tenantSignature}
          onChange={setTenantSignature}
          height={150}
          readOnly={existing?.status === 'signe'}
        />
        <View style={{ height: spacing.md }} />
        <AppText variant="caption" color="textFaint">
          La signature est enregistrée en tracés, pas en image : elle reste nette à
          l’impression et pèse quelques kilo-octets.
        </AppText>
      </Card>
      {existing?.status === 'signe' ? null : (
        <>
          <View style={{ height: spacing.md }} />
          <Button
            label={bothSigned ? 'Enregistrer les signatures' : 'Enregistrer la signature'}
            variant="secondary"
            icon="signature"
            block
            loading={busy}
            disabled={ownerSignature === null && tenantSignature === null}
            onPress={() => void saveSignatures()}
          />
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Dossier et activation                                               */}
      {/* ------------------------------------------------------------------ */}
      {rental.status === 'prevue' ? (
        <>
          <SectionHeader title="Dossier et activation" icon="check-circle" />
          {eligibility === null || eligibility.satisfied ? (
            <Card>
              <AppText variant="small" color="success">
                {eligibility === null
                  ? 'Aucun document n’est exigé avant d’activer une location.'
                  : 'Tous les documents exigés sont au dossier et en cours de validité.'}
              </AppText>
            </Card>
          ) : (
            <Card sunken style={{ borderColor: colors.warning }}>
              <AppText variant="small" color="warning">
                {eligibility.message ?? 'Le dossier du locataire est incomplet.'}
              </AppText>
              <View style={{ height: spacing.sm }} />
              {eligibility.items.map((item) => (
                <KeyValue
                  key={item.typeId}
                  label={item.label}
                  value={DOCUMENT_STATUS_LABELS[item.status].label}
                  valueColor={item.usable ? 'success' : 'warning'}
                />
              ))}
            </Card>
          )}
          <View style={{ height: spacing.md }} />
          <Card>
            <AppText variant="small" color="textMuted">
              L’activation marque le véhicule « loué » et engendre l’échéancier jusqu’au
              {' '}
              {rental.endDate === null ? `horizon de 12 mois` : formatFr(rental.endDate)}.
              {eligibility !== null && !eligibility.satisfied
                ? ' Le dossier incomplet n’empêche pas d’activer : à vous de décider.'
                : ''}
            </AppText>
            <View style={{ height: spacing.md }} />
            <Button
              label="Activer la location"
              icon="check-circle"
              block
              loading={busy}
              onPress={() => void activateRental()}
            />
          </Card>
        </>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* Messages                                                            */}
      {/* ------------------------------------------------------------------ */}
      {notice === null ? null : (
        <Card sunken style={{ marginTop: spacing.lg }}>
          <AppText variant="small" color="success">
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  clauseRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
