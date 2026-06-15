import {
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import type React from 'react';

type TeamMemberDialogContentProps = {
  children: React.ReactNode;
  footer: React.ReactNode;
  formId: string;
  onSubmit: () => void;
  title: string;
};

export function TeamMemberDialogContent(props: TeamMemberDialogContentProps) {
  const { children, footer, formId, onSubmit, title } = props;

  return (
    <DialogContent
      showCloseButton
      className="max-h-[85dvh] overflow-hidden"
      innerClassName="max-h-[calc(85dvh-0.5rem)]"
    >
      <DialogHeader className="shrink-0">
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <DialogBody className="max-h-[calc(85dvh-7rem)] min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="flex flex-col gap-4"
        >
          {children}
        </form>
      </DialogBody>
      {footer}
    </DialogContent>
  );
}
