import {
  ArrowLeft,
  BookOpen,
  FileText,
  Maximize2,
  Scale,
  ScanText,
  Search,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '../button/Button';
import { Story } from '../story/Story';
import { Swimlanes } from './Swimlanes';

const PlaceholderContent = (props: { label: string; lines?: number }) => {
  const { label, lines = 6 } = props;
  return (
    <div className="space-y-2 p-3 text-sm text-text-secondary">
      <p className="font-medium text-text-primary">{label}</p>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-bg-quaternary"
          style={{ width: `${60 + ((i * 17 + 3) % 35)}%` }}
        />
      ))}
    </div>
  );
};

export const StandaloneSections = () => (
  <>
    <Story.Section
      title="Two Lanes"
      description="Minimal layout with two standalone lanes."
      contentClassName="flex-col"
    >
      <div className="h-64 w-full rounded-lg border border-border-primary">
        <Swimlanes>
          <Swimlanes.Lane id="docs" title="Dokumente" icon={FileText}>
            <PlaceholderContent label="Document tree" />
          </Swimlanes.Lane>
          <Swimlanes.Lane id="preview" title="Vorschau" icon={ScanText}>
            <PlaceholderContent label="Document preview" />
          </Swimlanes.Lane>
        </Swimlanes>
      </div>
    </Story.Section>

    <Story.Section
      title="Three Lanes"
      description="Three-column layout matching a typical EWMS-style page."
      contentClassName="flex-col"
    >
      <div className="h-64 w-full rounded-lg border border-border-primary">
        <Swimlanes>
          <Swimlanes.Lane id="docs" title="Dokumente" icon={FileText}>
            <PlaceholderContent label="Document tree" />
          </Swimlanes.Lane>
          <Swimlanes.Lane id="preview" title="Dokumentvorschau" icon={ScanText}>
            <PlaceholderContent label="Document preview" />
          </Swimlanes.Lane>
          <Swimlanes.Lane id="legal" title="Rechtsgrundlage" icon={Scale}>
            <PlaceholderContent label="Legal basis panel" />
          </Swimlanes.Lane>
        </Swimlanes>
      </div>
    </Story.Section>

    <Story.Section
      title="Four Lanes with Actions"
      description="Four-column layout with action buttons in lane headers."
      contentClassName="flex-col"
    >
      <div className="h-64 w-full rounded-lg border border-border-primary">
        <Swimlanes>
          <Swimlanes.Lane
            id="docs"
            title="Dokumente"
            icon={FileText}
            action={
              <Button variant="ghost" size="md" iconOnly aria-label="Maximize">
                <Maximize2 />
              </Button>
            }
          >
            <PlaceholderContent label="Document tree" />
          </Swimlanes.Lane>
          <Swimlanes.Lane id="findings" title="Fundstellen" icon={Search}>
            <PlaceholderContent label="Findings list" />
          </Swimlanes.Lane>
          <Swimlanes.Lane id="preview" title="Dokumentvorschau" icon={ScanText}>
            <PlaceholderContent label="Document preview" />
          </Swimlanes.Lane>
          <Swimlanes.Lane id="legal" title="Rechtsgrundlage" icon={Scale}>
            <PlaceholderContent label="Legal basis panel" />
          </Swimlanes.Lane>
        </Swimlanes>
      </div>
    </Story.Section>
  </>
);

