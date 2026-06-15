import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import { StepSelect } from './StepSelect';

const options = [
  {
    value: 'fvp',
    code: '1',
    title: 'Formale Vollständigkeitsprüfung',
    to: '/verfahren/$verfahrenId/fvp/documents',
    params: { verfahrenId: 'demo' },
  },
  {
    value: 'mvp',
    code: '2',
    title: 'Materielle Vollständigkeitsprüfung',
    to: '/verfahren/$verfahrenId/mvp',
    params: { verfahrenId: 'demo' },
  },
  {
    value: 'ewms',
    code: '3',
    title: 'Behörden- und Öffentlichkeitsbeteiligung',
    to: '/verfahren/$verfahrenId/ewms',
    params: { verfahrenId: 'demo' },
  },
] as const;

export const StepSelectStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Step Select"
      description="Process-step selector. Each item is a navigation link rendered inside a <nav> landmark."
    >
      <Story.Section title="Default">
        <StepSelect
          value="ewms"
          options={[...options]}
          triggerAriaLabel="Prozessschritt auswählen"
          navAriaLabel="Prozessschritt-Navigation"
        />
      </Story.Section>
    </Story>
  );
};

StepSelectStory.storyTitle = 'Step Select';
