import { cn } from '@/features/ui/style/cn';
import { ChevronDown, ChevronRight, CircleAlert, Sparkles } from 'lucide-react';
import { useSyncExternalStore, type ReactNode } from 'react';

export type InfoCardVariant = 'ai' | 'warning';

type InfoCardBaseProps = {
  ariaLabel?: string;
  body?: ReactNode;
  className?: string;
  contentClassName?: string;
  footer?: ReactNode;
  leadingIcon?: ReactNode;
  title: ReactNode;
  variant: InfoCardVariant;
};

type InfoCardCollapsibleProps = InfoCardBaseProps & {
  collapsedHeaderAction?: ReactNode;
  collapsedLeadingIcon?: ReactNode;
  collapsedTitle?: ReactNode;
  initialCollapsed?: boolean;
  isCollapsible: true;
  name: string;
};

type InfoCardStaticProps = InfoCardBaseProps & {
  collapsedHeaderAction?: never;
  collapsedLeadingIcon?: never;
  collapsedTitle?: never;
  initialCollapsed?: never;
  isCollapsible?: false;
  name?: never;
};

export type InfoCardProps = InfoCardCollapsibleProps | InfoCardStaticProps;

const AI_GRADIENT_TEXT =
  'bg-linear-to-b from-[rgba(147,51,234,1)] to-[rgba(88,28,135,1)] bg-clip-text text-transparent';

const INFO_CARD_STYLES = {
  ai: {
    body: 'text-purple-950',
    chevron: 'text-purple-900',
    container:
      'border-purple-400 bg-purple-50 text-purple-900 shadow-[0px_1px_2px_0px_rgba(15,23,42,0.05)]',
    expandedHeader: 'bg-purple-100',
    icon: 'text-purple-900',
    title: AI_GRADIENT_TEXT,
  },
  warning: {
    body: 'text-warning-800',
    chevron: 'text-warning-800',
    container:
      'border-border-warning bg-highlight-warning-light text-warning-800',
    expandedHeader: 'bg-highlight-warning',
    icon: 'text-warning-600',
    title: 'text-text-warning',
  },
} as const satisfies Record<
  InfoCardVariant,
  {
    body: string;
    chevron: string;
    container: string;
    expandedHeader: string;
    icon: string;
    title: string;
  }
>;

const INFO_CARD_STORAGE_EVENT_NAME = 'info-card-storage';

const getInfoCardStorageKey = (props: {
  name: string;
  variant: InfoCardVariant;
}) => {
  const { name, variant } = props;

  return `info-card:${variant}:${name}:collapsed`;
};

const readStoredInfoCardCollapsed = (
  key: string,
  initialCollapsed: boolean,
) => {
  const rawValue = window.localStorage.getItem(key);
  if (rawValue === null) {
    return initialCollapsed;
  }

  try {
    const parsed: unknown = JSON.parse(rawValue);
    return typeof parsed === 'boolean' ? parsed : initialCollapsed;
  } catch {
    return initialCollapsed;
  }
};

const writeStoredInfoCardCollapsed = (key: string, value: boolean) => {
  const nextValue = JSON.stringify(value);
  window.localStorage.setItem(key, nextValue);
  window.dispatchEvent(
    new StorageEvent('storage', { key, newValue: nextValue }),
  );
  window.dispatchEvent(new CustomEvent(INFO_CARD_STORAGE_EVENT_NAME));
};

const subscribeToInfoCardStorage = (callback: () => void) => {
  window.addEventListener('storage', callback);
  window.addEventListener(INFO_CARD_STORAGE_EVENT_NAME, callback);

  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(INFO_CARD_STORAGE_EVENT_NAME, callback);
  };
};

const useInfoCardCollapsedState = (props: {
  initialCollapsed: boolean;
  key: string;
}) => {
  const { initialCollapsed, key } = props;
  const isCollapsed = useSyncExternalStore(
    subscribeToInfoCardStorage,
    () => readStoredInfoCardCollapsed(key, initialCollapsed),
    () => initialCollapsed,
  );
  const setIsCollapsed = (value: boolean | ((current: boolean) => boolean)) => {
    try {
      const current = readStoredInfoCardCollapsed(key, initialCollapsed);
      const nextValue = typeof value === 'function' ? value(current) : value;
      writeStoredInfoCardCollapsed(key, nextValue);
    } catch {
      // Storage can be unavailable or quota-limited; collapsing should remain non-fatal.
    }
  };

  return [isCollapsed, setIsCollapsed] as const;
};