export const GroupedSections = () => {
  const [collapsedTab, setCollapsedTab] = useState('docs');
  const [threeTabGroup, setThreeTabGroup] = useState('docs');
  const [responsiveTab, setResponsiveTab] = useState('docs');
  const [leftTab, setLeftTab] = useState('docs');
  const [rightTab, setRightTab] = useState('preview');

  return (
    <>
      <Story.Section
        title="Grouped Lanes (Collapsed / Tabbed)"
        description="A group without unfoldOn always renders in collapsed mode: a single lane with tabs. Click tabs to switch between Dokumente and Fundstellen."
        contentClassName="flex-col"
      >
        <div className="h-72 w-full rounded-lg border border-border-primary">
          <Swimlanes>
            <Swimlanes.Group
              value={collapsedTab}
              onValueChange={setCollapsedTab}
            >
              <Swimlanes.Lane id="docs" title="Dokumente" icon={FileText}>
                <PlaceholderContent label="Document tree" lines={8} />
              </Swimlanes.Lane>
              <Swimlanes.Lane id="findings" title="Fundstellen" icon={Search}>
                <PlaceholderContent label="Findings list" lines={8} />
              </Swimlanes.Lane>
            </Swimlanes.Group>
            <Swimlanes.Lane
              id="preview"
              title="Dokumentvorschau"
              icon={ScanText}
            >
              <PlaceholderContent label="Document preview" lines={8} />
            </Swimlanes.Lane>
          </Swimlanes>
        </div>
      </Story.Section>

      <Story.Section
        title="Three Tabs in One Group"
        description="A group with three lanes collapses to three tabs."
        contentClassName="flex-col"
      >
        <div className="h-72 w-full rounded-lg border border-border-primary">
          <Swimlanes>
            <Swimlanes.Group
              value={threeTabGroup}
              onValueChange={setThreeTabGroup}
            >
              <Swimlanes.Lane id="docs" title="Dokumente" icon={FileText}>
                <PlaceholderContent label="Document tree" />
              </Swimlanes.Lane>
              <Swimlanes.Lane id="findings" title="Fundstellen" icon={Search}>
                <PlaceholderContent label="Findings list" />
              </Swimlanes.Lane>
              <Swimlanes.Lane id="topics" title="Themen" icon={BookOpen}>
                <PlaceholderContent label="Topic list" />
              </Swimlanes.Lane>
            </Swimlanes.Group>
            <Swimlanes.Lane id="legal" title="Rechtsgrundlage" icon={Scale}>
              <PlaceholderContent label="Legal basis panel" />
            </Swimlanes.Lane>
          </Swimlanes>
        </div>
      </Story.Section>

      <Story.Section
        title="Responsive Unfold (desktop: 1600px)"
        description="Uses unfoldOn='desktop'. Below 1600px it shows as tabs. At 1600px+ it unfolds into side-by-side lanes. Resize your browser window to see the transition."
        contentClassName="flex-col"
      >
        <div className="h-72 w-full rounded-lg border border-border-primary">
          <Swimlanes>
            <Swimlanes.Group
              unfoldOn="desktop"
              value={responsiveTab}
              onValueChange={setResponsiveTab}
            >
              <Swimlanes.Lane id="docs" title="Dokumente" icon={FileText}>
                <PlaceholderContent label="Document tree" lines={8} />
              </Swimlanes.Lane>
              <Swimlanes.Lane id="findings" title="Fundstellen" icon={Search}>
                <PlaceholderContent label="Findings list" lines={8} />
              </Swimlanes.Lane>
            </Swimlanes.Group>
            <Swimlanes.Lane
              id="preview"
              title="Dokumentvorschau"
              icon={ScanText}
            >
              <PlaceholderContent label="Document preview" lines={8} />
            </Swimlanes.Lane>
          </Swimlanes>
        </div>
      </Story.Section>

      <Story.Section
        title="Independent Per-Group Unfold"
        description="Two groups with different unfoldOn tokens. First unfolds at desktop (1600px), second at widescreen (2000px). Each group decides independently."
        contentClassName="flex-col"
      >
        <div className="h-72 w-full overflow-hidden rounded-lg border border-border-primary">
          <Swimlanes>
            <Swimlanes.Group
              unfoldOn="desktop"
              value={leftTab}
              onValueChange={setLeftTab}
            >
              <Swimlanes.Lane id="docs" title="Dokumente" icon={FileText}>
                <PlaceholderContent label="Document tree" />
              </Swimlanes.Lane>
              <Swimlanes.Lane id="findings" title="Fundstellen" icon={Search}>
                <PlaceholderContent label="Findings list" />
              </Swimlanes.Lane>
            </Swimlanes.Group>
            <Swimlanes.Group
              unfoldOn="widescreen"
              value={rightTab}
              onValueChange={setRightTab}
            >
              <Swimlanes.Lane
                id="preview"
                title="Dokumentvorschau"
                icon={ScanText}
              >
                <PlaceholderContent label="Document preview" />
              </Swimlanes.Lane>
              <Swimlanes.Lane id="legal" title="Rechtsgrundlage" icon={Scale}>
                <PlaceholderContent label="Legal basis panel" />
              </Swimlanes.Lane>
            </Swimlanes.Group>
          </Swimlanes>
        </div>
      </Story.Section>
    </>
  );
};

export const MiscSections = () => (
  <>
    <Story.Section
      title="Header-Portal"
      description="Eine Lane kann ihre sichtbare Kopfzeile aus dem Inhalt heraus ersetzen, ohne die zugängliche Überschrift zu verlieren."
      contentClassName="flex-col"
    >
      <div className="h-48 w-full rounded-lg border border-border-primary">
        <Swimlanes>
          <Swimlanes.Lane id="review" title="Rechtsgrundlage" icon={Scale}>
            <Swimlanes.HeaderPortal>
              <Button variant="ghost" size="md" iconOnly aria-label="Zurück">
                <ArrowLeft />
              </Button>
              <span>Zur Übersicht</span>
            </Swimlanes.HeaderPortal>
            <PlaceholderContent label="Prüfdetails" lines={4} />
          </Swimlanes.Lane>
          <Swimlanes.Lane id="preview" title="Dokumentvorschau" icon={ScanText}>
            <PlaceholderContent label="Dokumentvorschau" lines={4} />
          </Swimlanes.Lane>
        </Swimlanes>
      </div>
    </Story.Section>

    <Story.Section
      title="Custom Heading Levels"
      description="Lane headers can use different heading levels for semantic HTML hierarchy."
      contentClassName="flex-col"
    >
      <div className="h-48 w-full rounded-lg border border-border-primary">
        <Swimlanes>
          <Swimlanes.Lane
            id="nav"
            title="Navigation"
            icon={BookOpen}
            headingLevel="h3"
          >
            <PlaceholderContent label="Navigation content" lines={3} />
          </Swimlanes.Lane>
          <Swimlanes.Lane
            id="content"
            title="Content"
            icon={FileText}
            headingLevel="h3"
          >
            <PlaceholderContent label="Main content" lines={3} />
          </Swimlanes.Lane>
        </Swimlanes>
      </div>
    </Story.Section>
  </>
);
