import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileProcessingStatusAlert } from './FileProcessingStatusAlert';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('FileProcessingStatusAlert', () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the reason for a known ZIP failure code', () => {
    render(
      <FileProcessingStatusAlert
        status="error"
        dismissKey="zip-1"
        workflowFailureCode="ZIP_ENCRYPTED"
      />,
    );

    expect(
      screen.getByText('Documents.processingFailureReasons.ZIP_ENCRYPTED'),
    ).toBeTruthy();
  });

  it('shows the generic description without a failure code', () => {
    render(
      <FileProcessingStatusAlert
        status="error"
        dismissKey="zip-1"
        workflowFailureCode={null}
      />,
    );

    expect(
      screen.getByText('Documents.processingError.description'),
    ).toBeTruthy();
  });
});
