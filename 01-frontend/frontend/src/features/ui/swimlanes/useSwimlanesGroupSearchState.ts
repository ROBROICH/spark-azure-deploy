import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  getSwimlanesGroupDefaultValue,
  getSwimlanesGroupSearchKey,
  type SwimlanesGroupSearchSchema,
} from './swimlanes.search';

/**
 * Bridges a Swimlanes.Group search schema to TanStack Router search params.
 *
 * @param searchSchema Schema created via `createSwimlanesGroupSearchSchema`.
 * @returns `value` and `onValueChange` props ready to spread onto `Swimlanes.Group`.
 */
export const useSwimlanesGroupSearchState = <
  TSchema extends SwimlanesGroupSearchSchema,
>(
  searchSchema: TSchema,
) => {
  const navigate = useNavigate();
  const search = useSearch({
    strict: false,
    structuralSharing: false,
  });

  const searchParamKey = getSwimlanesGroupSearchKey(searchSchema);
  const defaultTab = getSwimlanesGroupDefaultValue(searchSchema);

  const parsedSearch = searchSchema.safeParse(search);
  const value = parsedSearch.success
    ? (parsedSearch.data[searchParamKey] as string)
    : defaultTab;

  const onValueChange = (nextValue: string) => {
    const parsedNextSearch = searchSchema.safeParse({
      [searchParamKey]: nextValue,
    });

    if (!parsedNextSearch.success) {
      return;
    }

    const nextSearchValue = parsedNextSearch.data[searchParamKey];

    navigate({
      // @ts-expect-error -- TanStack Router infers search from the full route tree; the dynamic key from the schema cannot satisfy that union. The Zod schema validates the value at runtime.
      search: (prev) => ({
        ...prev,
        [searchParamKey]:
          nextSearchValue === defaultTab ? undefined : nextSearchValue,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  return { value, onValueChange };
};
