import React, { useState } from 'react';
import { AlertCircle, Check, Info } from 'lucide-react';
import type { DuplicateFlag } from '../types';

/**
 * Manual transaction entry (spec 003).
 *
 * Reached from the review desk in one action and from the ledger in one, which is
 * the "at most two actions" bound in FR-016.
 *
 * Design rules the spec fixes, and which this form is built around:
 *
 *   - The user is never asked to categorise (FR-013). The category is proposed from
 *     the merchant text and shown as a result, not presented as a question. A
 *     merchant the system does not recognise stays uncategorised rather than being
 *     forced into a bucket (FR-003).
 *   - A figure already in the ledger is not shown to this form. It is computed by the
 *     engine from the response and displayed as a consequence of entry.
 *   - Bangla numerals are accepted (FR-008). The server normalises them; this form
 *     does not reformat what the user is typing mid-edit.
 *   - Validation errors are per field and arrive with a Bengali string (FR-022), so
 *     the message lands on the box it belongs to.
 */

export interface ManualEntryErrors {
  field: string;
  code: string;
  reason: string;
  reason_bn: string;
}

export interface ManualEntryWarning {
  field: string;
  code: string;
  reason: string;
  reason_bn: string;
}

export interface CreatedTransaction {
  id: string;
  amount: number;
  currency: 'BDT';
  direction: 'EXPENSE' | 'INCOME';
  category_id: string;
  category_source: string;
  status: string;
}

interface ManualEntryViewProps {
  locale: 'en' | 'bn';
  onSubmit: (input: {
    transaction_date: string;
    amount: string;
    direction: string;
    description: string;
    /** Omitted entirely when blank, so an empty counterparty stays optional. */
    merchant_name?: string;
  }) => Promise<{ created: CreatedTransaction; duplicate: DuplicateFlag | null; warnings: ManualEntryWarning[] }>;
  onDone: (created: CreatedTransaction) => void;
  /**
   * Closes the band.
   *
   * Separate from `onDone` on purpose. `onDone` fires on a successful write and must
   * not tear the surface down, because the confirmation panel is how the user learns
   * what was recorded and whether it looked like a duplicate.
   */
  onDismiss?: () => void;
}

const COPY = {
  en: {
    title: 'Record a transaction',
    subtitle: 'For something the statement did not show. Nothing here is required except the figure itself.',
    date: 'Date',
    amount: 'Amount',
    direction: 'Direction',
    spent: 'Money out',
    received: 'Money in',
    merchant: 'Counterparty',
    description: 'What it was for',
    save: 'Record it',
    saving: 'Recording',
    saved: 'Recorded.',
    cancel: 'Cancel',
    optional: 'optional',
    duplicate: 'You may already have this one.',
    uncategorised: 'No category matched, so it stays uncategorised.',
    categorised: 'Filed under',
  },
  bn: {
    title: 'একটি লেনদেন লিখে রাখুন',
    subtitle: 'যা বিবরণীতে ছিল না। শুধু পরিমাণটি ছাড়া বাকি সব ঐচ্ছিক।',
    date: 'তারিখ',
    amount: 'পরিমাণ',
    direction: 'ধরন',
    spent: 'টাকা বেরিয়েছে',
    received: 'টাকা এসেছে',
    merchant: 'প্রতিপক্ষ',
    description: 'কী জন্য ছিল',
    save: 'লিখে রাখুন',
    saving: 'লেখা হচ্ছে',
    saved: 'লিখে রাখা হয়েছে।',
    cancel: 'বাতিল',
    optional: 'ঐচ্ছিক',
    duplicate: 'এটি আগেও থাকতে পারে।',
    uncategorised: 'কোনো ভাগ মিলেনি, তাই ভাগ ছাড়াই থাকবে।',
    categorised: 'যে ভাগে রাখা হলো',
  },
};

