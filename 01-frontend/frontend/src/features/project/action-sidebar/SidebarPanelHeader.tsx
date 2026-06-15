import type { ElementType, ReactNode } from 'react';

type SidebarPanelHeaderProps = {
  /** Optional icon shown in a badge. Omit for panels without an icon. */
  icon?: ElementType;
  title: string;
  /** Radix sheet title or another accessible heading wrapper. */
  titleWrapper?: ElementType;
  children?: ReactNode;
};

/**
 * Shared header bar for action sidebar panels (requests, comments, etc.).
 * Applies the standard panel header typography and layout.
 */
export const SidebarPanelHeader = (props: SidebarPanelHeaderProps) => {
  const {
    icon: Icon,
    title,
    titleWrapper: TitleWrapper = 'h3',
    children,
  } = props;

  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border-primary bg-bg-primary p-2 text-[13px] font-medium tracking-[-0.13px] text-brand-950">
      {Icon && (
        <span aria-hidden="true" className="rounded-lg bg-bg-quaternary p-2">
          <Icon className="size-4" />
        </span>
      )}
      <TitleWrapper className="flex-1 px-1">{title}</TitleWrapper>
      {children}
    </div>
  );
};
