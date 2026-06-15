import { Swimlanes } from '@/features/ui/swimlanes/Swimlanes';
import { useSwimlanesGroupSearchState } from '@/features/ui/swimlanes/useSwimlanesGroupSearchState';
import { ClipboardList, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SupplementaryRequestLetter } from './letter-swimlane/SupplementaryRequestLetter';
import { nachforderungenTabSearchSchema } from './nachforderungen.search';
import { RequestListPanel } from './request-list-swimlane/RequestListPanel';

export const NachforderungenSwimlanes = () => {
  const { t } = useTranslation('SupplementaryRequests');
  const laneTab = useSwimlanesGroupSearchState(nachforderungenTabSearchSchema);

  return (
    <Swimlanes minLaneWidth={320}>
      <Swimlanes.Group unfoldOn="always" {...laneTab}>
        <Swimlanes.Lane
          id="list"
          title={t('page.lanes.list')}
          icon={ClipboardList}
        >
          <div className="flex h-full min-h-0 flex-col p-4">
            <RequestListPanel />
          </div>
        </Swimlanes.Lane>
        <Swimlanes.Lane
          id="letter"
          title={t('page.lanes.letter')}
          icon={FileText}
        >
          <SupplementaryRequestLetter />
        </Swimlanes.Lane>
      </Swimlanes.Group>
    </Swimlanes>
  );
};
