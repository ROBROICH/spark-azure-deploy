import { AccordionStory } from '../../ui/accordion/Accordion.story';
import { AlertStory } from '../../ui/alert/Alert.story';
import { AvatarBandStory } from '../../ui/avatar-band/AvatarBand.story';
import { BadgeStory } from '../../ui/badge/Badge.story';
import { CardStory } from '../../ui/card/Card.story';
import { ArgumentCardStory } from '../../ui/cards/argument-card/ArgumentCard.story';
import { CheckboxStory } from '../../ui/checkbox/Checkbox.story';
import { CollapsibleStory } from '../../ui/collapsible/Collapsible.story';
import { FormStory } from '../../ui/form/form.story';
import { InputStory } from '../../ui/input/Input.story';
import { LabelStory } from '../../ui/label/Label.story';
import { ActionMenuStory } from '../../ui/action-menu/ActionMenu.story';
import { AiButtonStory } from '../../ui/ai/AiButton.story';
import { AiNormCardStory } from '../../ui/cards/ai-norm-card/AiNormCard.story';
import { AiOutdatedBadgeStory } from '../../ui/ai-outdated-badge/AiOutdatedBadge.story';
import { AiOutdatedTriggerCardStory } from '../../ui/ai-outdated-trigger-card/AiOutdatedTriggerCard.story';
import { AiReferenceAggregateCardStory } from '../../ui/ai-reference-aggregate-card/AiReferenceAggregateCard.story';
import { AiTriggerCardStory } from '../../ui/ai-trigger-card/AiTriggerCard.story';
import { ButtonStory } from '../../ui/button/Button.story';
import { SplitButtonStory } from '../../ui/button/SplitButton.story';
import { FilterPillSelectStory } from '../../ui/filter-pill-select/FilterPillSelect.story';
import { InfoCardStory } from '../../ui/info-card/InfoCard.story';
import { InjectReferenceLinksStory } from '../../ui/inject-reference-links/InjectReferenceLinks.story';
import { PopoverStory } from '../../ui/popover/Popover.story';
import { ProgressBarStory } from '../../ui/progress-bar/ProgressBar.story';
import { SearchInputStory } from '../../ui/search-input/SearchInput.story';
import { SelectMenuStory } from '../../ui/select-menu/SelectMenu.story';
import { StatusBadgeStory } from '../../ui/status-badge/StatusBadge.story';
import { StepSelectStory } from '../../ui/step-select/StepSelect.story';
import { RadioGroupStory } from '../../ui/radio-group/RadioGroup.story';
import { SafeMarkdownStory } from '../../ui/safe-markdown/SafeMarkdown.story';
import { SkeletonStory } from '../../ui/skeleton/Skeleton.story';
import { StoryLayout } from '../../ui/story/StoryProvider';
import { SwimlaneHeaderStory } from '../../ui/swimlane-header/SwimlaneHeader.story';
import { SwimlanesStory } from '../../ui/swimlanes/Swimlanes.story';
import { SwimlaneTabsStory } from '../../ui/swimlane-tabs/SwimlaneTabs.story';
import { TabsStory } from '../../ui/tabs/Tabs.story';
import { ToastStory } from '../../ui/toast/Toast.story';
import { ToggleStory } from '../../ui/toggle/Toggle.story';
import { TooltipStory } from '../../ui/tooltip/Tooltip.story';
import { UserAvatarStory } from '../../ui/user-avatar/UserAvatar.story';
import { UserPickerStory } from '../../ui/user-picker/UserPicker.story';

export const DesignSystem = () => {
  return (
    <StoryLayout>
      <StoryLayout.Section title="Actions">
        <ActionMenuStory />
        <ButtonStory />
        <SplitButtonStory />
        <ToggleStory />
      </StoryLayout.Section>
      <StoryLayout.Section title="Forms & Inputs">
        <CheckboxStory />
        <FilterPillSelectStory />
        <FormStory />
        <InputStory />
        <LabelStory />
        <RadioGroupStory />
        <SearchInputStory />
        <SelectMenuStory />
        <StepSelectStory />
      </StoryLayout.Section>
      <StoryLayout.Section title="Navigation & Disclosure">
        <AccordionStory />
        <CollapsibleStory />
        <PopoverStory />
        <TabsStory />
        <TooltipStory />
      </StoryLayout.Section>
      <StoryLayout.Section title="Feedback">
        <AlertStory />
        <BadgeStory />
        <ProgressBarStory />
        <SkeletonStory />
        <StatusBadgeStory />
        <ToastStory />
      </StoryLayout.Section>
      <StoryLayout.Section title="Layout">
        <CardStory />
        <SwimlaneHeaderStory />
        <SwimlanesStory />
        <SwimlaneTabsStory />
      </StoryLayout.Section>
      <StoryLayout.Section title="Cards">
        <AiNormCardStory />
        <AiReferenceAggregateCardStory />
        <ArgumentCardStory />
        <InfoCardStory />
      </StoryLayout.Section>
      <StoryLayout.Section title="AI">
        <AiButtonStory />
        <AiOutdatedBadgeStory />
        <AiOutdatedTriggerCardStory />
        <AiTriggerCardStory />
      </StoryLayout.Section>
      <StoryLayout.Section title="People & Content">
        <AvatarBandStory />
        <InjectReferenceLinksStory />
        <SafeMarkdownStory />
        <UserAvatarStory />
        <UserPickerStory />
      </StoryLayout.Section>
    </StoryLayout>
  );
};
