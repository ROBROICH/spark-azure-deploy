import { cva, type VariantProps } from 'class-variance-authority';

import { Label } from '@/features/ui/label/Label';
import { cn } from '@/features/ui/style/cn';

function FieldSet(props: React.ComponentProps<'fieldset'>) {
  const { className, ...rest } = props;

  return (
    <fieldset
      data-slot="field-set"
      className={cn(
        'flex flex-col gap-6',
        'has-[>[data-slot=checkbox-group]]:gap-3 has-[>[data-slot=radio-group]]:gap-3',
        className,
      )}
      {...rest}
    />
  );
}

function FieldLegend(
  props: React.ComponentProps<'legend'> & { variant?: 'legend' | 'label' },
) {
  const { className, variant = 'legend', ...rest } = props;

  return (
    <legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        'mb-3 font-medium',
        'data-[variant=legend]:text-base',
        'data-[variant=label]:text-sm',
        className,
      )}
      {...rest}
    />
  );
}

function FieldGroup(props: React.ComponentProps<'div'>) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="field-group"
      className={cn(
        'group/field-group @container/field-group flex w-full flex-col gap-7 data-[slot=checkbox-group]:gap-3 *:data-[slot=field-group]:gap-4',
        className,
      )}
      {...rest}
    />
  );
}

const fieldVariants = cva(
  'group/field flex w-full gap-3 data-[invalid=true]:text-destructive',
  {
    variants: {
      orientation: {
        vertical: ['flex-col [&>*]:w-full [&>.sr-only]:w-auto'],
        horizontal: [
          'flex-row items-center',
          '[&>[data-slot=field-label]]:flex-auto',
          'has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
        ],
        responsive: [
          'flex-col @md/field-group:flex-row @md/field-group:items-center [&>*]:w-full @md/field-group:[&>*]:w-auto [&>.sr-only]:w-auto',
          '@md/field-group:[&>[data-slot=field-label]]:flex-auto',
          '@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
        ],
      },
    },
    defaultVariants: {
      orientation: 'vertical',
    },
  },
);

function Field(
  props: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>,
) {
  const { className, orientation = 'vertical', ...rest } = props;

  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...rest}
    />
  );
}

function FieldContent(props: React.ComponentProps<'div'>) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="field-content"
      className={cn(
        'group/field-content flex flex-1 flex-col gap-1.5 leading-snug',
        className,
      )}
      {...rest}
    />
  );
}

function FieldLabel(props: React.ComponentProps<typeof Label>) {
  const { className, ...rest } = props;

  return (
    <Label
      data-slot="field-label"
      className={cn(
        'group/field-label peer/field-label flex w-fit gap-2 group-data-[disabled=true]/field:opacity-50',
        'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-md has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4',
        'has-data-[state=checked]:bg-primary/5 has-data-[state=checked]:border-primary dark:has-data-[state=checked]:bg-primary/10',
        className,
      )}
      {...rest}
    />
  );
}

function FieldTitle(props: React.ComponentProps<'div'>) {
  const { className, ...rest } = props;

  return (
    <div
      data-slot="field-label"
      className={cn(
        'flex w-fit items-center gap-2 text-sm leading-snug font-medium group-data-[disabled=true]/field:opacity-50',
        className,
      )}
      {...rest}
    />
  );
}

function FieldDescription(props: React.ComponentProps<'p'>) {
  const { className, ...rest } = props;

  return (
    <p
      data-slot="field-description"
      className={cn(
        'text-muted-foreground text-sm leading-normal font-normal group-has-data-[orientation=horizontal]/field:text-balance',
        'last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-1.5',
        '[&>a:hover]:text-primary [&>a]:underline [&>a]:underline-offset-4',
        className,
      )}
      {...rest}
    />
  );
}

function FieldError(
  props: React.ComponentProps<'div'> & {
    announce?: boolean;
    errors?: ({ message?: string } | undefined)[];
  },
) {
  const { announce = true, className, children, errors, role, ...rest } = props;
  let content = children;

  if (!content && errors?.length) {
    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ];

    content =
      uniqueErrors.length === 1 ? (
        uniqueErrors[0]?.message
      ) : (
        <ul className="ml-4 flex list-disc flex-col gap-1">
          {uniqueErrors.map(
            (error, index) =>
              error?.message && <li key={index}>{error.message}</li>,
          )}
        </ul>
      );
  }

  if (!content) {
    return null;
  }

  return (
    <div
      role={announce ? (role ?? 'alert') : role}
      data-slot="field-error"
      className={cn('text-sm font-normal text-error-900', className)}
      {...rest}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
};
