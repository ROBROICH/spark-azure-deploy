import { cn } from '@/features/ui/style/cn';
import { formatCellValue } from './auditLogDisplay.logic';

type PositionalDiffProps = {
  oldVal: unknown;
  newVal: unknown;
  mode: 'old' | 'new';
};

/**
 * Highlights positional character changes for compact audit cells; this is a
 * display diff and not a semantic JSON diff.
 *
 * @param props Old/new values plus the side currently being rendered.
 * @returns Inline text segments with changed ranges highlighted.
 */
export const PositionalDiff = (props: PositionalDiffProps) => {
  const { oldVal, newVal, mode } = props;
  const oldStr = String(formatCellValue(oldVal));
  const newStr = String(formatCellValue(newVal));
  if (oldStr === newStr) {
    return <span>{oldStr}</span>;
  }

  const maxLength = Math.max(oldStr.length, newStr.length);
  const segments: { text: string; isDifferent: boolean }[] = [];

  for (let i = 0; i < maxLength; i++) {
    const charOld = oldStr[i];
    const charNew = newStr[i];
    const charToShow = mode === 'old' ? charOld : charNew;

    if (!charToShow) {
      continue;
    }

    const isDifferent = charOld !== charNew;
    const previousSegment = segments.at(-1);
    if (previousSegment?.isDifferent === isDifferent) {
      previousSegment.text += charToShow;
      continue;
    }

    segments.push({ text: charToShow, isDifferent });
  }

  return (
    <span className="break-all">
      {segments.map((segment, index) => (
        <span
          key={index}
          className={cn(
            segment.isDifferent &&
              mode === 'old' &&
              'rounded-sm bg-red-200 px-0.5 text-red-900 line-through decoration-red-900/50',
            segment.isDifferent &&
              mode === 'new' &&
              'rounded-sm bg-green-200 px-0.5 text-green-900',
          )}
        >
          {segment.text}
        </span>
      ))}
    </span>
  );
};
