import { cn } from '@/features/ui/style/cn';
import type { ComponentProps } from 'react';

/*
 * Shared action controls for the FVP result cards.
 *
 * These intentionally diverge from the design-system `Button` variants: the
 * result cards use a slate palette, a card-specific layered shadow, and `text-xs`
 * sizing that the DS `sm` button does not provide. Centralizing the styles in
 * one feature-local owner keeps that intentional divergence in a single place
 * instead of being copy-pasted across the three result cards.
 *
 * The outlined and icon styles are exported as class constants because their
 * other consumer is a typed TanStack `<Link>`; wrapping that link in a generic
 * component would drop its route-param type inference.
 */

const GHOST_ACTION_CLASS =
  'inline-flex h-8 items-center rounded-md px-2 text-xs leading-4 font-medium tracking-[0.02em] text-slate-600 hover:bg-slate-100 focus-ring';

/** Outlined card action shared by the request-all button and the view link. */
export const resultCardOutlinedActionClass =
  'inline-flex h-8 items-center rounded-lg border-[0.5px] border-slate-400 bg-neutral-white px-3 text-xs leading-4 font-medium tracking-[0.02em] text-slate-600 shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1),inset_0px_-4px_8px_0px_rgba(2,6,23,0.05)] hover:bg-slate-50 focus-ring disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-neutral-white';

/** Icon-only card action (e.g. the edit-required-documents pencil). */
export const resultCardIconActionClass =
  'inline-flex size-8 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-ring';

/** Ghost-style card action button used for the show more / show less toggle. */
export const ResultCardShowMoreButton = (props: ComponentProps<'button'>) => {
  const { className, type = 'button', ...rest } = props;
  return (
    <button
      type={type}
      className={cn(GHOST_ACTION_CLASS, className)}
      {...rest}
    />
  );
};

/** Outlined card action button used for the request-all action. */
export const ResultCardRequestAllButton = (props: ComponentProps<'button'>) => {
  const { className, type = 'button', ...rest } = props;
  return (
    <button
      type={type}
      className={cn(resultCardOutlinedActionClass, className)}
      {...rest}
    />
  );
};
