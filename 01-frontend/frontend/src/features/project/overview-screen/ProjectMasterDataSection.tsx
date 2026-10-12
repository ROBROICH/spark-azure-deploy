import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/features/ui/collapsible/Collapsible';
import { cn } from '@/features/ui/style/cn';
import { getRouteApi } from '@tanstack/react-router';
import { ChevronDown, ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApplicantDetailsCard } from './applicant-details-card/ApplicantDetailsCard';
import { ProjectDetailsCard } from './project-details-card/ProjectDetailsCard';

const route = getRouteApi('/verfahren/$verfahrenId/');

export function ProjectMasterDataSection() {
  const { t } = useTranslation('Project');
  const { detailsOpen = false } = route.useSearch();
  const navigate = route.useNavigate();

  const setOpen = (next: boolean) => {
    navigate({
      search: (prev) => ({ ...prev, detailsOpen: next || undefined }),
      resetScroll: false,
    });
  };

  return (
    <Collapsible
      open={detailsOpen}
      onOpenChange={setOpen}
      className="flex flex-col gap-4 rounded-2xl bg-bg-secondary p-2"
    >
      <h2 className="m-0">
        <CollapsibleTrigger className="focus-ring flex w-full items-center gap-2 rounded-lg">
          <span aria-hidden className="rounded-lg bg-bg-quaternary p-2">
            <ClipboardList className="size-4" />
          </span>
          <span className="flex-1 text-left text-base font-medium tracking-tight text-text-primary">
            {t('ProjectMasterDataSection.title')}
          </span>
          <span className="rounded-lg p-2">
            <ChevronDown
              className={cn(
                'size-4 transition-transform duration-200',
                !detailsOpen && '-rotate-90',
              )}
              aria-hidden
            />
          </span>
        </CollapsibleTrigger>
      </h2>

      <CollapsibleContent>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <ProjectDetailsCard />
          <ApplicantDetailsCard />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
