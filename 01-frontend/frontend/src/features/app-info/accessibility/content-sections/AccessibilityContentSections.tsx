import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type ContentSectionProps = {
  children: ReactNode;
  title: string;
};

const ContentSection = (props: ContentSectionProps) => {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl leading-snug font-semibold text-text-primary">
        {props.title}
      </h2>
      <div className="flex flex-col gap-4 text-base leading-7 text-text-secondary">
        {props.children}
      </div>
    </section>
  );
};

export const AccessibilityContentSections = () => {
  const { t } = useTranslation('Accessibility');
  const contactEmail = t('feedback.email');
  const arbitrationEmail = t('arbitration.email');
  const applicationUrl = `${window.location.origin}/`;

  return (
    <article className="flex flex-col gap-10">
      <section className="flex flex-col gap-4 text-base leading-7 text-text-secondary">
        <p>
          {t('introduction.applicationPrefix')}{' '}
          <a
            href={applicationUrl}
            className="font-medium text-text-primary underline underline-offset-4"
          >
            {applicationUrl}
          </a>{' '}
          {t('introduction.applicationSuffix')}
        </p>
        <p>{t('introduction.legalBasis')}</p>
      </section>

      <ContentSection title={t('conformance.heading')}>
        <p>{t('conformance.requirements')}</p>
        <p>{t('conformance.review')}</p>
        <p>{t('conformance.result')}</p>
      </ContentSection>

      <ContentSection title={t('creation.heading')}>
        <p>{t('creation.text')}</p>
      </ContentSection>

      <ContentSection title={t('feedback.heading')}>
        <p>{t('feedback.text')}</p>
        <p>
          {t('feedback.emailLabel')}{' '}
          <a
            href={`mailto:${contactEmail}`}
            className="font-medium text-text-primary underline underline-offset-4"
          >
            {contactEmail}
          </a>
        </p>
      </ContentSection>

      <ContentSection title={t('arbitration.heading')}>
        <p>{t('arbitration.text1')}</p>
        <p>
          {t('arbitration.text2Prefix')}{' '}
          <a
            href="https://www.schlichtungsstelle-bgg.de/"
            rel="noopener noreferrer"
            target="_blank"
            className="font-medium text-text-primary underline underline-offset-4"
          >
            {t('arbitration.website')}
          </a>
          .
        </p>
        <p>{t('arbitration.contactIntro')}</p>
        <address className="not-italic">
          <strong className="font-semibold text-text-primary">
            {t('arbitration.address.name')}
          </strong>
          <br />
          {t('arbitration.address.office')}
          <br />
          <br />
          {t('arbitration.address.street')}
          <br />
          {t('arbitration.address.city')}
          <br />
          <br />
          {t('arbitration.phoneLabel')} {t('arbitration.phone')}
          <br />
          {t('arbitration.faxLabel')} {t('arbitration.fax')}
          <br />
          {t('arbitration.emailLabel')}{' '}
          <a
            href={`mailto:${arbitrationEmail}`}
            className="font-medium text-text-primary underline underline-offset-4"
          >
            {arbitrationEmail}
          </a>
        </address>
      </ContentSection>
    </article>
  );
};
