import { useTranslation } from 'react-i18next';

export function MaintenanceModePage() {
  const { t } = useTranslation('shared');

  return (
    <main
      className="flex min-h-svh flex-col items-center justify-center gap-6 p-6"
      style={{
        background:
          'radial-gradient(circle at top, rgba(219, 234, 254, 0.8), transparent 32%), linear-gradient(180deg, #f8fbff 0%, #f8fafc 35%, #eff6ff 100%)',
      }}
    >
      <img
        src={`${import.meta.env.BASE_URL}SPARK_OS_Release_06.svg`}
        alt="SPARK Workflow"
        className="w-[200px] shrink-0"
      />
      <div className="flex w-full max-w-[36rem] flex-col gap-4 rounded-xl border border-border-primary bg-neutral-white p-8 shadow-sm">
        <p className="text-xs font-semibold tracking-[0.24em] text-text-secondary uppercase">
          {t('maintenancePage.label')}
        </p>
        <div className="flex flex-col gap-2">
          <h1 className="text-heading-lg">{t('maintenancePage.title')}</h1>
          <p className="text-base text-text-secondary">
            {t('maintenancePage.description')}
          </p>
        </div>
      </div>
    </main>
  );
}
