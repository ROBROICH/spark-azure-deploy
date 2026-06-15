import { cn } from '@/features/ui/style/cn';

type ProjectIndicatorProps = {
  avatarLabel: string;
  title: string;
  subtitle: string;
  className?: string;
};

export function ProjectIndicator(props: ProjectIndicatorProps) {
  const { avatarLabel, title, subtitle, className } = props;

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-300 p-1 text-[11px] leading-[14px] font-medium tracking-[0.22px] text-brand-950">
        {avatarLabel}
      </span>

      <div className="w-32 min-w-0">
        <p className="truncate text-[11px] leading-[14px] font-medium tracking-[0.22px] text-brand-950">
          {title}
        </p>
        <p className="truncate text-[11px] leading-[14px] font-medium tracking-[0.22px] text-neutral-600">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
