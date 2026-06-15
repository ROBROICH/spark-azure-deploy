import type { ColumnDef } from '@tanstack/react-table';
import { createContentsColumn, createStatusColumn } from './columns.display';
import {
  createActionColumn,
  createDocumentTypeColumn,
  createTopicColumn,
} from './columns.interactive';
import type { ColumnCallbacks, RowNode } from './columns.shared';

export const createColumns = (
  callbacks: ColumnCallbacks,
): ColumnDef<RowNode, unknown>[] => [
  createContentsColumn(callbacks),
  createStatusColumn(callbacks),
  createDocumentTypeColumn(callbacks),
  createTopicColumn(callbacks),
  createActionColumn(callbacks),
];
