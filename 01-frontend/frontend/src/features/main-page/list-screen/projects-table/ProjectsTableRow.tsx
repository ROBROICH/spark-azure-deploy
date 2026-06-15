import { flexRender, type Row } from '@tanstack/react-table';
import type { Project } from '../../data/schemas/project.schema';
import {
  type FavoriteColumnMeta,
  renderProjectsTableFavoriteCell,
} from './ProjectsTable.columns';

type ProjectsTableRowProps = {
  favoriteColumn: FavoriteColumnMeta;
  row: Row<Project>;
  onNavigate: (projectId: string) => void;
};

/**
 * Renders a single interactive projects-table row. Clicks that land on a nested
 * control (link, button, input) are ignored so only blank-row clicks navigate to
 * the project.
 */
export const ProjectsTableRow = (props: ProjectsTableRowProps) => {
  const { favoriteColumn, row, onNavigate } = props;

  return (
    <tr
      className="cursor-pointer border-b border-border-primary bg-neutral-white transition-colors last:border-b-0 hover:bg-bg-secondary"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, [role="button"]')) {
          return;
        }
        onNavigate(row.original.id);
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <td
          key={cell.id}
          className="px-3 py-[11px] align-middle text-sm font-normal tracking-tight text-text-secondary"
        >
          {cell.column.id === 'favorite'
            ? renderProjectsTableFavoriteCell({
                favoriteColumn,
                projectId: row.original.id,
              })
            : flexRender(cell.column.columnDef.cell, cell.getContext())}
        </td>
      ))}
    </tr>
  );
};
