import { Button } from '@/features/ui/button/Button';
import { ThumbsDown, ThumbsUp } from 'lucide-react';

export type FeedbackThumbRating = 'positive' | 'negative' | null;

type FeedbackThumbButtonsProps = {
  disabled?: boolean;
  rating: FeedbackThumbRating;
  thumbsUpAriaLabel: string;
  thumbsDownAriaLabel: string;
  onRate: (rating: FeedbackThumbRating) => void;
};

/**
 * A pair of ghost-light icon-only toggle buttons for positive/negative feedback.
 * The selected button fills its icon and pins to slate-600.
 *
 * @param props Current rating, aria labels, and rating change handler.
 * @returns Two thumb icon buttons with filled/unfilled pressed state.
 */
export function FeedbackThumbButtons(props: FeedbackThumbButtonsProps) {
  const {
    disabled = false,
    rating,
    thumbsUpAriaLabel,
    thumbsDownAriaLabel,
    onRate,
  } = props;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost-light"
        size="xs"
        iconOnly
        aria-label={thumbsUpAriaLabel}
        aria-pressed={rating === 'positive'}
        disabled={disabled}
        onClick={() => onRate('positive')}
        className={rating === 'positive' ? 'text-slate-600' : ''}
      >
        <ThumbsUp
          aria-hidden="true"
          className={rating === 'positive' ? 'fill-current' : ''}
        />
      </Button>
      <Button
        variant="ghost-light"
        size="xs"
        iconOnly
        aria-label={thumbsDownAriaLabel}
        aria-pressed={rating === 'negative'}
        disabled={disabled}
        onClick={() => onRate('negative')}
        className={rating === 'negative' ? 'text-slate-600' : ''}
      >
        <ThumbsDown
          aria-hidden="true"
          className={rating === 'negative' ? 'fill-current' : ''}
        />
      </Button>
    </div>
  );
}
