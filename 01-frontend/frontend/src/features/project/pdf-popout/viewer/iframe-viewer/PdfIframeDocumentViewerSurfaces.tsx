import { cn } from '@/features/ui/style/cn';

export const PdfPlaceholder = (props: { children: string }) => (
  <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-border-primary bg-white px-6 text-center text-[12px] leading-[16px] text-slate-500">
    {props.children}
  </div>
);

export const PdfBlankSurface = (props: { flush: boolean }) => (
  <div
    className={cn(
      'h-full min-h-0 min-w-0 bg-white',
      !props.flush && 'rounded-lg border border-border-primary',
    )}
  />
);
