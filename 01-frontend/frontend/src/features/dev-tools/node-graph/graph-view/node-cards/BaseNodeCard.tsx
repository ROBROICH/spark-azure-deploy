import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/features/ui/card/Card';
import { Badge } from '@/features/ui/badge/Badge';
import type { NodePayload } from '@/db/nodes/types';
import type { ReactNode } from 'react';
import { startCase } from 'es-toolkit/string';
import { getNodeTypeColor } from '../../nodeTypePresentation';

type BaseNodeCardProps = {
  headerAction?: ReactNode;
  node: NodePayload;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

export function BaseNodeCard(props: BaseNodeCardProps) {
  const { headerAction, node } = props;
  const entries = Object.entries(node).filter(
    ([key]) => key !== 'compositeKey',
  );

  return (
    <Card className="gap-3 overflow-hidden rounded-xl bg-white py-4 shadow-sm">
      <CardHeader className="px-4">
        <div className="flex items-start gap-2">
          <div
            className="size-3 rounded-full"
            style={{ backgroundColor: getNodeTypeColor(node.nodeType) }}
          />
          <CardTitle className="text-sm">{node.nodeType}</CardTitle>
          <div className="ml-auto flex items-center gap-1">
            <Badge variant="secondary" className="text-[10px]">
              {node.id.slice(0, 8)}
            </Badge>
            {headerAction}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4">
        <table className="w-full table-fixed text-xs">
          <tbody>
            {entries.map(([key, value]) => (
              <tr
                key={key}
                className="border-b border-neutral-100 last:border-0"
              >
                <td className="w-1/3 py-1 pr-3 whitespace-nowrap text-neutral-500">
                  {startCase(key)}
                </td>
                <td className="truncate py-1 font-medium">
                  {formatValue(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
