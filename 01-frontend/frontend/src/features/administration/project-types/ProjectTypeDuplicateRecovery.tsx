import { Button } from '@/features/ui/button/Button';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export type ProjectTypeDuplicateRecoveryProps = {
  projectTypeId: string;
  projectTypeName: string;
};

export function ProjectTypeDuplicateRecovery(
  props: ProjectTypeDuplicateRecoveryProps,
) {
  const { projectTypeId, projectTypeName } = props;
  const { t } = useTranslation('Administration');

  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border-[0.5px] border-border-secondary bg-neutral-white p-3">
      <p role="alert" className="text-sm text-text-secondary">
        {t('projectTypes.duplicate.rollbackFailed', { name: projectTypeName })}
      </p>
      <Button asChild variant="secondary" size="sm">
        <Link
          to="/administration/$projectTypeId"
          params={{ projectTypeId }}
          preload="intent"
        >
          {t('projectTypes.duplicate.openPartial')}
        </Link>
      </Button>
    </div>
  );
}
