import type { RefObject } from 'react';

const INVALID_FORM_CONTROL_SELECTOR = [
  'input[aria-invalid="true"]:not(:disabled)',
  'textarea[aria-invalid="true"]:not(:disabled)',
  'select[aria-invalid="true"]:not(:disabled)',
  'button[aria-invalid="true"]:not(:disabled)',
  '[role="combobox"][aria-invalid="true"]:not(:disabled)',
].join(',');

export function focusFirstInvalidFormControl(
  formRef: RefObject<HTMLFormElement | null>,
): void {
  window.setTimeout(() => {
    const form = formRef.current;
    if (!form?.isConnected) {
      return;
    }

    const control = form.querySelector<HTMLElement>(
      INVALID_FORM_CONTROL_SELECTOR,
    );
    if (!control) {
      return;
    }

    control.focus();
  }, 0);
}
