import * as Sentry from '@sentry/react';
import { useEffect } from 'react';

import { SomethingWentWrongErrorState } from './SomethingWentWrongErrorState';

type ErrorBoundaryProps = {
  error: Error;
};

export function ErrorBoundary(props: ErrorBoundaryProps) {
  const { error } = props;

  // eslint-disable-next-line no-restricted-syntax -- Sentry needs useEffect for runtime error reporting.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return <SomethingWentWrongErrorState />;
}
