import { File, ScanSearch } from 'lucide-react';
import type { ReactNode } from 'react';

type AiReferenceRowProps = {
  item:
    | { type: 'document'; label: string }
    | { type: 'passage'; label: string; page: string };
  onClick?: () => void;
  /** Rendered after the row, outside the interactive area, inside the list item. */
  trailing?: ReactNode;
  /** Rendered next to the label, inside the interactive area. Must not be interactive itself. */
  afterTitle?: ReactNode;
  /** Overrides the label colour, for rows the caller wants to recede. */
  labelClassName?: string;
};

export function AiReferenceRow(props: AiReferenceRowProps) {
  const { item, onClick, trailing, afterTitle, labelClassName } = props;
  const isDocument = item.type === 'document';
  const isInteractive = onClick !== undefined;

  const innerContent = (
    <>
      <span className="flex items-center rounded-[4px] p-1">
        {isDocument ? (
          <File className="size-4 text-slate-600" aria-hidden="true" />
        ) : (
          <ScanSearch className="size-4 text-slate-600" aria-hidden="true" />
        )}
      </span>
      {/* Truncation sits on the text, not on the group, so a marker after the
          label stays visible however long the label is. */}
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span
          className={`truncate text-[11px] leading-[14px] font-medium tracking-[0.02em] ${labelClassName ?? 'text-slate-700'}`}
        >
          {item.label}
        </span>
        {afterTitle}
      </span>
      {item.type === 'passage' ? (
        <span className="shrink-0 text-[11px] leading-[14px] tracking-[0.02em] text-slate-700">
          {item.page}
        </span>
      ) : null}
    </>
  );

  const trailingContent = trailing ? (
    <div className="flex shrink-0 items-center pr-1">{trailing}</div>
  ) : null;

  if (isInteractive) {
    return (
      <div role="listitem" className="flex">
        <button
          type="button"
          className="focus-ring flex min-w-0 flex-1 items-center gap-2 py-1 pr-3 pl-1 text-left transition-colors hover:bg-slate-100"
          onClick={onClick}
        >
          {innerContent}
        </button>
        {trailingContent}
      </div>
    );
  }

  return (
    <div role="listitem" className="flex">
      <div className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-3 pl-1 text-left">
        {innerContent}
      </div>
      {trailingContent}
    </div>
  );
}
