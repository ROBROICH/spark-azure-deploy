import { cn } from '@/features/ui/style/cn';
import { invariant } from 'es-toolkit/util';

type UserAvatarColor = {
  backgroundClassName: string;
  borderClassName: string;
  textClassName: string;
};

type UserAvatarProps = {
  name: string;
  email: string;
  className?: string;
};

const USER_AVATAR_COLOR_PALETTE: UserAvatarColor[] = [
  {
    backgroundClassName: 'bg-primary-50',
    borderClassName: 'border-primary-200',
    textClassName: 'text-primary-900',
  },
  {
    backgroundClassName: 'bg-sky-50',
    borderClassName: 'border-sky-200',
    textClassName: 'text-sky-900',
  },
  {
    backgroundClassName: 'bg-cyan-50',
    borderClassName: 'border-cyan-200',
    textClassName: 'text-cyan-900',
  },
  {
    backgroundClassName: 'bg-teal-50',
    borderClassName: 'border-teal-200',
    textClassName: 'text-teal-900',
  },
  {
    backgroundClassName: 'bg-success-50',
    borderClassName: 'border-success-200',
    textClassName: 'text-success-800',
  },
  {
    backgroundClassName: 'bg-lime-50',
    borderClassName: 'border-lime-200',
    textClassName: 'text-lime-900',
  },
  {
    backgroundClassName: 'bg-warning-50',
    borderClassName: 'border-warning-200',
    textClassName: 'text-warning-900',
  },
  {
    backgroundClassName: 'bg-amber-50',
    borderClassName: 'border-amber-200',
    textClassName: 'text-amber-900',
  },
  {
    backgroundClassName: 'bg-orange-50',
    borderClassName: 'border-orange-200',
    textClassName: 'text-orange-900',
  },
  {
    backgroundClassName: 'bg-error-50',
    borderClassName: 'border-error-200',
    textClassName: 'text-error-800',
  },
  {
    backgroundClassName: 'bg-rose-50',
    borderClassName: 'border-rose-200',
    textClassName: 'text-rose-900',
  },
  {
    backgroundClassName: 'bg-pink-50',
    borderClassName: 'border-pink-200',
    textClassName: 'text-pink-900',
  },
  {
    backgroundClassName: 'bg-ki-50',
    borderClassName: 'border-ki-200',
    textClassName: 'text-ki-800',
  },
  {
    backgroundClassName: 'bg-purple-50',
    borderClassName: 'border-purple-200',
    textClassName: 'text-purple-900',
  },
  {
    backgroundClassName: 'bg-fuchsia-50',
    borderClassName: 'border-fuchsia-200',
    textClassName: 'text-fuchsia-900',
  },
  {
    backgroundClassName: 'bg-indigo-50',
    borderClassName: 'border-indigo-200',
    textClassName: 'text-indigo-900',
  },
  {
    backgroundClassName: 'bg-alarm-100',
    borderClassName: 'border-alarm-100',
    textClassName: 'text-alarm-800',
  },
  {
    backgroundClassName: 'bg-yellow-50',
    borderClassName: 'border-yellow-200',
    textClassName: 'text-yellow-900',
  },
  {
    backgroundClassName: 'bg-stone-50',
    borderClassName: 'border-stone-300',
    textClassName: 'text-stone-700',
  },
  {
    backgroundClassName: 'bg-zinc-50',
    borderClassName: 'border-zinc-300',
    textClassName: 'text-zinc-700',
  },
  {
    backgroundClassName: 'bg-neutral-50',
    borderClassName: 'border-neutral-300',
    textClassName: 'text-neutral-700',
  },
];

const hashEmail = (email: string) => {
  const normalizedEmail = email.trim().toLowerCase();

  return [...normalizedEmail].reduce(
    (hash, character) => (hash * 31 + character.charCodeAt(0)) % 2_147_483_647,
    0,
  );
};

const getUserAvatarColor = (email: string): UserAvatarColor => {
  const color =
    USER_AVATAR_COLOR_PALETTE[
      hashEmail(email) % USER_AVATAR_COLOR_PALETTE.length
    ] ?? USER_AVATAR_COLOR_PALETTE[0];
  invariant(color !== undefined, 'Expected user avatar color');
  return color;
};

const getUserAvatarInitials = (params: { name: string; email: string }) => {
  const nameParts = params.name.trim().split(/\s+/).filter(Boolean);

  if (nameParts.length > 0) {
    return nameParts
      .map((part) => part.at(0))
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  return params.email.trim().slice(0, 2).toUpperCase();
};

export function UserAvatar(props: UserAvatarProps) {
  const { className, email, name } = props;
  const color = getUserAvatarColor(email);

  return (
    <span
      aria-label={name || email}
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs leading-none font-medium forced-colors:border-[CanvasText] forced-colors:text-[color:CanvasText]',
        color.backgroundClassName,
        color.borderClassName,
        color.textClassName,
        className,
      )}
    >
      {getUserAvatarInitials({ name, email })}
    </span>
  );
}
