import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { Label } from '../label/Label';
import { FieldLegend, FieldSet } from '../form/field';
import { RadioGroup, RadioGroupItem } from './RadioGroup';

export const RadioGroupStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Radio Group"
      description="Radio groups let users pick one option from a set."
    >
      <Story.Section title="Default">
        <FieldSet>
          <FieldLegend>Default options</FieldLegend>
          <RadioGroup defaultValue="option-1">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="option-1" id="rg-opt-1" />
              <Label htmlFor="rg-opt-1">Option 1</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="option-2" id="rg-opt-2" />
              <Label htmlFor="rg-opt-2">Option 2</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="option-3" id="rg-opt-3" />
              <Label htmlFor="rg-opt-3">Option 3</Label>
            </div>
          </RadioGroup>
        </FieldSet>
      </Story.Section>
      <Story.Section title="Disabled">
        <FieldSet>
          <FieldLegend>Disabled options</FieldLegend>
          <RadioGroup defaultValue="option-1" disabled>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="option-1" id="rg-dis-1" />
              <Label htmlFor="rg-dis-1">Disabled selected</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="option-2" id="rg-dis-2" />
              <Label htmlFor="rg-dis-2">Disabled unselected</Label>
            </div>
          </RadioGroup>
        </FieldSet>
      </Story.Section>
    </Story>
  );
};
RadioGroupStory.storyTitle = 'Radio Group';
