import { cn } from '@/features/ui/style/cn';
import { memo, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserAvatar } from '../user-avatar/UserAvatar';

export type AvatarBandUser = {
  id: string;
  name: string;
  email: string;
};

export type AvatarBandToggleLabelParams = {
  isPinned: boolean;
  user: AvatarBandUser;
};

type AvatarBandProps = {
  getToggleLabel: (params: AvatarBandToggleLabelParams) => string;
  getOverflowLabel: (count: number) => string;
  users: AvatarBandUser[];
  className?: string;
  maxVisible?: number;
};

const AVATAR_HOVER_CLASSNAME =
  'transition-shadow duration-150 ease-out hover:shadow-[0_6px_18px_rgba(15,23,42,0.24),0_0_18px_rgba(59,130,246,0.22)] focus:shadow-[0_6px_18px_rgba(15,23,42,0.24),0_0_18px_rgba(59,130,246,0.22)]';

type TooltipState = {
  isPinned: boolean;
  left: number;
  top: number;
  user: AvatarBandUser;
};

const getTooltipPosition = (element: HTMLElement) => {
  const rect = element.getBoundingClientRect();

  return {
    left: rect.left + rect.width / 2,
    top: rect.top - 8,
  };
};

function AvatarBandTooltip(props: { id: string; state: TooltipState }) {
  const { id, state } = props;

  return createPortal(
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-[9999] flex origin-bottom -translate-x-1/2 -translate-y-full flex-col rounded-[5px] border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] leading-[14px] font-medium tracking-[0.02em] whitespace-nowrap text-white shadow-[0px_4px_16px_0px_rgba(2,6,23,0.18)]"
      style={{ left: state.left, top: state.top }}
    >
      <span>{state.user.name}</span>
      <span className="text-slate-300">{state.user.email}</span>
      <span
        aria-hidden
        className="absolute bottom-[-3px] left-1/2 size-[6px] -translate-x-1/2 rotate-45 border border-t-0 border-l-0 border-slate-700 bg-slate-900 fill-slate-900"
      />
    </div>,
    document.body,
  );
}

const AvatarBandItem = memo(function AvatarBandItem(props: {
  getToggleLabel: (params: AvatarBandToggleLabelParams) => string;
  isActive: boolean;
  isPinned: boolean;
  onActivate: (user: AvatarBandUser, element: HTMLElement) => void;
  onDeactivate: (userId: string) => void;
  onPinnedToggle: (user: AvatarBandUser, element: HTMLElement) => void;
  tooltipId: string;
  user: AvatarBandUser;
}) {
  const {
    getToggleLabel,
    isActive,
    isPinned,
    onActivate,
    onDeactivate,
    onPinnedToggle,
    tooltipId,
    user,
  } = props;

  return (
    <button
      type="button"
      aria-label={getToggleLabel({ isPinned, user })}
      aria-describedby={isActive ? tooltipId : undefined}
      aria-pressed={isPinned}
      className={cn(
        'focus-ring pointer-events-auto relative z-0 inline-flex rounded-full transition-transform duration-150 ease-out hover:z-10 hover:-translate-y-0.5 focus:z-10 focus:-translate-y-0.5',
        isActive && 'z-10 -translate-y-0.5',
      )}
      onPointerEnter={(event) => onActivate(user, event.currentTarget)}
      onPointerLeave={() => onDeactivate(user.id)}
      onFocus={(event) => onActivate(user, event.currentTarget)}
      onBlur={() => onDeactivate(user.id)}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onPinnedToggle(user, event.currentTarget);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onDeactivate(user.id);
        }
      }}
    >
      <UserAvatar
        name={user.name}
        email={user.email}
        className={AVATAR_HOVER_CLASSNAME}
      />
    </button>
  );
});

const AvatarBandItems = memo(function AvatarBandItems(props: {
  activeUserId: string | null;
  getToggleLabel: (params: AvatarBandToggleLabelParams) => string;
  onActivate: (user: AvatarBandUser, element: HTMLElement) => void;
  onDeactivate: (userId: string) => void;
  onPinnedToggle: (user: AvatarBandUser, element: HTMLElement) => void;
  pinnedUserId: string | null;
  tooltipId: string;
  users: AvatarBandUser[];
}) {
  const {
    activeUserId,
    getToggleLabel,
    onActivate,
    onDeactivate,
    onPinnedToggle,
    pinnedUserId,
    tooltipId,
    users,
  } = props;

  return (
    <>
      {users.map((user) => (
        <AvatarBandItem
          key={user.id}
          getToggleLabel={getToggleLabel}
          isActive={activeUserId === user.id}
          isPinned={pinnedUserId === user.id}
          onActivate={onActivate}
          onDeactivate={onDeactivate}
          onPinnedToggle={onPinnedToggle}
          tooltipId={tooltipId}
          user={user}
        />
      ))}
    </>
  );
});

