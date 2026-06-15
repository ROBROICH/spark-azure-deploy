import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { Button } from '../button/Button';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from './Popover';

export const PopoverStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Popover"
      description="Popover primitive styled for the new popup surface."
    >
      <Story.Section title="Default">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm">
              Popover öffnen
            </Button>
          </PopoverTrigger>
          <PopoverContent className="max-w-64">
            <div className="space-y-3">
              <p className="text-body-s text-neutral-300">
                Neue Popup-Fläche für kompakte Zusatzinformationen.
              </p>
              <PopoverClose asChild>
                <Button variant="secondary" size="sm">
                  Schließen
                </Button>
              </PopoverClose>
            </div>
          </PopoverContent>
        </Popover>
      </Story.Section>
    </Story>
  );
};

PopoverStory.storyTitle = 'Popover';
