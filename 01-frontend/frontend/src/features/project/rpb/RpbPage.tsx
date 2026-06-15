import { lazy, Suspense } from 'react';
import { RpbPdfPopoutScopeRegistration } from './pdf-view-swimlane/RpbPdfPopoutScopeRegistration';
import { RpbSwimlanes } from './rpb.swimlanes';

const RpbFeedbackDialogMount = lazy(() =>
  import('./feedback-dialog/RpbFeedbackDialogMount').then((module) => ({
    default: module.RpbFeedbackDialogMount,
  })),
);

export const RpbPage = () => {
  return (
    <>
      <Suspense fallback={null}>
        <RpbPdfPopoutScopeRegistration />
      </Suspense>
      <Suspense fallback={null}>
        <RpbFeedbackDialogMount />
      </Suspense>
      <RpbSwimlanes />
    </>
  );
};
