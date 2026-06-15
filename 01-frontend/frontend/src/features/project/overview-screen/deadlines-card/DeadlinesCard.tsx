import { type DeadlineResponse } from '@/api-clients/pls-module';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { deadlinesCollection } from '@/features/project/overview-screen/data/collections/deadlines.collection';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { toast } from '@/features/ui/toast/Toast';
import { getDateLocale } from '@/i18n/dateLocale';
import { cn } from '@/features/ui/style/cn';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { isBefore, parseISO, startOfDay } from 'date-fns';
import { Calendar, EllipsisVertical, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CreateDeadlineDialog } from './CreateDeadlineDialog';
import { DeadlineReadRow } from './DeadlineReadRow';
import { DeleteDeadlineDialog } from './DeleteDeadlineDialog';
import { EditDeadlineDialog } from './EditDeadlineDialog';

const route = getRouteApi('/verfahren/$verfahrenId/');

const isDeadlinePastDue = (deadline: DeadlineResponse, today = new Date()) =>
  isBefore(startOfDay(parseISO(deadline.endAt)), startOfDay(today));

const DeadlinesCardSkeleton = () => (
  <div className="mt-6 flex flex-col gap-4 p-2">
    <div className="flex items-center gap-2">
      <Skeleton className="size-8 shrink-0 rounded-lg" aria-hidden />
      <Skeleton className="h-5 flex-1" aria-hidden />
      <Skeleton className="h-8 w-28 rounded-lg" aria-hidden />
    </div>
    <div
      className="overflow-clip rounded-lg border border-border-primary"
      {...skeletonListProps}
    >
      <div className="flex border-b border-border-primary bg-bg-secondary">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-1 px-3 py-[11px]">
            <Skeleton className="h-[18px] w-16" aria-hidden />
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="flex border-b border-border-primary last:border-b-0"
        >
          {Array.from({ length: 5 }).map((_cell, j) => (
            <div key={j} className="flex-1 px-3 py-[11px]">
              <Skeleton className="h-[18px] w-20" aria-hidden />
            </div>
          ))}
        </div>
      ))}
    </div>
  </div>
);

