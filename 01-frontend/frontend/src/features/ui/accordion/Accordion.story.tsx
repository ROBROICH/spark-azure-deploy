import type { StoryComponentType } from '../story/Story';
import { Story } from '../story/Story';
import {
  Accordion,
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from './Accordion';

export const AccordionStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Accordion"
      description="Vertically stacked collapsible sections. Supports nesting, indentation via level prop, and an optional chevron helper."
    >
      <Story.Section title="Basic" contentClassName="flex-col">
        <Accordion className="w-full max-w-md">
          <AccordionItem value="item-1">
            <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              <AccordionChevron />
              <span>Section one</span>
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2 text-sm">
              Content for section one.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              <AccordionChevron />
              <span>Section two</span>
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2 text-sm">
              Content for section two.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Story.Section>

      <Story.Section title="Default expanded" contentClassName="flex-col">
        <Accordion defaultValue={['open-item']} className="w-full max-w-md">
          <AccordionItem value="open-item">
            <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              <AccordionChevron />
              <span>Expanded by default</span>
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2 text-sm">
              This section starts open.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="closed-item">
            <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              <AccordionChevron />
              <span>Collapsed by default</span>
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2 text-sm">
              This section starts closed.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Story.Section>

      <Story.Section title="Disabled item" contentClassName="flex-col">
        <Accordion className="w-full max-w-md">
          <AccordionItem value="enabled">
            <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              <AccordionChevron />
              <span>Enabled item</span>
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2 text-sm">
              This item can be toggled.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="disabled" disabled>
            <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              <AccordionChevron />
              <span>Disabled item</span>
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2 text-sm">
              This content is not reachable.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Story.Section>

      <Story.Section
        title="Nested with indentation"
        contentClassName="flex-col"
      >
        <Accordion defaultValue={['law-1']} className="w-full max-w-md">
          <AccordionItem value="law-1">
            <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              <AccordionChevron />
              <span>BNatSchG</span>
              <span className="ml-auto rounded-sm bg-success-50 px-2 py-0.5 text-xs text-success-900">
                2 von 3
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <Accordion defaultValue={['section-1']}>
                <AccordionItem value="section-1" level={1}>
                  <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">
                    <AccordionChevron />
                    <span>Part A</span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <Accordion>
                      <AccordionItem value="doc-1" level={2}>
                        <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">
                          <AccordionChevron />
                          <span>Document_1.pdf</span>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 py-2 text-sm">
                          Leaf content at depth 3.
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="section-2" level={1}>
                  <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">
                    <AccordionChevron />
                    <span>Part B</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-3 py-2 text-sm">
                    Leaf content at depth 2.
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="law-2">
            <AccordionTrigger className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-neutral-100">
              <AccordionChevron />
              <span>EnWG</span>
              <span className="ml-auto rounded-sm border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600">
                0 von 5
              </span>
            </AccordionTrigger>
            <AccordionContent className="px-3 py-2 text-sm">
              Collapsed law content.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Story.Section>
    </Story>
  );
};
AccordionStory.storyTitle = 'Accordion';
