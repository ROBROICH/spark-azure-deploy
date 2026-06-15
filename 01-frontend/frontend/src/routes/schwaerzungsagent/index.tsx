import { Schwaerzungsagent } from '@/features/schwaerzungsagent/Schwaerzungsagent';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/schwaerzungsagent/')({
  component: Schwaerzungsagent,
});
