import { isDevModeEnabled } from '@/features/dev-mode/useDevMode';
import { createFileRoute, notFound } from '@tanstack/react-router';
import { DesignSystem } from '../../features/dev-tools/design-system/DesignSystem';

export const Route = createFileRoute('/design-system/')({
  beforeLoad: () => {
    if (!isDevModeEnabled()) {
      throw notFound();
    }
  },
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <main>
      <DesignSystem />
    </main>
  );
}