export const ManualEntryView: React.FC<ManualEntryViewProps> = ({
  locale,
  onSubmit,
  onDone,
  onDismiss,
}) => {
  const t = COPY[locale];

  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [merchant, setMerchant] = useState('');
  const [description, setDescription] = useState('');

  const [errors, setErrors] = useState<ManualEntryErrors[]>([]);
  const [warnings, setWarnings] = useState<ManualEntryWarning[]>([]);
  const [duplicate, setDuplicate] = useState<DuplicateFlag | null>(null);
  const [saved, setSaved] = useState<CreatedTransaction | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Clears only the outcome of the last attempt.
   *
   * Dismissal keeps what was typed. Nothing is written until submit, so retaining
   * the fields costs nothing, and a user who opened the form by accident does not
   * retype their entry.
   */
  const resetResult = () => {
    setErrors([]);
    setWarnings([]);
    setDuplicate(null);
    setSaved(null);
  };

  /**
   * Clears the fields as well.
   *
   * Called only after a successful write. Without it the form closed on success
   * and the *next* open arrived pre-filled with the previous transaction's date,
   * amount, and merchant — which is the same fabrication class as a prefilled goal
   * target: the form asserted a figure the user had not chosen.
   */
  const resetAll = () => {
    resetResult();
    setDate('');
    setAmount('');
    setDirection('EXPENSE');
    setMerchant('');
    setDescription('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setErrors([]);
    setWarnings([]);
    setDuplicate(null);
    setSaved(null);

    try {
      const result = await onSubmit({
        transaction_date: date,
        amount,
        direction,
        description,
        // Sent only when filled. An empty string is not the same as an absent field
        // to the validator: it treats a supplied-but-blank merchant as an error, so
        // always sending '' made an optional field fail every submission.
        ...(merchant.trim() === '' ? {} : { merchant_name: merchant }),
      });

      // The result state is set and then deliberately left alone: the panel below
      // reports what happened -- the amount recorded, the category it landed in, and
      // whether it looks like a duplicate. A previous version called `resetAll()`
      // here, which cleared the very state it had just set, so the panel never
      // rendered and FR-009's duplicate flag was invisible.
      setErrors([]);
      setWarnings(result.warnings ?? []);
      setDuplicate(result.duplicate ?? null);
      setSaved(result.created);

      // Fields cleared, now that the row exists, so the next entry is not pre-filled
      // with this one's date and amount.
      setDate('');
      setAmount('');
      setDirection('EXPENSE');
      setMerchant('');
      setDescription('');
      onDone(result.created);
    } catch (err) {
      // The server returns field-scoped errors. Anything else is a transport or
      // unexpected failure, which gets one general message rather than nothing. The
      // form stays open in both cases, and the typed values are untouched, so the
      // user corrects one field rather than re-entering the transaction.
      const payload = err as { errors?: ManualEntryErrors[]; message?: string };
      if (payload?.errors?.length) {
        setErrors(payload.errors);
      } else {
        setErrors([
          {
            field: 'amount',
            code: 'UNKNOWN',
            reason: payload?.message ?? 'That could not be recorded. Try again.',
            reason_bn: 'এটি লেখা যায়নি। আবার চেষ্টা করুন।',
          },
        ]);
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Always rendered. `App` mounts this band only once a trigger has opened it, so
          a collapsed state here is unreachable — and a previous version gated the
          form on an `isOpen` flag that nothing ever set to true, which made the
          feature render an empty box on every click. */}
      <ManualEntryForm
          t={t}
          date={date}
          setDate={setDate}
          amount={amount}
          setAmount={setAmount}
          direction={direction}
          setDirection={setDirection}
          merchant={merchant}
          setMerchant={setMerchant}
          description={description}
          setDescription={setDescription}
          errors={errors}
          isSaving={isSaving}
          onSubmit={submit}
        onCancel={() => {
          resetAll();
          onDismiss?.();
        }}
      />

      {/*
        Results. Each states what happened, and none of them is a success message
        standing in for a check that did not happen: a duplicate was recorded and
        flagged, not blocked, and an uncategorised row says so rather than implying
        the system filed it somewhere.
      */}
      {saved && (
        <div role="status" className="feature-card p-4">
          <p className="type-body-sm text-ink flex items-start gap-2">
            <Check className="w-4 h-4 text-success shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              {t.saved}{' '}
              <span className="font-figure">
                ৳{saved.amount.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-US')}
              </span>
            </span>
          </p>

          <p className="type-caption text-muted mt-2">
            {saved.category_source === 'UNCATEGORIZED'
              ? t.uncategorised
              : `${t.categorised} ${saved.category_id}`}
          </p>

          {duplicate && (
            <p className="type-caption text-body mt-2 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {t.duplicate}
                {duplicate.tier && (
                  <>
                    {' '}
                    <span className="font-figure">{duplicate.tier}</span>
                  </>
                )}
                {duplicate.matched_fields?.length ? (
                  <>
                    {' · '}
                    <span className="font-figure">
                      {duplicate.matched_fields.join(', ')}
                    </span>
                  </>
                ) : null}
              </span>
            </p>
          )}

          {warnings.map((w) => (
            <p key={w.code} className="type-caption text-body mt-2 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{locale === 'bn' ? w.reason_bn : w.reason}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * The entry form itself, exported so both states can be rendered.
 *
 * Split out from the wrapper so both the band and the form are directly renderable.
 * The wrapper was gated on an `isOpen` flag nothing set, which made the whole
 * feature render an empty box; a component that cannot be rendered in isolation is
 * a component whose state nobody can check.
 */
export interface ManualEntryFormProps {
  t: typeof COPY.en;
  date: string;
  setDate: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  direction: 'EXPENSE' | 'INCOME';
  setDirection: (v: 'EXPENSE' | 'INCOME') => void;
  merchant: string;
  setMerchant: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  errors: ManualEntryErrors[];
  isSaving: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onCancel: () => void;
}

export const ManualEntryForm: React.FC<ManualEntryFormProps> = ({
  t,
  date,
  setDate,
  amount,
  setAmount,
  direction,
  setDirection,
  merchant,
  setMerchant,
  description,
  setDescription,
  errors,
  isSaving,
  onSubmit,
  onCancel,
}) => {
  const errorFor = (field: string) => errors.find((e) => e.field === field);
  const inputClass = (field: string) => `text-input ${errorFor(field) ? 'border-error' : ''}`;

  return (
    <form onSubmit={onSubmit} className="feature-card p-6 sm:p-7" noValidate>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 className="type-title-md text-ink">{t.title}</h2>
          <p className="type-caption text-muted mt-1 max-w-lg">{t.subtitle}</p>
        </div>
        <button type="button" onClick={onCancel} className="btn-text shrink-0">
          {t.cancel}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="manual-date" className="type-caption text-body block mb-1">
            {t.date}
          </label>
          <input
            id="manual-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass('transaction_date')}
            aria-invalid={Boolean(errorFor('transaction_date'))}
            aria-describedby={errorFor('transaction_date') ? 'manual-date-error' : undefined}
            required
          />
          {errorFor('transaction_date') && (
            <p id="manual-date-error" role="alert" className="type-caption text-error mt-1">
              {errorFor('transaction_date')!.reason}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="manual-amount" className="type-caption text-body block mb-1">
            {t.amount}
          </label>
          {/* type=text, not number: a numeric input discards Bangla numerals on some
              platforms, and FR-008 requires them to be accepted. */}
          <input
            id="manual-amount"
            type="text"
            inputMode="decimal"
            dir="ltr"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="৳ ১,২৫০.৫০"
            className={`${inputClass('amount')} font-figure`}
            aria-invalid={Boolean(errorFor('amount'))}
            aria-describedby={errorFor('amount') ? 'manual-amount-error' : undefined}
            required
          />
          {errorFor('amount') && (
            <p id="manual-amount-error" role="alert" className="type-caption text-error mt-1">
              {errorFor('amount')!.reason}
            </p>
          )}
        </div>
      </div>

      <fieldset className="mt-4">
        <legend className="type-caption text-body mb-2">{t.direction}</legend>
        <div className="flex gap-3">
          {(['EXPENSE', 'INCOME'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 type-body-sm text-body cursor-pointer">
              <input
                type="radio"
                name="manual-direction"
                value={value}
                checked={direction === value}
                onChange={() => setDirection(value)}
                // Without this the radio renders in the UA default blue, which is not
                // in the token layer and reads as a different product on the warm canvas.
                className="accent-ink"
              />
              {value === 'EXPENSE' ? t.spent : t.received}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 mt-4">
        <div>
          <label htmlFor="manual-merchant" className="type-caption text-body block mb-1">
            {t.merchant} <span className="text-muted">({t.optional})</span>
          </label>
          <input
            id="manual-merchant"
            type="text"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className={inputClass('merchant_name')}
            aria-invalid={Boolean(errorFor('merchant_name'))}
            aria-describedby={errorFor('merchant_name') ? 'manual-merchant-error' : undefined}
          />
          {errorFor('merchant_name') && (
            <p id="manual-merchant-error" role="alert" className="type-caption text-error mt-1">
              {errorFor('merchant_name')!.reason}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="manual-description" className="type-caption text-body block mb-1">
            {t.description}
            {/* Required, not optional. The server rejects a blank description, so
                labelling it optional invited a submission that could only fail — and
                the failure had no visible message. */}
            <span className="text-error ml-1">*</span>
          </label>
          <input
            id="manual-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputClass('description')}
            aria-invalid={Boolean(errorFor('description'))}
            aria-describedby={errorFor('description') ? 'manual-description-error' : undefined}
            required
          />
          {errorFor('description') && (
            <p id="manual-description-error" role="alert" className="type-caption text-error mt-1">
              {errorFor('description')!.reason}
            </p>
          )}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="submit" disabled={isSaving} className="btn-primary">
          {isSaving ? t.saving : t.save}
        </button>
        <button type="button" onClick={onCancel} className="btn-text">
          {t.cancel}
        </button>
      </div>
    </form>
  );
};