const DefaultInfoCardIcon = (props: { variant: InfoCardVariant }) => {
  const { variant } = props;

  if (variant === 'warning') {
    return <CircleAlert className="size-4" aria-hidden="true" />;
  }

  return <Sparkles className="size-4" aria-hidden="true" />;
};

const InfoCardContent = (props: {
  body: ReactNode | undefined;
  contentClassName: string | undefined;
  footer: ReactNode | undefined;
  variant: InfoCardVariant;
}) => {
  const { body, contentClassName, footer, variant } = props;
  const styles = INFO_CARD_STYLES[variant];

  if (!body && !footer) {
    return null;
  }

  return (
    <div className={cn('space-y-4 p-4', contentClassName)}>
      {body ? (
        <div
          className={cn('text-[13px] leading-[18px] font-normal', styles.body)}
        >
          {body}
        </div>
      ) : null}
      {footer}
    </div>
  );
};

const StaticInfoCard = (props: InfoCardStaticProps) => {
  const {
    ariaLabel,
    body,
    className,
    contentClassName,
    footer,
    leadingIcon,
    title,
    variant,
  } = props;
  const styles = INFO_CARD_STYLES[variant];

  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border-[0.5px]',
        styles.container,
        className,
      )}
      aria-label={ariaLabel}
    >
      <div
        className={cn(
          'flex w-full items-center gap-1 p-1 text-left',
          styles.expandedHeader,
        )}
      >
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center p-1',
            styles.icon,
          )}
        >
          {leadingIcon ?? <DefaultInfoCardIcon variant={variant} />}
        </span>
        <span
          className={cn(
            'min-w-0 flex-1 text-[13px] leading-[18px] font-medium',
            styles.title,
          )}
        >
          {title}
        </span>
      </div>
      <InfoCardContent
        body={body}
        contentClassName={contentClassName}
        footer={footer}
        variant={variant}
      />
    </section>
  );
};

/**
 * Renders a card whose expanded/collapsed state is persisted by variant and
 * card name.
 */
const CollapsibleInfoCard = (props: InfoCardCollapsibleProps) => {
  const {
    ariaLabel,
    body,
    className,
    collapsedHeaderAction,
    collapsedLeadingIcon,
    collapsedTitle,
    contentClassName,
    footer,
    initialCollapsed = false,
    leadingIcon,
    name,
    title,
    variant,
  } = props;
  const styles = INFO_CARD_STYLES[variant];
  const [isCollapsed, setIsCollapsed] = useInfoCardCollapsedState({
    key: getInfoCardStorageKey({ name, variant }),
    initialCollapsed,
  });
  const displayedTitle = isCollapsed && collapsedTitle ? collapsedTitle : title;
  const displayedLeadingIcon =
    isCollapsed && collapsedLeadingIcon ? collapsedLeadingIcon : leadingIcon;

  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg border-[0.5px]',
        styles.container,
        className,
      )}
      aria-label={ariaLabel}
    >
      <div
        className={cn(
          'focus-ring flex w-full items-center gap-1 p-1 text-left',
          !isCollapsed && styles.expandedHeader,
        )}
      >
        <button
          type="button"
          className="focus-ring flex min-w-0 flex-1 items-center gap-1 rounded-md text-left"
          aria-expanded={!isCollapsed}
          onClick={() => setIsCollapsed((current) => !current)}
        >
          <span
            className={cn(
              'flex size-6 shrink-0 items-center justify-center p-1',
              styles.icon,
            )}
          >
            {displayedLeadingIcon ?? <DefaultInfoCardIcon variant={variant} />}
          </span>
          <span
            className={cn(
              'min-w-0 flex-1 text-[13px] leading-[18px] font-medium',
              styles.title,
            )}
          >
            {displayedTitle}
          </span>
        </button>
        {isCollapsed ? collapsedHeaderAction : null}
        <span
          className={cn(
            'flex size-6 shrink-0 items-center justify-center p-1',
            styles.chevron,
          )}
        >
          {isCollapsed ? (
            <ChevronRight className="size-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-4" aria-hidden="true" />
          )}
        </span>
      </div>
      {!isCollapsed ? (
        <InfoCardContent
          body={body}
          contentClassName={contentClassName}
          footer={footer}
          variant={variant}
        />
      ) : null}
    </section>
  );
};

export const InfoCard = (props: InfoCardProps) => {
  if (props.isCollapsible) {
    return <CollapsibleInfoCard {...props} />;
  }

  return <StaticInfoCard {...props} />;
};
