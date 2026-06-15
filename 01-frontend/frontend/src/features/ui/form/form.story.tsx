import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from './field';
import { Input } from '@/features/ui/input/Input';
import { Textarea } from './textarea';

export const FormStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Form Elements"
      description="Field, input, and textarea building blocks."
    >
      <Story.Section
        title="Field"
        contentClassName="flex flex-col gap-6 max-w-sm"
      >
        <Field>
          <FieldLabel htmlFor="field-name">Name</FieldLabel>
          <Input id="field-name" placeholder="Enter your name" />
        </Field>
        <Field>
          <FieldLabel htmlFor="field-email">Email</FieldLabel>
          <FieldContent>
            <Input
              id="field-email"
              type="email"
              placeholder="name@example.com"
              aria-describedby="field-email-description"
            />
            <FieldDescription id="field-email-description">
              We'll never share your email.
            </FieldDescription>
          </FieldContent>
        </Field>
        <Field data-invalid="true">
          <FieldLabel htmlFor="field-error">With error</FieldLabel>
          <FieldContent>
            <Input
              id="field-error"
              aria-invalid="true"
              aria-describedby="field-error-message"
            />
            <FieldError id="field-error-message">
              This field is required.
            </FieldError>
          </FieldContent>
        </Field>
      </Story.Section>

      <Story.Section
        title="Textarea"
        contentClassName="flex flex-col gap-4 max-w-sm"
      >
        <Field>
          <FieldLabel htmlFor="textarea-default">Default</FieldLabel>
          <Textarea id="textarea-default" placeholder="Default" />
        </Field>
        <Field>
          <FieldLabel htmlFor="textarea-disabled">Disabled</FieldLabel>
          <Textarea id="textarea-disabled" placeholder="Disabled" disabled />
        </Field>
        <Field data-invalid="true">
          <FieldLabel htmlFor="textarea-invalid">Invalid</FieldLabel>
          <Textarea
            id="textarea-invalid"
            placeholder="Invalid"
            aria-invalid="true"
            aria-describedby="textarea-invalid-error"
          />
          <FieldError id="textarea-invalid-error">
            This field is invalid.
          </FieldError>
        </Field>
      </Story.Section>
    </Story>
  );
};
FormStory.storyTitle = 'Form Elements';
