import { cn } from '@/features/ui/style/cn';
import { CircleAlert } from 'lucide-react';

type VersionChangedDocumentsBadgeProps = {
  className?: string;
  label: string;
};

export function VersionChangedDocumentsBadge(
  props: VersionChangedDocumentsBadgeProps,
) {
  const { className, label } = props;

  return (
    <span
      className={cn(
        'inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 rounded bg-[#FFF7ED] py-1 pr-2 pl-[5px] text-[11px] leading-[14px] font-medium tracking-[0.02em] whitespace-nowrap text-[#7C2D12] shadow-[inset_0_0_0_0.5px_#EA580C]',
        className,
      )}
    >
      <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </span>
  );
}
