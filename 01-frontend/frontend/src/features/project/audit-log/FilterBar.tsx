import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Label } from '@/features/ui/label/Label';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import type { ActionSidebarSearch } from '@/features/project/action-sidebar/sidebarSearchParams';

type ProtocolTimePeriod = NonNullable<
  ActionSidebarSearch['protocolTimePeriods']
>;
type ProtocolSource = Extract<
  NonNullable<ActionSidebarSearch['protocolSource']>,
  'user' | 'agent'
>;

const route = getRouteApi('/verfahren/$verfahrenId');

const AUDIT_LOG_TIME_PERIOD_OPTIONS = [
  '0',
  '1',
  '7',
  '30',
  '180',
  '365',
  'over-365',
] as const satisfies ReadonlyArray<ProtocolTimePeriod>;
const AUDIT_LOG_TIME_PERIOD_VALUE_SET = new Set<string>(
  AUDIT_LOG_TIME_PERIOD_OPTIONS,
);
const AUDIT_LOG_SOURCE_OPTIONS = [
  'agent',
  'user',
] as const satisfies ReadonlyArray<ProtocolSource>;
const AUDIT_LOG_SOURCE_VALUE_SET = new Set<string>(AUDIT_LOG_SOURCE_OPTIONS);
const AUDIT_LOG_SERVICE_OPTIONS = [
  'project_logic',
  'formal_completeness',
  'plausibility',
  'comment',
  'supplementary',
  'document_management',
  'administrative_draft',
  'examination',
  'objections_management',
] as const;

const AUDIT_LOG_TIME_PERIOD_LABEL_KEYS = {
  '0': 'today',
  '1': 'yesterday',
  '7': '7-days',
  '30': '30-days',
  '180': '180-days',
  '365': '365-days',
  'over-365': 'over-365-days',
} satisfies Record<ProtocolTimePeriod, string>;

const isProtocolTimePeriod = (value: string): value is ProtocolTimePeriod =>
  AUDIT_LOG_TIME_PERIOD_VALUE_SET.has(value);

const isProtocolSource = (value: string): value is ProtocolSource =>
  AUDIT_LOG_SOURCE_VALUE_SET.has(value);

/**
 * Normalizes select-menu strings against route-schema-derived unions before
 * committing same-screen filter changes to route search state.
 *
 * @returns The audit log filter controls.
 */
export const FilterBar = () => {
  const { protocolTimePeriods, protocolSource, protocolService } =
    route.useSearch();
  const navigate = useNavigate();
  const { t } = useTranslation('AuditLog');

  const timePeriodItems = [
    { value: 'all', label: t('filterBar.timePeriods.all') },
    ...AUDIT_LOG_TIME_PERIOD_OPTIONS.map((period) => ({
      value: period,
      label: t(
        `filterBar.timePeriods.${AUDIT_LOG_TIME_PERIOD_LABEL_KEYS[period]}`,
      ),
    })),
  ];
  const sourceItems = [
    { value: 'all', label: t('filterBar.source.all') },
    ...AUDIT_LOG_SOURCE_OPTIONS.map((source) => ({
      value: source,
      label: t(`filterBar.source.${source}`),
    })),
  ];
  const serviceItems = [
    { value: 'all', label: t('filterBar.service.all') },
    ...AUDIT_LOG_SERVICE_OPTIONS.map((service) => ({
      value: service,
      label: t(`filterBar.service.options.${service}`),
    })),
  ];

  const updateFilters = (
    changes: Partial<{
      protocolTimePeriods: ProtocolTimePeriod;
      protocolSource: ProtocolSource;
      protocolService: string;
    }>,
  ) => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        ...changes,
        protocolOffset: undefined,
        protocolWorkflowRunId: undefined,
        protocolRequestId: undefined,
        protocolDrilldownOffset: undefined,
      }),
      resetScroll: false,
      replace: true,
    });
  };

  const handleTimePeriodChange = (value: string) => {
    if (value === 'all') {
      updateFilters({ protocolTimePeriods: undefined });
      return;
    }

    if (isProtocolTimePeriod(value)) {
      updateFilters({ protocolTimePeriods: value });
    }
  };

  const handleSourceChange = (value: string) => {
    if (value === 'all') {
      updateFilters({ protocolSource: undefined });
      return;
    }

    if (isProtocolSource(value)) {
      updateFilters({ protocolSource: value });
    }
  };

  return (
    <div className="border-b border-neutral-200 pb-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="filter-bar-time-periods">
            {t('filterBar.timePeriods.label')}
          </Label>
          <SelectMenu
            id="filter-bar-time-periods"
            items={timePeriodItems}
            value={protocolTimePeriods || 'all'}
            onChange={handleTimePeriodChange}
            triggerClassName="w-full"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="filter-bar-source">
            {t('filterBar.source.label')}
          </Label>
          <SelectMenu
            id="filter-bar-source"
            items={sourceItems}
            value={protocolSource || 'all'}
            onChange={handleSourceChange}
            triggerClassName="w-full"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor="filter-bar-service">
            {t('filterBar.service.label')}
          </Label>
          <SelectMenu
            id="filter-bar-service"
            items={serviceItems}
            value={protocolService || 'all'}
            onChange={(value) =>
              updateFilters({
                protocolService: value === 'all' ? undefined : value,
              })
            }
            triggerClassName="w-full"
          />
        </div>
      </div>
    </div>
  );
};
