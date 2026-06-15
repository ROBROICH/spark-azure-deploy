import { Card, CardHeader, CardTitle } from '@/features/ui/card/Card';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { Link } from '@tanstack/react-router';
import { CalendarDays } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { Project } from '@/features/main-page/data/schemas/project.schema';
import {
  getStatusBadgeVariant,
  getStatusLabel,
} from '@/features/main-page/list-screen/project-status/statusUtils';
import { getProjectGradient } from './projectGradient';

type FavoriteCardProps = {
  project: Project;
  progressStep: number;
};

const metaTextClass =
  'truncate text-[11px] font-medium leading-[14px] tracking-[0.02em] text-neutral-700';

export const FavoriteCard = (props: FavoriteCardProps) => {
  const { t, i18n } = useTranslation('Dashboard');
  const { project, progressStep } = props;
  const { id, name, statusName, internalProjectNumber, entryDate } = project;

  const formattedDate = new Date(entryDate).toLocaleDateString(i18n.language, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <Link
      to="/verfahren/$verfahrenId"
      params={{ verfahrenId: id }}
      preload={false}
      className="block h-full"
    >
      <Card className="h-full cursor-pointer gap-0 overflow-hidden rounded-lg border-none bg-bg-secondary py-4 pt-0 shadow-none transition-colors hover:bg-bg-tertiary">
        <div
          className="relative h-12 w-full"
          style={{ background: getProjectGradient(id) }}
        >
          <div className="absolute top-0 z-1 flex w-full items-center justify-between p-2">
            <div className="flex w-full items-center justify-between gap-2">
              <div
                className="flex size-8 shrink-0 items-center justify-center rounded-lg border-[0.5px] border-border-tertiary bg-white"
                aria-hidden="true"
              >
                <span className="text-sm leading-none font-medium text-text-primary">
                  {name.charAt(0).toUpperCase()}
                </span>
              </div>
              <StatusBadge variant={getStatusBadgeVariant(statusName)}>
                {getStatusLabel(statusName, t)}
              </StatusBadge>
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col justify-between">
          <CardHeader className="p-4 pb-0">
            <CardTitle className="text-base leading-5 font-medium tracking-[-0.01em] [overflow-wrap:anywhere] break-words text-text-primary">
              {name}
            </CardTitle>
            <p className="text-[11px] leading-[14px] font-medium tracking-[0.02em] text-neutral-700">
              {internalProjectNumber}
            </p>
          </CardHeader>
          <hr className="mx-4 my-4 border-t-[0.5px] border-border-primary" />
          <div className="flex flex-col gap-2 px-4">
            <div className="flex items-center gap-2">
              <div className="flex size-3 shrink-0 items-center justify-center rounded-[4px] border-[1.25px] border-neutral-700 text-[7px] leading-none font-semibold text-neutral-700">
                {progressStep}
              </div>
              <p className={metaTextClass}>
                {`${t('FavoriteCard.progressStep')} ${progressStep}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays
                aria-hidden="true"
                className="size-3 shrink-0 text-neutral-700"
              />
              <p className={metaTextClass}>{formattedDate}</p>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
};
