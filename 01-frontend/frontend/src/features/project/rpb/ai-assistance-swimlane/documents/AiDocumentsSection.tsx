import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import {
  AccordionContent,
  AccordionItem,
} from '@/features/ui/accordion/Accordion';
import type { NodeRefByType } from '@/db/nodes/types';
import { cn } from '@/features/ui/style/cn';
import { getRouteApi } from '@tanstack/react-router';
import { ChevronRight, Files } from 'lucide-react';
import { AiSectionTrigger } from '../shared/AiSectionTrigger';
import {
  RPB_OVERVIEW_ITEM_ROW_CONTENT_CLASS_NAME,
  RPB_OVERVIEW_ITEM_ROW_ROOT_CLASS_NAME,
} from '../shared/ItemRow';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

const getDocumentLabel = (filename: string) =>
  filename.split('/').pop() ?? filename;

export const AiDocumentsSection = () => {
  const topicId = route.useSearch({
    select: (search) => search.topicId,
  });
  const navigate = route.useNavigate();
  const topicRef = topicId
    ? ({
        id: topicId,
        nodeType: 'topic',
      } satisfies NodeRefByType<'topic'>)
    : null;
  const { data: topicDocuments } = useDescendantNodes('dokument', topicRef);
  const hasDocuments = topicDocuments.length > 0;

  const selectDocument = (documentId: string) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        previewDocumentId: documentId,
        selectedFundstelleId: undefined,
      }),
      resetScroll: false,
    });
  };

  return (
    <AccordionItem value="documents" className="border-t border-border-primary">
      <AiSectionTrigger
        icon={Files}
        titleKey="documents.title"
        count={topicDocuments.length}
      />
      {hasDocuments ? (
        <AccordionContent>
          <div className="flex flex-col gap-2 pt-2 pb-2">
            {topicDocuments.map((document) => (
              <button
                key={document.id}
                type="button"
                onClick={() => selectDocument(document.id)}
                aria-label={getDocumentLabel(document.filename)}
                className={cn(
                  RPB_OVERVIEW_ITEM_ROW_ROOT_CLASS_NAME,
                  'hover:bg-surface-secondary focus-ring cursor-pointer text-left transition-colors',
                )}
              >
                <span className={RPB_OVERVIEW_ITEM_ROW_CONTENT_CLASS_NAME}>
                  <span className="min-w-0 flex-1 truncate">
                    {getDocumentLabel(document.filename)}
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="text-content-tertiary size-4 shrink-0"
                  />
                </span>
              </button>
            ))}
          </div>
        </AccordionContent>
      ) : null}
    </AccordionItem>
  );
};
