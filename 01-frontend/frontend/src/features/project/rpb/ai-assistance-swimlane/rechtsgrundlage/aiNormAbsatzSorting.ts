import type { NodeRefByType } from '@/db/nodes/types';

const absatzNumberCollator = new Intl.Collator('de', {
  numeric: true,
  sensitivity: 'base',
});

type SortableAbsatz = {
  absatzNr: string;
  id: string;
};

export const sortAbsatzRefsByNumber = (
  absatzRefs: NodeRefByType<'absatz'>[],
  absaetze: SortableAbsatz[],
) => {
  const originalIndexById = new Map(
    absatzRefs.map((absatzRef, index) => [absatzRef.id, index]),
  );
  const absatzById = new Map(absaetze.map((absatz) => [absatz.id, absatz]));

  return [...absatzRefs].sort((left, right) => {
    const leftAbsatz = absatzById.get(left.id);
    const rightAbsatz = absatzById.get(right.id);

    if (leftAbsatz && rightAbsatz) {
      const absatzComparison = absatzNumberCollator.compare(
        leftAbsatz.absatzNr,
        rightAbsatz.absatzNr,
      );

      if (absatzComparison !== 0) {
        return absatzComparison;
      }

      return left.id.localeCompare(right.id, 'de');
    }

    if (leftAbsatz) {
      return -1;
    }

    if (rightAbsatz) {
      return 1;
    }

    return (
      (originalIndexById.get(left.id) ?? 0) -
      (originalIndexById.get(right.id) ?? 0)
    );
  });
};
