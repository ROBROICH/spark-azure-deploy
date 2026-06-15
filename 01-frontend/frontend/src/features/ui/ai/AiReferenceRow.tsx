import { File, ScanSearch } from 'lucide-react';

type AiReferenceRowProps = {
  item:
    | { type: 'document'; label: string }
    | { type: 'passage'; label: string; page: string };
  onClick?: () => void;
};

export function AiReferenceRow(props: AiReferenceRowProps) {
  const { item, onClick } = props;
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
      <span className="min-w-0 flex-1 truncate text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-700">
        {item.label}
      </span>
      {item.type === 'passage' ? (
        <span className="shrink-0 text-[11px] leading-[14px] tracking-[0.02em] text-slate-700">
          {item.page}
        </span>
      ) : null}
    </>
  );

  if (isInteractive) {
    return (
      <div role="listitem" className="flex">
        <button
          type="button"
          className="focus-ring flex w-full items-center gap-2 py-1 pr-3 pl-1 text-left transition-colors hover:bg-slate-100"
          onClick={onClick}
        >
          {innerContent}
        </button>
      </div>
    );
  }

  return (
    <div
      role="listitem"
      className="flex items-center gap-2 py-1 pr-3 pl-1 text-left"
    >
      {innerContent}
    </div>
  );
}