/** Fetches deadlines via on-demand collection and coordinates create/edit/delete UI flows. */
export const DeadlinesCard = () => {
  const { t, i18n } = useTranslation('Project');
  const dateLocale = getDateLocale(i18n.language);
  const { verfahrenId } = route.useParams();
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });
  const { editDeadlineId } = route.useSearch();
  const navigate = route.useNavigate();
  const queryClient = useQueryClient();
  const deadlinesQueryKey = ['deadlines', verfahrenId] as const;
  const fetchingDeadlinesCount = useIsFetching({ queryKey: deadlinesQueryKey });

  const deadlines = useLiveQuery((q) =>
    q
      .from({ d: deadlinesCollection })
      .where(({ d }) => eq(d.projectId, verfahrenId)),
  );

  const deadlinesQueryState = queryClient.getQueryState(deadlinesQueryKey);
  const hasLoadedCurrentProjectDeadlines = Boolean(
    deadlinesQueryState &&
    (deadlinesQueryState.dataUpdatedAt > 0 ||
      deadlinesQueryState.status === 'error'),
  );

  // eslint-disable-next-line no-restricted-syntax -- ephemeral UI toggle for create dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [deletingDeadline, setDeletingDeadline] =
    // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state for delete confirmation target
    useState<DeadlineResponse | null>(null);

  const editingDeadline =
    deadlines.data.find((d) => d.id === editDeadlineId) ?? null;
  const today = new Date();

  const openEditDialog = (deadlineId: string) => {
    if (!canMutateProject) {
      return;
    }

    navigate({
      search: (prev) => ({ ...prev, editDeadlineId: deadlineId }),
      replace: true,
    });
  };

  const closeEditDialog = () => {
    navigate({
      search: (prev) => ({ ...prev, editDeadlineId: undefined }),
      replace: true,
    });
  };

  if (
    deadlines.data.length === 0 &&
    !hasLoadedCurrentProjectDeadlines &&
    fetchingDeadlinesCount > 0
  ) {
    return <DeadlinesCardSkeleton />;
  }

  const handleDelete = () => {
    if (!deletingDeadline || !canMutateProject) {
      return;
    }
    deadlinesCollection.delete(deletingDeadline.id);
    toast.success(t('Deadlines.deleteSuccess'));
    setDeletingDeadline(null);
  };

  return (
    <>
      <div className="mt-6 flex flex-col gap-4 p-2">
        <div className="flex items-center gap-2">
          <span aria-hidden className="rounded-lg bg-bg-quaternary p-2">
            <Calendar className="size-4" />
          </span>
          <h2 className="flex-1 text-base font-medium tracking-tight text-text-primary">
            {t('Deadlines.title')}
          </h2>
          {canMutateProject ? (
            <Button
              variant="secondary"
              size="sm"
              withIcon
              type="button"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus aria-hidden />
              {t('Deadlines.addButton')}
            </Button>
          ) : null}
        </div>

        {deadlines.data.length === 0 ? (
          <p className="text-sm text-text-secondary">
            {t('Deadlines.emptyState')}
          </p>
        ) : (
          <div className="overflow-clip rounded-lg border border-border-primary">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-primary bg-bg-secondary">
                  <th className="px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary">
                    {t('Deadlines.tableHeaders.deadlineType')}
                  </th>
                  <th className="px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary">
                    {t('Deadlines.tableHeaders.legalBasis')}
                  </th>
                  <th className="w-[129px] px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary">
                    {t('Deadlines.tableHeaders.startAt')}
                  </th>
                  <th className="w-[129px] px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary">
                    {t('Deadlines.tableHeaders.endAt')}
                  </th>
                  {canMutateProject ? (
                    <th
                      className="w-10 p-2"
                      aria-label={t('Deadlines.tableHeaders.action')}
                    />
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {deadlines.data.map((deadline) => {
                  const isPastDue = isDeadlinePastDue(deadline, today);

                  return (
                    <tr
                      key={deadline.id}
                      className={cn(
                        'border-b border-border-primary last:border-b-0',
                        isPastDue && 'bg-highlight-error',
                      )}
                    >
                      <DeadlineReadRow
                        deadline={deadline}
                        isPastDue={isPastDue}
                        locale={dateLocale}
                      />
                      {canMutateProject ? (
                        <td className="w-10 p-2">
                          <ActionMenu>
                            <ActionMenuTrigger asChild>
                              <Button
                                type="button"
                                size="xs"
                                iconOnly
                                variant="ghost-light"
                                aria-label={t('Deadlines.actionsMenu')}
                              >
                                <EllipsisVertical aria-hidden />
                              </Button>
                            </ActionMenuTrigger>
                            <ActionMenuContent align="start">
                              <ActionMenuItem
                                onSelect={() => openEditDialog(deadline.id)}
                              >
                                {t('Deadlines.actions.edit')}
                              </ActionMenuItem>
                              <ActionMenuItem
                                variant="destructive"
                                onSelect={() => setDeletingDeadline(deadline)}
                              >
                                {t('Deadlines.actions.delete')}
                              </ActionMenuItem>
                            </ActionMenuContent>
                          </ActionMenu>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canMutateProject ? (
        <CreateDeadlineDialog
          canMutateProject={canMutateProject}
          projectId={verfahrenId}
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
        />
      ) : null}

      {canMutateProject ? (
        <EditDeadlineDialog
          canMutateProject={canMutateProject}
          deadline={editingDeadline}
          onOpenChange={(open) => {
            if (!open) {
              closeEditDialog();
            }
          }}
        />
      ) : null}

      {canMutateProject ? (
        <DeleteDeadlineDialog
          open={deletingDeadline !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDeletingDeadline(null);
            }
          }}
          onConfirm={handleDelete}
        />
      ) : null}
    </>
  );
};
