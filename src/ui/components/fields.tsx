/**
 * Champs de saisie.
 *
 * ## Ce qui compte ici
 *
 * Saisir un loyer, une dépense, un kilométrage : c'est ce que l'utilisateur fait tous les
 * jours, souvent debout, souvent d'une main. Trois conséquences :
 *
 * - **la valeur est validée à la sortie du champ**, et le message dit ce qui ne va pas,
 *   pas seulement que ça ne va pas ;
 * - **un champ qui a une valeur par défaut la montre**, plutôt que de laisser un vide que
 *   l'utilisateur croira obligatoire à remplir ;
 * - **le clavier est le bon** : numérique pour un montant, avec les bons raccourcis pour
 *   une date.
 *
 * ## Le montant reste du texte pendant la saisie
 *
 * Le champ montant garde la chaîne tapée et ne la convertit en centimes qu'à la sortie.
 * Convertir à chaque frappe empêcherait d'écrire « 12,5 » — le « 5 » serait arrondi et
 * réécrit aussitôt. C'est la cause classique du « je tape 0,05 et j'obtiens 5 ».
 */

import { useState, type ReactElement, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { MIN_TOUCH, radius, spacing } from '../theme';
import { useTheme } from '../use-theme';
import { Icon } from './icons';
import { AppText } from './text';
import { addDays, addMonths, formatFr, parseDateInput, todayIso } from '@/domain/dates';
import { formatMoney, parseMoneyToCents } from '@/domain/money';
import type { Cents, IsoDate } from '@/domain/types';

export interface FieldProps {
  label: string;
  hint?: string;
  /** Message d'erreur. Sa présence met le champ en rouge. */
  error?: string | null;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, hint, error, required = false, children }: FieldProps): ReactElement {
  const { colors } = useTheme();
  const invalid = error !== undefined && error !== null && error !== '';

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View style={styles.labelRow}>
        <AppText variant="label" color="textMuted">
          {label}
        </AppText>
        {required ? (
          <AppText variant="label" color="textFaint" style={{ marginLeft: 4 }}>
            obligatoire
          </AppText>
        ) : null}
      </View>
      {children}
      {invalid ? (
        <View style={styles.messageRow}>
          <Icon name="alert-circle" size={13} color={colors.danger} strokeWidth={2} />
          <AppText variant="caption" color="danger" style={{ marginLeft: 4, flex: 1 }}>
            {error}
          </AppText>
        </View>
      ) : hint === undefined ? null : (
        <AppText variant="caption" color="textFaint" style={{ marginTop: 4 }}>
          {hint}
        </AppText>
      )}
    </View>
  );
}

interface InputFrameProps {
  invalid: boolean;
  focused: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function InputFrame({ invalid, focused, children, style }: InputFrameProps): ReactElement {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.input,
        {
          backgroundColor: colors.surface,
          borderColor: invalid ? colors.danger : focused ? colors.primary : colors.border,
          borderWidth: focused || invalid ? 1.5 : StyleSheet.hairlineWidth,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  keyboard?: KeyboardTypeOptions;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  suffix?: string;
  /** Icône à droite du champ — un bouton d'effacement, par exemple. */
  right?: ReactNode;
  /**
   * Masque la saisie.
   *
   * Nécessaire pour le mot de passe de sauvegarde : sans masquage, il reste lisible par
   * qui regarde l'écran par-dessus l'épaule, et le clavier du système peut l'apprendre et
   * le proposer ensuite. Le code de verrouillage, lui, n'en a pas besoin — il se saisit sur
   * un pavé maison qui n'affiche que des points.
   */
  secure?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required = false,
  keyboard = 'default',
  multiline = false,
  autoCapitalize = 'sentences',
  suffix,
  right,
  secure = false,
}: TextFieldProps): ReactElement {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Field label={label} hint={hint} error={error} required={required}>
      <InputFrame invalid={error !== undefined && error !== null} focused={focused}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboard}
          multiline={multiline}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          secureTextEntry={secure}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.textInput,
            { color: colors.text },
            multiline ? { minHeight: 80, textAlignVertical: 'top', paddingTop: spacing.md } : null,
          ]}
        />
        {suffix === undefined ? null : (
          <AppText variant="body" color="textMuted" style={{ paddingRight: spacing.md }}>
            {suffix}
          </AppText>
        )}
        {right}
      </InputFrame>
    </Field>
  );
}

