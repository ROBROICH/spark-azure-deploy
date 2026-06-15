import { cn } from '@/features/ui/style/cn';
import { User } from 'lucide-react';

type CurrentUserAvatarProps = {
  className?: string;
};

export const CurrentUserAvatar = (props: CurrentUserAvatarProps) => {
  const { className } = props;

  return (
    <div
      className={cn(
        'flex items-center justify-center',
        'size-[16px] rounded-full border border-slate-300 bg-slate-100 text-slate-500',
        className,
      )}
    >
      <User className="size-3.5" aria-hidden />
    </div>
  );
};
