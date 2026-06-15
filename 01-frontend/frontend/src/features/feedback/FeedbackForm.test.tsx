import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FeedbackDialogFrame } from './FeedbackDialogFrame';
import { FeedbackForm } from './FeedbackForm';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'FeedbackDialog.cancel': 'Abbrechen',
        'FeedbackDialog.feedbackLabel': 'Feedback',
        'FeedbackDialog.feedbackPlaceholder': 'Feedbackinhalt',
        'FeedbackDialog.feedbackVisibilityNote': 'Andere sehen Feedback.',
        'FeedbackDialog.qualityQuestion': 'Wie bewerten Sie das KI-Ergebnis?',
        'FeedbackDialog.ratingQuestion': 'Sind Sie zufrieden?',
        'FeedbackDialog.reasonRequired': 'Bitte wählen Sie eine Bewertung aus.',
        'FeedbackDialog.textMaxLength':
          'Feedback darf höchstens 500 Zeichen enthalten.',
        'FeedbackDialog.reason.QUESTION_MISMATCH':
          'Passt nicht zur Fragestellung',
        'FeedbackDialog.reason.RESULT_CORRECT': 'Ergebnis ist korrekt',
        'FeedbackDialog.reason.RESULT_NOT_CORRECT': 'Ergebnis ist inkorrekt',
        'FeedbackDialog.reason.TOO_GENERAL': 'Inhalt ist zu allgemein',
        'FeedbackDialog.reason.TOO_SPECIFIC': 'Inhalt ist zu spezifisch',
        'FeedbackDialog.reason.WRONG_CONTEXT':
          'Bezieht sich auf einen anderen Kontext',
        'FeedbackDialog.save': 'Speichern',
        'FeedbackDialog.title': 'Feedback',
        'FeedbackDialog.unzufrieden': 'Unzufrieden',
        'FeedbackDialog.zufrieden': 'Zufrieden',
        'FeedbackDialog.delete': 'Feedback löschen',
        'FeedbackDialog.confirmDelete': 'Bestätigen?',
      };

      return translations[key] ?? key;
    },
  }),
}));

function TestFeedbackFormDialog(
  props: ComponentProps<typeof FeedbackForm> & {
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
  },
) {
  const {
    namespace,
    onOpenChange = () => undefined,
    open = true,
    ...contentProps
  } = props;

  return (
    <FeedbackDialogFrame
      open={open}
      namespace={namespace}
      descriptionKey="FeedbackDialog.ratingQuestion"
      onOpenChange={onOpenChange}
    >
      <FeedbackForm {...contentProps} namespace={namespace} />
    </FeedbackDialogFrame>
  );
}

const createDeferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
};