export interface MoneyFieldProps {
  label: string;
  /** Montant en centimes. `null` pour un champ vide. */
  cents: Cents | null;
  onCents: (cents: Cents | null) => void;
  hint?: string;
  error?: string | null;
  required?: boolean;
}

/**
 * Champ de montant.
 *
 * La chaîne tapée est conservée telle quelle dans l'état local ; les centimes ne sont
 * calculés qu'à la sortie du champ. C'est ce qui permet d'écrire « 12,5 » sans que le
 * champ réécrive « 12,50 » sous les doigts.
 */
export function MoneyField({
  label,
  cents,
  onCents,
  hint,
  error,
  required = false,
}: MoneyFieldProps): ReactElement {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayed = draft ?? (cents === null ? '' : formatMoney(cents, { currency: '' }).trim());
  const shownError = error ?? localError;

  function commit(): void {
    setFocused(false);
    if (draft === null) return;

    if (draft.trim() === '') {
      setDraft(null);
      setLocalError(null);
      onCents(null);
      return;
    }

    const parsed = parseMoneyToCents(draft);
    if (parsed === null) {
      setLocalError('Montant illisible. Écrivez par exemple 300 ou 300,50.');
      return;
    }
    setLocalError(null);
    setDraft(null);
    onCents(parsed);
  }

  return (
    <Field label={label} hint={hint} error={shownError} required={required}>
      <InputFrame invalid={shownError !== null} focused={focused}>
        <TextInput
          value={displayed}
          onChangeText={(text) => {
            setDraft(text);
            setLocalError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textFaint}
          style={[styles.textInput, { color: colors.text }]}
        />
        <AppText variant="body" color="textMuted" style={{ paddingRight: spacing.md }}>
          €
        </AppText>
      </InputFrame>
    </Field>
  );
}

export interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  hint?: string;
  error?: string | null;
  required?: boolean;
  suffix?: string;
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  error,
  required = false,
  suffix,
}: NumberFieldProps): ReactElement {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayed = draft ?? (value === null ? '' : String(value));
  const shownError = error ?? localError;

  function commit(): void {
    setFocused(false);
    if (draft === null) return;
    if (draft.trim() === '') {
      setDraft(null);
      setLocalError(null);
      onChange(null);
      return;
    }
    const parsed = Number(draft.replace(/[\s\u00A0\u202F]/g, '').replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      setLocalError('Nombre illisible.');
      return;
    }
    setLocalError(null);
    setDraft(null);
    onChange(Math.round(parsed));
  }

  return (
    <Field label={label} hint={hint} error={shownError} required={required}>
      <InputFrame invalid={shownError !== null} focused={focused}>
        <TextInput
          value={displayed}
          onChangeText={(text) => {
            setDraft(text);
            setLocalError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={colors.textFaint}
          style={[styles.textInput, { color: colors.text }]}
        />
        {suffix === undefined ? null : (
          <AppText variant="body" color="textMuted" style={{ paddingRight: spacing.md }}>
            {suffix}
          </AppText>
        )}
      </InputFrame>
    </Field>
  );
}

export interface DateFieldProps {
  label: string;
  value: IsoDate | null;
  onChange: (value: IsoDate | null) => void;
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** Raccourcis proposés sous le champ. */
  quick?: boolean;
}

/**
 * Champ de date.
 *
 * Une saisie au clavier, dans les trois écritures courantes, et des raccourcis qui
 * couvrent la quasi-totalité des besoins réels : aujourd'hui, hier, dans une semaine, dans
 * un mois. Un sélecteur natif serait plus joli ; ces raccourcis sont plus rapides, et ils
 * fonctionnent sans dépendance supplémentaire.
 */
export function DateField({
  label,
  value,
  onChange,
  hint,
  error,
  required = false,
  quick = true,
}: DateFieldProps): ReactElement {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayed = draft ?? (value === null ? '' : formatFr(value));
  const shownError = error ?? localError;
  const today = todayIso();

  function commit(): void {
    setFocused(false);
    if (draft === null) return;
    if (draft.trim() === '') {
      setDraft(null);
      setLocalError(null);
      onChange(null);
      return;
    }
    const parsed = parseDateInput(draft);
    if (parsed === null) {
      setLocalError('Date illisible. Écrivez par exemple 28/09/2026.');
      return;
    }
    setLocalError(null);
    setDraft(null);
    onChange(parsed);
  }

  const shortcuts: { label: string; date: IsoDate }[] = [
    { label: "Aujourd'hui", date: today },
    { label: 'Demain', date: addDays(today, 1) },
    { label: '+ 1 semaine', date: addDays(today, 7) },
    { label: '+ 1 mois', date: addMonths(today, 1) },
  ];

  return (
    <Field label={label} hint={hint} error={shownError} required={required}>
      <InputFrame invalid={shownError !== null} focused={focused}>
        <TextInput
          value={displayed}
          onChangeText={(text) => {
            setDraft(text);
            setLocalError(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="numbers-and-punctuation"
          placeholder="JJ/MM/AAAA"
          placeholderTextColor={colors.textFaint}
          style={[styles.textInput, { color: colors.text }]}
        />
        {value === null ? null : (
          <Pressable
            onPress={() => {
              setDraft(null);
              setLocalError(null);
              onChange(null);
            }}
            hitSlop={10}
            style={{ paddingRight: spacing.md }}
          >
            <Icon name="x-circle" size={18} color={colors.textFaint} strokeWidth={2} />
          </Pressable>
        )}
      </InputFrame>
      {quick ? (
        <View style={styles.quickRow}>
          {shortcuts.map((shortcut) => (
            <Pressable
              key={shortcut.label}
              onPress={() => {
                setDraft(null);
                setLocalError(null);
                onChange(shortcut.date);
              }}
              style={[styles.quick, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            >
              <AppText variant="caption" color="textMuted">
                {shortcut.label}
              </AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Field>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export interface SelectFieldProps<T extends string> {
  label: string;
  value: T | null;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** Afficher les options en grille plutôt qu'en liste déroulante. */
  grid?: boolean;
}

/**
 * Choix dans une liste.
 *
 * Les options sont affichées en pastilles plutôt que dans un menu déroulant : il y a peu
 * d'options, elles tiennent à l'écran, et un menu ajoute deux gestes pour un choix
 * fréquent.
 */
export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
  error,
  required = false,
  grid = false,
}: SelectFieldProps<T>): ReactElement {
  const { colors } = useTheme();

  return (
    <Field label={label} hint={hint} error={error} required={required}>
      <View style={grid ? styles.grid : styles.stack}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                grid ? styles.gridOption : styles.option,
                {
                  backgroundColor: selected ? colors.primarySoft : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                },
                pressed ? { opacity: 0.7 } : null,
              ]}
            >
              <AppText
                variant="small"
                style={{
                  color: selected ? colors.primary : colors.text,
                  fontWeight: selected ? '600' : '400',
                }}
              >
                {option.label}
              </AppText>
              {option.hint === undefined ? null : (
                <AppText variant="caption" color="textFaint">
                  {option.hint}
                </AppText>
              )}
            </Pressable>
          );
        })}
      </View>
    </Field>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}): ReactElement {
  const { colors } = useTheme();
  return (
    <View style={styles.switchRow}>
      <View style={{ flex: 1, marginRight: spacing.md }}>
        <AppText variant="body">{label}</AppText>
        {hint === undefined ? null : (
          <AppText variant="caption" color="textMuted" style={{ marginTop: 2 }}>
            {hint}
          </AppText>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceSunken, true: colors.primary }}
      />
    </View>
  );
}

/** Champ de recherche, avec effacement. */
export function SearchField({
  value,
  onChange,
  placeholder = 'Rechercher',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}): ReactElement {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.input,
        {
          backgroundColor: colors.surfaceAlt,
          borderColor: focused ? colors.primary : colors.border,
          borderWidth: focused ? 1.5 : StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={{ paddingLeft: spacing.md, paddingRight: spacing.sm }}>
        <Icon name="search" size={18} color={colors.textFaint} strokeWidth={2} />
      </View>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.textInput, { color: colors.text }]}
      />
      {value === '' ? null : (
        <Pressable onPress={() => onChange('')} hitSlop={10} style={{ paddingRight: spacing.md }}>
          <Icon name="x-circle" size={17} color={colors.textFaint} strokeWidth={2} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  labelRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 6 },
  messageRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    minHeight: MIN_TOUCH + 4,
    overflow: 'hidden',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  quick: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: spacing.sm,
    marginBottom: spacing.xs,
  },
  stack: {},
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  option: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  gridOption: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    minHeight: MIN_TOUCH + 8,
  },
});
