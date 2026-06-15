import { cn } from '@/features/ui/style/cn';

type StatusBadgeProps = {
  badge: {
    label: string;
    variant: 'neutral' | 'success';
  };
};

export function StatusBadge(props: StatusBadgeProps) {
  const { badge } = props;

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-[11px] leading-[14px] font-medium whitespace-nowrap',
        badge.variant === 'success'
          ? 'border-green-600 bg-white text-green-700'
          : 'border-slate-300 bg-white text-slate-600',
      )}
    >
      {badge.label}
    </span>
  );
}
