import { MoreVertical } from 'lucide-react';
import { Button } from '../button/Button';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '../action-menu/ActionMenu';

// Shared story helper for card action menus.
// Both ArgumentCard and NormCard stories use the same menu layout intentionally.
export const SampleCardMenu = () => (
  <ActionMenu>
    <ActionMenuTrigger asChild>
      <Button
        variant="ghost-light"
        iconOnly
        size="xs"
        aria-label="Weitere Aktionen"
      >
        <MoreVertical aria-hidden="true" />
      </Button>
    </ActionMenuTrigger>
    <ActionMenuContent align="end">
      <ActionMenuItem>Bearbeiten</ActionMenuItem>
      <ActionMenuItem>Entfernen</ActionMenuItem>
    </ActionMenuContent>
  </ActionMenu>
);
