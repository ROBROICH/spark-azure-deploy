import { cn } from '@/features/ui/style/cn';
import {
  List as TabsList,
  Root as TabsRoot,
  Trigger as TabsTrigger,
} from '@radix-ui/react-tabs';
import { type ElementType, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

type SwimlaneTabItem = {
  value: string;
  label: string;
  icon: ElementType;
  action?: ReactNode;
};

type SwimlaneTabsProps = {
  items: SwimlaneTabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  children: ReactNode;
};

export const SwimlaneTabs = (props: SwimlaneTabsProps) => {
  const {
    items,
    value,
    defaultValue,
    onValueChange,
    ariaLabel,
    className,
    children,
  } = props;

  const { t } = useTranslation('shared');

  const hasAnyAction = items.some((item) => item.action);

  // Track the active tab locally so the action overlay reflects the current
  // tab in both controlled and uncontrolled usage.
  const [internalValue, setInternalValue] = useState(
    value ?? defaultValue ?? items[0]?.value,
  );
  const activeValue = value ?? internalValue;

  return (
    <TabsRoot
      value={value}
      defaultValue={defaultValue}
      onValueChange={(next) => {
        setInternalValue(next);
        onValueChange?.(next);
      }}
      className={cn(
        'flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden',
        className,
      )}
    >
      <div className="relative flex w-full shrink-0 items-stretch">
        <TabsList
          aria-label={ariaLabel ?? t('SwimlaneTabs.defaultAriaLabel')}
          className="flex w-full shrink-0 flex-row items-stretch"
        >
          {items.map((item, index) => {
            const Icon = item.icon;

            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  'focus-ring group flex h-12 min-w-0 flex-1 items-center gap-2 p-2 text-[13px] font-medium tracking-[-0.13px]',
                  'data-[state=active]:bg-bg-primary data-[state=active]:text-brand-950 data-[state=active]:hover:bg-[#F8FAFC]',
                  'data-[state=inactive]:bg-bg-tertiary data-[state=inactive]:text-neutral-700 data-[state=inactive]:hover:bg-[#F8FAFC]',
                  'border-b data-[state=active]:border-b-transparent data-[state=inactive]:border-b-slate-300',
                  index > 0 && 'border-l border-l-slate-300',
                  item.action && 'pr-10',
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex rounded-lg p-2 group-data-[state=active]:bg-bg-quaternary"
                >
                  <Icon className="size-4" />
                </span>
                <span className="flex-1 text-left">{item.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Action buttons rendered outside the tablist to avoid a11y violations */}
        {hasAnyAction && (
          <div className="pointer-events-none absolute inset-0 flex items-stretch">
            {items.map((item, index) => {
              const isInactive = item.value !== activeValue;

              return (
                <div
                  key={item.value}
                  className={cn(
                    'relative min-w-0 flex-1',
                    index > 0 && 'border-l border-l-transparent',
                  )}
                >
                  {item.action ? (
                    <span
                      className={cn(
                        'pointer-events-auto absolute top-1/2 right-2 -translate-y-1/2',
                        isInactive && 'pointer-events-none opacity-40',
                      )}
                    >
                      {item.action}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {children}
    </TabsRoot>
  );
};
