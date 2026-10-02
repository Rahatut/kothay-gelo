import React from 'react';
import { Plus } from 'lucide-react';

/**
 * The single "record a transaction" affordance.
 *
 * There was one copy per surface and they had already drifted: the collapsed
 * button inside `ManualEntryView` used full `btn-outline` while both desk headers
 * used `btn-outline btn-sm`. One component with one class string removes the
 * possibility of the next copy being different again.
 *
 * Design decisions, taken from `DESIGN.md` rather than invented:
 *
 *   - **Secondary weight, never `btn-primary`.** Spec 003 FR-012 requires manual
 *     entry not to be a required step in the upload-to-clue path, so the ink pill
 *     belongs to "Upload a statement". Two equal-weight CTAs in one header would
 *     also break the one-primary-CTA rule the nav uses.
 *   - **Not in the navbar.** The nav already carries 8 tabs plus an "Add statement"
 *     pill, and its label is hidden below 1280px — exactly at the 375px width the
 *     product must work at. It would also have to appear on the landing page, where
 *     there is no session and no ledger to add to.
 *   - **Not on the settings desk.** A write action one click from "Permanently
 *     purge all data" is a footgun, not a convenience.
 *   - **In empty states at full size.** When there is nothing on screen, this is the
 *     main action available, so it gets the 40px target rather than the 32px one.
 *
 * Accessibility: the label is always visible text, so no `aria-label` while it is
 * shown; the icon is `aria-hidden` and redundant with the label, which is what makes
 * the control distinguishable without relying on colour. `:focus-visible` is already
 * defined in `src/index.css` for every button, so nothing extra is needed — and
 * `.text-input:focus` is deliberately not copied here, since it sets `outline: none`.
 */

/** Visible text for the trigger. Kept next to the class so they cannot drift. */
const LABEL = {
  en: 'Record a transaction',
  bn: 'লেনদেন লিখুন',
} as const;

/**
 * Whether a string contains a Bengali digit, so the label can be set in
 * Noto Sans Bengali rather than falling back to Inter's Latin glyphs.
 *
 * The same idiom is already used at `TransactionsView.tsx:224`. Applied per-string
 * rather than per-locale so a mixed locale still renders correctly.
 */
function hasBengali(text: string): boolean {
  return /[ঀ-৿]/.test(text);
}

export interface ManualEntryTriggerProps {
  locale: 'en' | 'bn';
  onClick: () => void;
  /**
   * `sm` is for desk headers, where the primary action already holds the weight.
   * `md` is for empty states, where this is the only action on screen.
   */
  size?: 'sm' | 'md';
  /** Extra classes merged onto the button, for placement in an action group. */
  className?: string;
  /**
   * Set when the trigger toggles the form it sits above, so the control reports its
   * own expanded state. Omitted entirely when undefined, rather than emitted as
   * `aria-expanded="false"`, because the header and empty-state copies are plain
   * buttons that expand nothing.
   */
  'aria-expanded'?: boolean;
}

export const ManualEntryTrigger: React.FC<ManualEntryTriggerProps> = ({
  locale,
  onClick,
  size = 'sm',
  className,
  'aria-expanded': ariaExpanded,
}) => {
  const label = LABEL[locale];

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      className={
        className ?? (size === 'md' ? 'btn-outline shrink-0' : 'btn-outline btn-sm shrink-0')
      }
    >
      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
      <span className={hasBengali(label) ? 'font-bangla tracking-normal' : undefined}>
        {label}
      </span>
    </button>
  );
};
