import { diffWordsWithSpace } from 'diff';
import { cn } from '@/features/ui/style/cn';

type LawChangeTextDiffProps = {
  previousText: string;
  nextText: string;
  mode: 'old' | 'new';
  className?: string;
};

type DiffPart = ReturnType<typeof diffWordsWithSpace>[number];

type TextDiffSegment = {
  value: string;
  isChanged: boolean;
};

const getVisibleSegments = (
  part: DiffPart,
  mode: LawChangeTextDiffProps['mode'],
): TextDiffSegment[] => {
  if (!part.added && !part.removed) {
    return [{ value: part.value, isChanged: false }];
  }

  const isVisibleChange =
    (mode === 'old' && part.removed) || (mode === 'new' && part.added);

  if (!isVisibleChange) {
    return [];
  }

  return [{ value: part.value, isChanged: true }];
};

export function LawChangeTextDiff(props: LawChangeTextDiffProps) {
  const { previousText, nextText, mode, className } = props;
  const segments = diffWordsWithSpace(previousText, nextText).flatMap((part) =>
    getVisibleSegments(part, mode),
  );

  return (
    <p
      className={cn(
        'px-1 text-[13px] leading-[18px] font-normal tracking-[-0.13px] break-words whitespace-pre-wrap text-neutral-700',
        className,
      )}
    >
      {segments.map((segment, index) => (
        <span
          key={`${mode}-${index}-${segment.value}`}
          className={cn(
            segment.isChanged &&
              mode === 'old' &&
              'rounded-sm bg-red-200 px-0.5 text-red-900 line-through decoration-red-900/50',
            segment.isChanged &&
              mode === 'new' &&
              'rounded-sm bg-green-200 px-0.5 text-green-900',
          )}
        >
          {segment.value}
        </span>
      ))}
    </p>
  );
}
