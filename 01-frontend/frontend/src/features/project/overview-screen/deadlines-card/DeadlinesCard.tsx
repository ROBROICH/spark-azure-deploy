import {
  v1ProjectLogicGetDeadline,
  type DeadlineResponse,
} from '@/api-clients/backend';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { deadlinesCollection } from '@/features/project/overview-screen/data/collections/deadlines.collection';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { toast } from '@/features/ui/toast/Toast';
import { getDateLocale } from '@/i18n/dateLocale';
import { cn } from '@/features/ui/style/cn';
import * as Sentry from '@sentry/react';
import { eq, useLiveInfiniteQuery } from '@tanstack/react-db';
import { skipToken, useQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { isBefore, parseISO, startOfDay } from 'date-fns';
import { Calendar, EllipsisVertical, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CreateDeadlineDialog } from './CreateDeadlineDialog';
import { DeadlineReadRow } from './DeadlineReadRow';
import { DeadlinesCardSkeleton } from './DeadlinesCardSkeleton';
import { DeleteDeadlineDialog } from './DeleteDeadlineDialog';
import { EditDeadlineDialog } from './EditDeadlineDialog';

const route = getRouteApi('/verfahren/$verfahrenId/');

const isDeadlinePastDue = (deadline: DeadlineResponse, today = new Date()) =>
  isBefore(startOfDay(parseISO(deadline.endAt)), startOfDay(today));

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

  const deadlines = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ d: deadlinesCollection })
        .where(({ d }) => eq(d.projectId, verfahrenId))
        .orderBy(({ d }) => d.endAt, 'asc')
        .orderBy(({ d }) => d.id, 'asc'),
    { pageSize: 50 },
    [verfahrenId],
  );
  const selectedDeadline = useQuery({
    queryKey: ['deadline-detail', verfahrenId, editDeadlineId],
    queryFn:
      editDeadlineId && canMutateProject
        ? async () => {
            const { data } = await v1ProjectLogicGetDeadline({
              path: { deadlineId: editDeadlineId },
              throwOnError: true,
            });
            if (data.projectId !== verfahrenId) {
              throw new Error('Deadline belongs to another project');
            }
            return data;
          }
        : skipToken,
  });

  // eslint-disable-next-line no-restricted-syntax -- ephemeral UI toggle for create dialog
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [deletingDeadline, setDeletingDeadline] =
    // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state for delete confirmation target
    useState<DeadlineResponse | null>(null);

  const editingDeadline = selectedDeadline.data ?? null;
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

  if (deadlines.isLoading) {
    return <DeadlinesCardSkeleton />;
  }

  const handleDelete = async () => {
    if (!deletingDeadline || !canMutateProject) {
      return;
    }
    try {
      // `delete` throws synchronously when a refetch already dropped the row,
      // so it has to stay inside the guarded block.
      const transaction = deadlinesCollection.delete(deletingDeadline.id);
      setDeletingDeadline(null);
      await transaction.isPersisted.promise;
    } catch (error) {
      // A rejected persistence rolls the optimistic delete back, so the row
      // returns to the list. A synchronous throw means a refetch already
      // removed the row; the toast then reports a stale dialog, not data loss.
      Sentry.captureException(error);
      toast.error(t('Deadlines.deleteError'));
      return;
    }

    toast.success(t('Deadlines.deleteSuccess'));
  };

  return (
    <>
      <div className="mt-6 flex flex-col gap-4 p-2">
        <div className="flex flex-wrap items-center gap-2">
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

        {(deadlines.isError || selectedDeadline.isError) && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-md bg-highlight-error p-3"
          >
            <p>{t('Deadlines.loadError')}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void deadlinesCollection.utils.refetch();
                if (editDeadlineId) {
                  void selectedDeadline.refetch();
                }
              }}
            >
              {t('Deadlines.retry')}
            </Button>
          </div>
        )}
        {deadlines.data.length === 0 ? (
          !deadlines.isError && (
            <p className="text-sm text-text-secondary">
              {t('Deadlines.emptyState')}
            </p>
          )
        ) : (
          <div
            className="overflow-x-auto rounded-lg border border-border-primary"
            role="region"
            aria-label={t('Deadlines.tableAriaLabel')}
            tabIndex={0}
          >
            <table className="w-full min-w-[600px]">
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
        {deadlines.hasNextPage && (
          <Button
            variant="secondary"
            size="sm"
            disabled={deadlines.isFetchingNextPage}
            onClick={() => void deadlines.fetchNextPage()}
          >
            {deadlines.isFetchingNextPage
              ? t('Deadlines.loading')
              : t('Deadlines.loadMore')}
          </Button>
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
          key={editingDeadline?.id}
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
          onConfirm={() => void handleDelete()}
        />
      ) : null}
    </>
  );
};
