import { Accessibility } from '@/features/app-info/accessibility/Accessibility';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/barrierefreiheit/')({
  component: AccessibilityPage,
});

function AccessibilityPage() {
  return <Accessibility />;
}
