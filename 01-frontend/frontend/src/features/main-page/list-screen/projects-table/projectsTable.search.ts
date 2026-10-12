import { z } from 'zod';
import { ANLAGE_FILTER_VALUES } from './ProjectsTable.constants';

export const projectsTableSearchSchema = z.object({
  search: z.string().catch('').optional(),
  sortColumn: z
    .enum([
      'name',
      'internalProjectNumber',
      'projectTypeName',
      'statusName',
      'originalCreatedAt',
      'updatedAt',
    ])
    .catch('originalCreatedAt')
    .optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  anlageFilter: z.array(z.enum(ANLAGE_FILTER_VALUES)).catch([]).optional(),
  typeFilter: z.array(z.string()).catch([]).optional(),
  statusFilter: z.array(z.string()).catch([]).optional(),
  favoriteFilter: z
    .array(z.enum(['favorited', 'not-favorited']))
    .catch([])
    .optional(),
  zuordnungFilter: z.enum(['meine', 'alle']).catch('alle').optional(),
});

export type ProjectsTableSearchParams = z.infer<
  typeof projectsTableSearchSchema
>;
