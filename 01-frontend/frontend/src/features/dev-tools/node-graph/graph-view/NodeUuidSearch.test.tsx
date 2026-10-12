import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { NodeSummary } from '@/db/nodes/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeUuidSearch } from './NodeUuidSearch';

const firstNode: NodeSummary = {
  frontendParentIds: [],
  id: '11111111-1111-1111-1111-111111111111',
  nodeType: 'satz',
  parents: [],
};

const secondNode: NodeSummary = {
  frontendParentIds: [],
  id: '22222222-2222-2222-2222-222222222222',
  nodeType: 'argument',
  parents: [],
};

const nodeById = new Map([
  [firstNode.id, firstNode],
  [secondNode.id, secondNode],
]);

afterEach(cleanup);

const renderSearch = (selectedNodeId: string) => {
  const onClear = vi.fn();
  const onSelectNode = vi.fn();
  const view = render(
    <NodeUuidSearch
      label="Find node by UUID"
      nodeById={nodeById}
      onClear={onClear}
      onSelectNode={onSelectNode}
      placeholder="Paste any node UUID"
      selectedNodeId={selectedNodeId}
    />,
  );

  return { ...view, onClear, onSelectNode };
};

describe('NodeUuidSearch', () => {
  it('keeps a partial replacement UUID visible after clearing the selected route node', async () => {
    const user = userEvent.setup();
    const view = renderSearch(firstNode.id);
    const input = screen.getByPlaceholderText('Paste any node UUID');

    await user.clear(input);
    await user.type(input, 'x');

    expect(view.onClear).toHaveBeenCalled();

    view.rerender(
      <NodeUuidSearch
        label="Find node by UUID"
        nodeById={nodeById}
        onClear={view.onClear}
        onSelectNode={view.onSelectNode}
        placeholder="Paste any node UUID"
        selectedNodeId=""
      />,
    );

    expect(input).toHaveValue('x');
  });

  it('adopts a new external selection', async () => {
    const view = renderSearch(firstNode.id);
    const input = screen.getByPlaceholderText('Paste any node UUID');

    view.rerender(
      <NodeUuidSearch
        label="Find node by UUID"
        nodeById={nodeById}
        onClear={view.onClear}
        onSelectNode={view.onSelectNode}
        placeholder="Paste any node UUID"
        selectedNodeId={secondNode.id}
      />,
    );

    await waitFor(() => expect(input).toHaveValue(secondNode.id));
  });
});
