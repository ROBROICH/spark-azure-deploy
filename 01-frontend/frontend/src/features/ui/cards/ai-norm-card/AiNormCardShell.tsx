import { cn } from '@/features/ui/style/cn';
import type { ReactNode } from 'react';
import { CARD_CLASSES, CARD_DEFAULT_CLASSES } from '../cardStyles';

export type AiNormCardVariant = 'default' | 'attention' | 'match' | 'success';

// Variant-specific shell styling. `default` reuses the shared card tokens so it
// cannot drift from the other card families; the remaining variants are
// AiNormCard-specific (attention/match/success) and stay local on purpose.
const CARD_VARIANT_CLASSES = {
  default: CARD_DEFAULT_CLASSES,
  attention:
    'border-green-600 bg-white shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1),0px_0px_0px_3px_var(--focus-outline),0px_0px_0px_1px_rgba(255,255,255,1)]',
  match:
    'border-slate-400 bg-[rgba(243,232,255,0.62)] hover:bg-[rgba(233,213,255,0.8)]',
  success:
    'border-green-600 bg-green-50 shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1)]',
} as const satisfies Record<AiNormCardVariant, string>;

const HEADER_VARIANT_CLASSES = {
  default: 'bg-slate-100',
  attention: 'bg-green-50',
  match: 'bg-slate-100',
  success: 'bg-green-100',
} as const satisfies Record<AiNormCardVariant, string>;

const BODY_VARIANT_CLASSES = {
  default: 'px-4 text-brand-950',
  attention: 'px-3 text-green-800',
  match: 'px-4 text-brand-950',
  success: 'px-3 text-green-900',
} as const satisfies Record<AiNormCardVariant, string>;

type AiNormCardShellProps = {
  aiAction: ReactNode;
  body: ReactNode;
  className?: string;
  footer: ReactNode;
  headerIcons?: ReactNode;
  isSelectable?: boolean;
  isSelected?: boolean;
  menu?: ReactNode;
  selectButton?: ReactNode;
  variant?: AiNormCardVariant;
};

/**
 * Presentational shell for the norm card: root frame, header row, body, and
 * footer. Both the interactive `AiNormCard` and its loading skeleton compose
 * this so the skeleton always matches the real card.
 *
 * `selectButton` is rendered as the first child so it can stack as the card's
 * absolutely-positioned overlay; `isSelectable` wires the focus ring.
 */
export function AiNormCardShell(props: AiNormCardShellProps) {
  const {
    aiAction,
    body,
    className,
    footer,
    headerIcons,
    isSelectable = false,
    isSelected = false,
    menu,
    selectButton,
    variant = 'default',
  } = props;

  return (
    <div
      data-slot="ai-norm-card"
      data-variant={variant}
      data-selected={isSelected ? 'true' : undefined}
      className={cn(
        CARD_CLASSES,
        'relative',
        isSelectable && 'cursor-pointer',
        isSelected && 'selected-ring',
        CARD_VARIANT_CLASSES[variant],
        className,
      )}
    >
      {selectButton}
      <div
        data-slot="ai-norm-card-header"
        className={cn(
          'pointer-events-none relative z-20 flex h-8 items-center justify-between gap-2 px-1',
          HEADER_VARIANT_CLASSES[variant],
        )}
      >
        <span
          data-slot="ai-norm-card-ai-action"
          className="pointer-events-auto inline-flex min-w-0 shrink-0 items-center"
        >
          {aiAction}
        </span>
        {headerIcons ? (
          <span
            data-slot="ai-norm-card-header-icons"
            className="pointer-events-auto inline-flex min-w-0 flex-1 items-center gap-1"
          >
            {headerIcons}
          </span>
        ) : null}
        {menu ? (
          <span
            data-slot="ai-norm-card-menu"
            className="pointer-events-auto ml-auto inline-flex shrink-0"
          >
            {menu}
          </span>
        ) : null}
      </div>
      <div
        data-slot="ai-norm-card-body"
        className={cn(
          'flex-1 py-3 text-[13px] leading-[18px] font-medium',
          BODY_VARIANT_CLASSES[variant],
        )}
      >
        {body}
      </div>
      <div
        data-slot="ai-norm-card-footer"
        className="pointer-events-none relative z-20 flex items-center justify-end gap-2 px-1 py-1"
      >
        <span className="pointer-events-auto inline-flex">{footer}</span>
      </div>
    </div>
  );
}
