import { Building2, Calendar, UserRound } from 'lucide-react';
import { AiSuggestionBadge } from '../../ai-suggestion-badge/AiSuggestionBadge';
import { SplitButton } from '../../button/SplitButton';
import type { StoryComponentType } from '../../story/Story';
import { Story } from '../../story/Story';
import { SampleCardMenu } from '../SampleCardMenu.story';
import { TagChip } from '../TagChip.story';
import {
  ArgumentCard,
  ArgumentCardHeader,
  ArgumentCardBadge,
  ArgumentCardTitle,
  ArgumentCardMenu,
  ArgumentCardBody,
  ArgumentCardMetadata,
  ArgumentCardTags,
  ArgumentCardFooter,
} from './ArgumentCard';

export const ArgumentCardStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Argument Card"
      description="Card for argument entries with AI suggestion badge, metadata, and tag chips."
    >
      <Story.Section
        title="Collapsed (default + success)"
        description="Argument cards without the metadata section."
        contentClassName="flex-col items-stretch gap-2"
      >
        <ArgumentCard>
          <ArgumentCardHeader>
            <ArgumentCardBadge>
              <AiSuggestionBadge iconOnly />
            </ArgumentCardBadge>
            <ArgumentCardTitle>EXAMPLE-B</ArgumentCardTitle>
            <ArgumentCardMenu>
              <SampleCardMenu />
            </ArgumentCardMenu>
          </ArgumentCardHeader>
          <ArgumentCardBody>
            Diese Beispielmeldung beschreibt einen synthetischen Sachverhalt für
            die Darstellung eines ungeprüften Kartenzustands.
          </ArgumentCardBody>
          <ArgumentCardFooter>
            <ArgumentCardTags>
              <TagChip label="Kategorie A" borderColor="border-slate-400" />
              <TagChip label="Kategorie B" borderColor="border-slate-400" />
            </ArgumentCardTags>
            <SplitButton
              checked={false}
              uncheckedLabel="Prüfen"
              checkedLabel="Geprüft"
            />
          </ArgumentCardFooter>
        </ArgumentCard>

        <ArgumentCard variant="success">
          <ArgumentCardHeader>
            <ArgumentCardTitle>EXAMPLE-A</ArgumentCardTitle>
            <ArgumentCardMenu>
              <SampleCardMenu />
            </ArgumentCardMenu>
          </ArgumentCardHeader>
          <ArgumentCardBody>
            Diese Beispielmeldung beschreibt einen synthetischen Sachverhalt für
            die Darstellung eines geprüften Kartenzustands.
          </ArgumentCardBody>
          <ArgumentCardFooter>
            <ArgumentCardTags>
              <TagChip label="Kategorie A" borderColor="border-green-500" />
              <TagChip label="Kategorie B" borderColor="border-green-500" />
            </ArgumentCardTags>
            <SplitButton
              checked={true}
              uncheckedLabel="Prüfen"
              checkedLabel="Geprüft"
            />
          </ArgumentCardFooter>
        </ArgumentCard>
      </Story.Section>

      <Story.Section
        title="Expanded with metadata (person)"
        description="Argument card with author name and date metadata."
        contentClassName="flex-col items-stretch"
      >
        <ArgumentCard variant="success">
          <ArgumentCardHeader>
            <ArgumentCardTitle>EXAMPLE-A</ArgumentCardTitle>
            <ArgumentCardMenu>
              <SampleCardMenu />
            </ArgumentCardMenu>
          </ArgumentCardHeader>
          <ArgumentCardBody>
            Diese Beispielmeldung enthält synthetische Metadaten und zeigt, wie
            ein längerer Kartentext mit Statusinformationen dargestellt wird.
          </ArgumentCardBody>
          <ArgumentCardMetadata>
            <span className="flex items-center gap-2 pr-1 text-[11px] leading-[1.27] font-medium tracking-[0.02em] text-slate-600">
              <UserRound className="size-4" aria-hidden="true" />
              Beispielperson Alpha
            </span>
            <span className="flex items-center gap-2 pr-1 text-[11px] leading-[1.27] font-medium tracking-[0.02em] text-slate-600">
              <Calendar className="size-4" aria-hidden="true" />
              09.01.2024
            </span>
          </ArgumentCardMetadata>
          <ArgumentCardFooter>
            <ArgumentCardTags>
              <TagChip label="Kategorie A" borderColor="border-green-500" />
              <TagChip label="Kategorie B" borderColor="border-green-500" />
            </ArgumentCardTags>
            <SplitButton
              checked={true}
              uncheckedLabel="Prüfen"
              checkedLabel="Geprüft"
            />
          </ArgumentCardFooter>
        </ArgumentCard>
      </Story.Section>

      <Story.Section
        title="Expanded with metadata (authority)"
        description="Argument card with authority name and date metadata."
        contentClassName="flex-col items-stretch"
      >
        <ArgumentCard>
          <ArgumentCardHeader>
            <ArgumentCardBadge>
              <AiSuggestionBadge iconOnly />
            </ArgumentCardBadge>
            <ArgumentCardTitle>EXAMPLE-B</ArgumentCardTitle>
            <ArgumentCardMenu>
              <SampleCardMenu />
            </ArgumentCardMenu>
          </ArgumentCardHeader>
          <ArgumentCardBody>
            Diese zweite Beispielmeldung enthält synthetische Metadaten und
            zeigt, wie ein längerer Kartentext mit Statusinformationen
            dargestellt wird.
          </ArgumentCardBody>
          <ArgumentCardMetadata>
            <span className="flex items-center gap-2 pr-1 text-[11px] leading-[1.27] font-medium tracking-[0.02em] text-slate-600">
              <Building2 className="size-4" aria-hidden="true" />
              Beispielbehörde Musterstadt
            </span>
            <span className="flex items-center gap-2 pr-1 text-[11px] leading-[1.27] font-medium tracking-[0.02em] text-slate-600">
              <Calendar className="size-4" aria-hidden="true" />
              09.01.2024
            </span>
          </ArgumentCardMetadata>
          <ArgumentCardFooter>
            <ArgumentCardTags>
              <TagChip label="Kategorie A" borderColor="border-slate-400" />
              <TagChip label="Kategorie B" borderColor="border-slate-400" />
            </ArgumentCardTags>
            <SplitButton
              checked={false}
              uncheckedLabel="Prüfen"
              checkedLabel="Geprüft"
            />
          </ArgumentCardFooter>
        </ArgumentCard>
      </Story.Section>
    </Story>
  );
};

ArgumentCardStory.storyTitle = 'Argument Card';