function AvatarBandOverflowTooltip(props: {
  id: string;
  left: number;
  top: number;
  users: AvatarBandUser[];
}) {
  const { id, left, top, users } = props;

  return createPortal(
    <div
      id={id}
      role="tooltip"
      className="pointer-events-none fixed z-[9999] flex origin-bottom -translate-x-1/2 -translate-y-full flex-col gap-1 rounded-[5px] border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] leading-[14px] font-medium tracking-[0.02em] whitespace-nowrap text-white shadow-[0px_4px_16px_0px_rgba(2,6,23,0.18)]"
      style={{ left, top }}
    >
      {users.map((user) => (
        <div key={user.id} className="flex flex-col">
          <span>{user.name}</span>
          <span className="text-slate-300">{user.email}</span>
        </div>
      ))}
      <span
        aria-hidden
        className="absolute bottom-[-3px] left-1/2 size-[6px] -translate-x-1/2 rotate-45 border border-t-0 border-l-0 border-slate-700 bg-slate-900"
      />
    </div>,
    document.body,
  );
}

function AvatarBandOverflowButton(props: {
  count: number;
  getOverflowLabel: (count: number) => string;
  users: AvatarBandUser[];
}) {
  const { count, getOverflowLabel, users } = props;
  const overflowTooltipId = useId();
  const [overflowTooltipPos, setOverflowTooltipPos] = useState<{
    left: number;
    top: number;
  } | null>(null);

  return (
    <>
      <button
        type="button"
        aria-describedby={overflowTooltipPos ? overflowTooltipId : undefined}
        aria-label={getOverflowLabel(count)}
        className={cn(
          'focus-ring pointer-events-auto relative z-0 inline-flex size-7 shrink-0 cursor-default items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-[11px] leading-none font-medium text-slate-600 forced-colors:border-[CanvasText] forced-colors:text-[color:CanvasText]',
          'transition-transform duration-150 ease-out hover:z-10 hover:-translate-y-0.5 focus:z-10 focus:-translate-y-0.5',
        )}
        onPointerEnter={(e) =>
          setOverflowTooltipPos(getTooltipPosition(e.currentTarget))
        }
        onPointerLeave={() => setOverflowTooltipPos(null)}
        onFocus={(e) =>
          setOverflowTooltipPos(getTooltipPosition(e.currentTarget))
        }
        onBlur={() => setOverflowTooltipPos(null)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      >
        +{count}
      </button>
      {overflowTooltipPos ? (
        <AvatarBandOverflowTooltip
          id={overflowTooltipId}
          left={overflowTooltipPos.left}
          top={overflowTooltipPos.top}
          users={users}
        />
      ) : null}
    </>
  );
}

/**
 * Renders the avatar band with optional overflow button and individual user tooltips.
 *
 * @complexity High complexity is inherent in managing two independent tooltip
 * surfaces (per-user pinnable tooltip and overflow count tooltip) alongside
 * pointer/focus/keyboard interaction tracking within a single composited element.
 */
function AvatarBandComponent(props: AvatarBandProps) {
  const {
    className,
    getToggleLabel,
    getOverflowLabel,
    users,
    maxVisible = 3,
  } = props;
  const tooltipId = useId();
  const [tooltipState, setTooltipState] = useState<TooltipState | null>(null);
  const activeUserId = tooltipState?.user.id ?? null;
  const pinnedUserId = tooltipState?.isPinned ? tooltipState.user.id : null;

  const visibleUsers = users.slice(0, maxVisible);
  const overflowCount = users.length - visibleUsers.length;

  const activateUser = (user: AvatarBandUser, element: HTMLElement) => {
    setTooltipState((currentState) => {
      const position = getTooltipPosition(element);

      if (
        currentState?.user.id === user.id &&
        currentState.left === position.left &&
        currentState.top === position.top
      ) {
        return currentState;
      }

      return {
        ...position,
        isPinned: false,
        user,
      };
    });
  };

  const deactivateUser = (userId: string) => {
    setTooltipState((currentState) => {
      if (currentState?.isPinned || currentState?.user.id !== userId) {
        return currentState;
      }

      return null;
    });
  };

  const togglePinnedUser = (user: AvatarBandUser, element: HTMLElement) => {
    setTooltipState((currentState) => {
      if (currentState?.isPinned && currentState.user.id === user.id) {
        return null;
      }

      return {
        ...getTooltipPosition(element),
        isPinned: true,
        user,
      };
    });
  };

  return (
    <>
      <div className={cn('flex min-w-0 items-center -space-x-2', className)}>
        <AvatarBandItems
          activeUserId={activeUserId}
          getToggleLabel={getToggleLabel}
          onActivate={activateUser}
          onDeactivate={deactivateUser}
          onPinnedToggle={togglePinnedUser}
          pinnedUserId={pinnedUserId}
          tooltipId={tooltipId}
          users={visibleUsers}
        />
        {overflowCount > 0 && (
          <AvatarBandOverflowButton
            count={overflowCount}
            getOverflowLabel={getOverflowLabel}
            users={users}
          />
        )}
      </div>
      {tooltipState ? (
        <AvatarBandTooltip id={tooltipId} state={tooltipState} />
      ) : null}
    </>
  );
}

export const AvatarBand = memo(AvatarBandComponent);
AvatarBand.displayName = 'AvatarBand';
