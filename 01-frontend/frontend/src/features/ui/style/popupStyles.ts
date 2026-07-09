import type * as React from 'react';

// Shared dark popup container styles used by ActionMenu and SelectMenu.

export const POPUP_CONTENT_CLASSES =
  'bg-neutral-800 bg-clip-padding text-neutral-white z-50 min-w-[8rem] overflow-hidden rounded-xl border-4 border-white/20 p-1 backdrop-blur-[16px] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95';

export const POPUP_CONTENT_INNER_VIEWPORT_CLASSES = 'flex flex-col p-1';

const POPUP_ITEM_BASE_CLASSES =
  'relative flex w-full cursor-pointer items-center rounded-[4px] px-2 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-300 outline-hidden select-none';

const POPUP_ITEM_DISABLED_CLASSES =
  'data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50';

const POPUP_ITEM_HIGHLIGHT_CLASSES =
  'data-[highlighted]:bg-slate-700 data-[highlighted]:text-neutral-white data-[highlighted]:ring-1 data-[highlighted]:ring-white';

const POPUP_ITEM_CHECKED_CLASSES =
  'data-[state=checked]:bg-slate-500 data-[state=checked]:text-neutral-white data-[highlighted]:data-[state=checked]:ring-1 data-[highlighted]:data-[state=checked]:ring-white/40';

const POPUP_ITEM_SVG_CLASSES =
  '[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4 [&_svg]:text-slate-300 data-[highlighted]:[&_svg]:text-neutral-white data-[state=checked]:[&_svg]:text-neutral-white';

export const POPUP_SELECT_ITEM_CLASSES = [
  POPUP_ITEM_BASE_CLASSES,
  'h-8 min-h-8 justify-between',
  POPUP_ITEM_HIGHLIGHT_CLASSES,
  POPUP_ITEM_CHECKED_CLASSES,
  POPUP_ITEM_DISABLED_CLASSES,
].join(' ');

export const POPUP_MENU_ITEM_CLASSES = [
  POPUP_ITEM_BASE_CLASSES,
  'h-8 gap-2 outline-none',
  POPUP_ITEM_HIGHLIGHT_CLASSES,
  POPUP_ITEM_DISABLED_CLASSES,
  POPUP_ITEM_SVG_CLASSES,
].join(' ');

export const POPUP_MENU_CHECKBOX_ITEM_CLASSES = [
  POPUP_ITEM_BASE_CLASSES,
  'h-8 gap-2 outline-none',
  POPUP_ITEM_HIGHLIGHT_CLASSES,
  POPUP_ITEM_CHECKED_CLASSES,
  POPUP_ITEM_DISABLED_CLASSES,
  POPUP_ITEM_SVG_CLASSES,
].join(' ');

export const POPUP_MENU_CHECKBOX_ITEM_SECONDARY_TEXT_CLASSES =
  'text-neutral-400 group-data-[highlighted]:text-neutral-white group-data-[state=checked]:text-neutral-white';

// The glass effect comes only from the border and blur, not the fill (background stays solid Slate/800 via bg-neutral-800).
// Box shadows:
//   - inset 0 0 0 0.5px: full-perimeter inner border (#FFFFFF99)
//   - 0 4px 16px + 0 2px 4px: two drop shadows (Black/100 = rgba(2,6,23,0.1))
export const POPUP_CONTENT_STYLE: React.CSSProperties = {
  boxShadow:
    'inset 0 0 0 0.5px rgba(255, 255, 255, 0.6), 0px 4px 16px 0px rgba(2, 6, 23, 0.1), 0px 2px 4px 0px rgba(2, 6, 23, 0.1)',
};
