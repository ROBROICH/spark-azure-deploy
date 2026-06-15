import { formatCellValue } from './auditLogDisplay.logic';

export function AuditLogMetadataItem(props: {
  label: string;
  value: string | number | null | undefined;
}) {
  const { label, value } = props;

  if (value === null || value === undefined || value === '') {
    return null;
  }

  return (
    <div className="min-w-0 rounded-md bg-neutral-50 px-3 py-2">
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div className="mt-0.5 break-all text-neutral-900">
        {formatCellValue(value)}
      </div>
    </div>
  );
}
