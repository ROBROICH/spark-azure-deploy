import type { ReactNode } from 'react';

type ResultCardStatusFallbackProps = {
  children: ReactNode;
  statusAddon?: ReactNode;
};

/**
 * Keeps a card's status addon, such as the failure chip, visible above the
 * error alert that replaces a card whose own read failed.
 */
export const ResultCardStatusFallback = (
  props: ResultCardStatusFallbackProps,
) => {
  const { children, statusAddon } = props;

  if (!statusAddon) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <span className="flex justify-end">{statusAddon}</span>
      {children}
    </div>
  );
};
