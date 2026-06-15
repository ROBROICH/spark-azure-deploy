/**
 * Shared checkbox className for the RechtsgrundlageDialog.
 *
 * Uses raw Radix Checkbox because the shared Checkbox component at
 * `ui/Checkbox/Checkbox.tsx` is uncontrolled (defaultChecked) and wraps
 * in a Label, which does not fit the controlled, label-free layout here.
 */
export const CHECKBOX_CLASS_NAME =
  'focus-ring flex size-6 shrink-0 items-center justify-center rounded-[5px] border-2 border-neutral-600 bg-white text-white transition-shadow data-[state=checked]:border-brand-950 data-[state=checked]:bg-brand-950 data-[state=indeterminate]:border-brand-950 data-[state=indeterminate]:bg-brand-950';
