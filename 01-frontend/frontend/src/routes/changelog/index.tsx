import { Changelog } from '@/features/app-info/changelog/Changelog';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/changelog/')({
  component: Changelog,
});
