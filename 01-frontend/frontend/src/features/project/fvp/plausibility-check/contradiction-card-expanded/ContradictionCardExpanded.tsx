import type { ContradictionListItem } from '../data/read-model/useContradictions';
import { ComparisonTable } from './ComparisonTable';
import { ContradictionActions } from './ContradictionActions';

type ContradictionCardExpandedProps = {
  contradiction: ContradictionListItem;
};

export const ContradictionCardExpanded = (
  props: ContradictionCardExpandedProps,
) => {
  const { contradiction } = props;
  const showActions =
    contradiction.status === 'OPEN' || contradiction.status === 'IGNORED';

  return (
    <div className="flex flex-col gap-2">
      <div>
        <ComparisonTable contradiction={contradiction} />
      </div>
      {showActions && <ContradictionActions contradiction={contradiction} />}
    </div>
  );
};