describe('FeedbackForm', () => {
  afterEach(cleanup);

  it('shows negative reasons and saves one uppercase reason value', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSave = vi.fn();

    render(
      <TestFeedbackFormDialog
        initialRating="negative"
        initialReason={null}
        initialText={null}
        namespace="FeedbackDialog"
        onClose={onClose}
        onSave={onSave}
      />,
    );

    await user.click(
      screen.getByRole('radio', { name: 'Ergebnis ist inkorrekt' }),
    );
    await user.type(screen.getByRole('textbox'), 'Details');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith({
      rating: 'negative',
      reason: 'RESULT_NOT_CORRECT',
      text: 'Details',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows an error when saving without a selected reason', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <TestFeedbackFormDialog
        initialRating="negative"
        initialReason="RESULT_CORRECT"
        initialText={null}
        namespace="FeedbackDialog"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText('Bitte wählen Sie eine Bewertung aus.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radiogroup', {
        name: 'Wie bewerten Sie das KI-Ergebnis?',
      }),
    ).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows save loading and disables the rest of the form while saving', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const saveDeferred = createDeferred();
    const onSave = vi.fn(() => saveDeferred.promise);

    render(
      <TestFeedbackFormDialog
        initialRating="positive"
        initialReason={null}
        initialText={null}
        namespace="FeedbackDialog"
        onClose={onClose}
        onSave={onSave}
      />,
    );

    await user.click(
      screen.getByRole('radio', { name: 'Ergebnis ist korrekt' }),
    );
    await user.type(screen.getByRole('textbox'), 'Details');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const saveButton = screen.getByRole('button', { name: 'Speichern' });
    expect(saveButton).toBeDisabled();
    expect(saveButton).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zufrieden' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Unzufrieden' })).toBeDisabled();
    expect(
      screen.getByRole('radio', { name: 'Ergebnis ist korrekt' }),
    ).toBeDisabled();
    expect(screen.getByRole('textbox')).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      saveDeferred.resolve();
      await saveDeferred.promise;
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets the selected reason when changing the rating', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <TestFeedbackFormDialog
        initialRating="negative"
        initialReason="RESULT_NOT_CORRECT"
        initialText={null}
        namespace="FeedbackDialog"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Zufrieden' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText('Bitte wählen Sie eine Bewertung aus.'),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('radio', { name: 'Ergebnis ist korrekt' }),
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith({
      rating: 'positive',
      reason: 'RESULT_CORRECT',
      text: null,
    });
  });

  it('shows and recovers from oversized server text validation', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const oversizedText = 'a'.repeat(501);

    render(
      <TestFeedbackFormDialog
        initialRating="positive"
        initialReason="RESULT_CORRECT"
        initialText={oversizedText}
        namespace="FeedbackDialog"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    const textField = screen.getByRole('textbox');

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const textError = screen.getByRole('alert');
    expect(onSave).not.toHaveBeenCalled();
    expect(textField).toHaveAttribute('aria-invalid', 'true');
    expect(textField).toHaveAttribute(
      'aria-describedby',
      'feedback-dialog-text-visibility-note feedback-dialog-text-error',
    );
    expect(screen.getByText('Andere sehen Feedback.')).toHaveAttribute(
      'id',
      'feedback-dialog-text-visibility-note',
    );
    expect(textError).toHaveAttribute('id', 'feedback-dialog-text-error');
    expect(textError).toHaveTextContent(
      'Feedback darf höchstens 500 Zeichen enthalten.',
    );

    await user.clear(textField);
    await user.type(textField, 'Recovered text');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith({
      rating: 'positive',
      reason: 'RESULT_CORRECT',
      text: 'Recovered text',
    });
  });

  it('exposes a real radio group with an accessible name, arrow-key roving focus, and keyboard selection', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();

    render(
      <TestFeedbackFormDialog
        initialRating="negative"
        initialReason={null}
        initialText={null}
        namespace="FeedbackDialog"
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    // The reason options must form a single group with a programmatic name.
    expect(
      screen.getByRole('radiogroup', {
        name: 'Wie bewerten Sie das KI-Ergebnis?',
      }),
    ).toBeInTheDocument();

    const firstReason = screen.getByRole('radio', {
      name: 'Ergebnis ist inkorrekt',
    });
    const secondReason = screen.getByRole('radio', {
      name: 'Bezieht sich auf einen anderen Kontext',
    });

    await user.click(firstReason);
    expect(firstReason).toHaveAttribute('aria-checked', 'true');
    expect(secondReason).toHaveAttribute('aria-checked', 'false');
    expect(firstReason).toHaveFocus();

    // Arrow keys move roving focus across the radios.
    await user.keyboard('{ArrowRight}');
    expect(secondReason).toHaveFocus();

    // The focused radio can be selected from the keyboard, updating the
    // programmatic checked state and the bound form field.
    await user.keyboard(' ');
    expect(secondReason).toHaveAttribute('aria-checked', 'true');
    expect(firstReason).toHaveAttribute('aria-checked', 'false');

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(onSave).toHaveBeenCalledWith({
      rating: 'negative',
      reason: 'WRONG_CONTEXT',
      text: null,
    });
  });

  it('requires a second delete click before deleting feedback', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const onClose = vi.fn();

    render(
      <TestFeedbackFormDialog
        initialRating="positive"
        initialReason="RESULT_CORRECT"
        initialText="Details"
        namespace="FeedbackDialog"
        onDelete={onDelete}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Feedback löschen' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(
      screen.getByRole('button', { name: 'Bestätigen?' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bestätigen?' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes immediately and deletes feedback in the background on confirm', async () => {
    const user = userEvent.setup();
    const deleteDeferred = createDeferred();
    const onDelete = vi.fn(() => deleteDeferred.promise);
    const onClose = vi.fn();

    render(
      <TestFeedbackFormDialog
        initialRating="positive"
        initialReason="RESULT_CORRECT"
        initialText="Details"
        namespace="FeedbackDialog"
        onDelete={onDelete}
        onClose={onClose}
        onSave={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Feedback löschen' }));
    await user.click(screen.getByRole('button', { name: 'Bestätigen?' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);

    await act(async () => {
      deleteDeferred.resolve();
      await deleteDeferred.promise;
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
