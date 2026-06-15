import type { StoryComponentType } from '@/features/ui/story/Story';
import { Story } from '@/features/ui/story/Story';
import { SafeMarkdown } from './SafeMarkdown';

const storyContentClassName =
  'max-w-[48rem] rounded-[8px] border border-slate-200 bg-white p-4 text-[13px] leading-[18px] text-slate-700 [&_blockquote]:border-l-2 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded-md [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_em]:italic [&_h1]:mb-3 [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_hr]:my-4 [&_li]:ml-4 [&_li]:list-disc [&_ol>li]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_p]:mb-3 [&_p:last-child]:mb-0 [&_pre]:mb-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-100 [&_pre]:p-3 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-slate-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-slate-200 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:space-y-1 [&_ul]:pl-5';

export const SafeMarkdownStory: StoryComponentType = (props) => {
  const { id } = props;

  return (
    <Story
      id={id}
      title="Safe Markdown"
      description="Renders the shared restricted markdown surface without clickable markdown links."
    >
      <Story.Section title="Allowed Structure">
        <SafeMarkdown className={storyContentClassName} hrefMode="escape">
          {[
            '# Heading',
            'Paragraph with **strong** and _emphasized_ text.',
            '',
            '- First list item',
            '- Second list item',
            '',
            '> Quoted text',
            '',
            '---',
          ].join('\n')}
        </SafeMarkdown>
      </Story.Section>

      <Story.Section title="Tables">
        <SafeMarkdown className={storyContentClassName} hrefMode="escape">
          {[
            '| Status | Count |',
            '| --- | ---: |',
            '| Open | 3 |',
            '| Done | 8 |',
          ].join('\n')}
        </SafeMarkdown>
      </Story.Section>

      <Story.Section title="Blocked Raw HTML">
        <SafeMarkdown className={storyContentClassName} hrefMode="escape">
          {
            '<button onclick="alert(1)">Injected button</button>\n\nSafe text remains.'
          }
        </SafeMarkdown>
      </Story.Section>

      <Story.Section title="Blocked Images">
        <SafeMarkdown className={storyContentClassName} hrefMode="escape">
          {
            '![Tracking pixel](https://example.test/pixel.png)\n\nNo image is rendered.'
          }
        </SafeMarkdown>
      </Story.Section>

      <Story.Section title="Link Removal">
        <SafeMarkdown className={storyContentClassName} hrefMode="remove">
          {
            'This [link label](https://example.test) is removed from the paragraph.'
          }
        </SafeMarkdown>
      </Story.Section>

      <Story.Section title="Escaped Links">
        <SafeMarkdown className={storyContentClassName} hrefMode="escape">
          {
            'This [Example portal](https://example.test) link is printed without an anchor.'
          }
        </SafeMarkdown>
      </Story.Section>

      <Story.Section title="Raw External URL">
        <SafeMarkdown className={storyContentClassName} hrefMode="escape">
          {'A visible URL stays printable: https://example.test/status'}
        </SafeMarkdown>
      </Story.Section>

      <Story.Section title="Literal Code">
        <SafeMarkdown className={storyContentClassName} hrefMode="escape">
          {[
            '`https://example.test/[0001]`',
            '',
            '```txt',
            '[Reference](https://example.test) and https://example.test stay literal.',
            '```',
          ].join('\n')}
        </SafeMarkdown>
      </Story.Section>
    </Story>
  );
};

SafeMarkdownStory.storyTitle = 'Safe Markdown';
