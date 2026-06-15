// Shared layout tokens for the domain card families in this folder.
// ArgumentCard consumes the full set; AiNormCard reuses CARD_CLASSES and
// CARD_DEFAULT_CLASSES for its frame so the families cannot drift. The card
// types serve different domain concepts but must stay visually aligned per the
// design system, so the styling tokens live here.

export const CARD_CLASSES =
  'group flex flex-col overflow-hidden rounded-lg border-[0.5px]';

export const CARD_DEFAULT_CLASSES = 'border-slate-400 bg-white';

export const CARD_SUCCESS_CLASSES =
  'data-[variant=success]:border-green-600 data-[variant=success]:bg-green-50 data-[variant=success]:shadow-[0px_4px_16px_rgba(2,6,23,0.1),0px_2px_4px_rgba(2,6,23,0.1),inset_0px_-4px_8px_rgba(2,6,23,0.05)]';

export const HEADER_CLASSES =
  'flex h-8 min-w-0 items-center gap-2 bg-slate-100 px-1';

export const HEADER_SUCCESS_CLASSES =
  'group-data-[variant=success]:bg-green-100';

export const HEADING_CLASSES =
  'text-[11px] leading-[1.09] tracking-[0.02em] font-medium';

export const BODY_CLASSES = 'text-[13px] leading-[1.38] tracking-[-0.01em]';

export const BODY_TEXT_COLOR = 'text-brand-950';

export const BODY_SUCCESS_TEXT_CLASSES =
  'group-data-[variant=success]:text-green-900';

export const FOOTER_CLASSES =
  'text-[11px] leading-[1.27] tracking-[0.02em] font-medium';

export const MENU_CLASSES = 'ml-auto shrink-0';

export const TITLE_TRUNCATE_CLASSES = 'block min-w-0 flex-1 truncate';
