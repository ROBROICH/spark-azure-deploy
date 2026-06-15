import { Input } from '@/features/ui/input/Input';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { useState } from 'react';

export function SubgraphLoaderNodeIdSelect(props: {
  nodeIdItems: { label: string; value: string }[];
  nodesOfTypeCount: number;
  onNodeChange: (value: string) => void;
  selectedNodeId: string;
}) {
  // eslint-disable-next-line no-restricted-syntax -- the search field is ephemeral local text state for filtering the current node-id picker only
  const [searchValue, setSearchValue] = useState('');
  const { nodeIdItems, nodesOfTypeCount, onNodeChange, selectedNodeId } = props;
  const normalizedSearchValue = searchValue.trim().toLocaleLowerCase();
  const filteredNodeIdItems =
    normalizedSearchValue.length === 0
      ? nodeIdItems
      : nodeIdItems.filter((item) =>
          item.value.toLocaleLowerCase().includes(normalizedSearchValue),
        );

  const handleSearchChange = (value: string) => {
    setSearchValue(value);

    const normalizedValue = value.trim().toLocaleLowerCase();
    const matchingItems =
      normalizedValue.length === 0
        ? []
        : nodeIdItems.filter((item) =>
            item.value.toLocaleLowerCase().includes(normalizedValue),
          );

    if (
      matchingItems.length === 1 &&
      matchingItems[0]?.value !== selectedNodeId
    ) {
      const matchingItem = matchingItems[0];
      if (matchingItem) {
        onNodeChange(matchingItem.value);
      }
    }
  };

  return (
    <div className="flex min-w-72 flex-col gap-1">
      <span className="text-xs text-neutral-500">
        Node ID ({nodesOfTypeCount} in graph)
      </span>
      <Input
        type="text"
        value={searchValue}
        onChange={(event) => handleSearchChange(event.target.value)}
        placeholder="Paste or search full node ID"
        className="h-8 bg-white px-2 text-xs"
      />
      <SelectMenu
        items={
          filteredNodeIdItems.length > 0
            ? filteredNodeIdItems
            : [
                {
                  value: '__empty__',
                  label: 'No node IDs match this search.',
                  disabled: true,
                },
              ]
        }
        value={selectedNodeId}
        onChange={onNodeChange}
        placeholder="Select node"
        triggerClassName="h-8 min-w-45 px-2 text-xs"
      />
    </div>
  );
}
