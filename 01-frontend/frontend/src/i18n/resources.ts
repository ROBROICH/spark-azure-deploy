import deAdministration from '@/features/administration/de-administration.json';
import enAdministration from '@/features/administration/en-administration.json';
import deAccessibility from '@/features/app-info/accessibility/de-accessibility.json';
import enAccessibility from '@/features/app-info/accessibility/en-accessibility.json';
import deChangelog from '@/features/app-info/changelog/de-changelog.json';
import enChangelog from '@/features/app-info/changelog/en-changelog.json';
import deDocumentTitle from '@/features/document-title/de-document-title.json';
import enDocumentTitle from '@/features/document-title/en-document-title.json';
import deFeedbackDialog from '@/features/feedback/de-feedback.json';
import enFeedbackDialog from '@/features/feedback/en-feedback.json';
import deCreateProjectForm from '@/features/main-page/create-project-form/de-create-project-form.json';
import enCreateProjectForm from '@/features/main-page/create-project-form/en-create-project-form.json';
import deDashboard from '@/features/main-page/dashboard-screen/de-dashboard-screen.json';
import enDashboard from '@/features/main-page/dashboard-screen/en-dashboard-screen.json';
import deProjectsOverview from '@/features/main-page/list-screen/de-list-screen.json';
import enProjectsOverview from '@/features/main-page/list-screen/en-list-screen.json';
import deProductMode from '@/features/product-mode/de-product-mode.json';
import enProductMode from '@/features/product-mode/en-product-mode.json';
import deAuditLog from '@/features/project/audit-log/de-audit-log.json';
import enAuditLog from '@/features/project/audit-log/en-audit-log.json';
import deEwms from '@/features/project/ewms/de-ewms.json';
import enEwms from '@/features/project/ewms/en-ewms.json';
import deFormalCompletenessCheck from '@/features/project/fvp/main-screen/de-main-screen.json';
import enFormalCompletenessCheck from '@/features/project/fvp/main-screen/en-main-screen.json';
import dePlausibilityCheck from '@/features/project/fvp/plausibility-check/de-plausibility-check.json';
import enPlausibilityCheck from '@/features/project/fvp/plausibility-check/en-plausibility-check.json';
import deMaterialCompletenessCheck from '@/features/project/mvp/overview-screen/de-overview-screen.json';
import enMaterialCompletenessCheck from '@/features/project/mvp/overview-screen/en-overview-screen.json';
import deMvpRedesign from '@/features/project/mvp/topic-detail-screen/de-topic-detail-screen.json';
import enMvpRedesign from '@/features/project/mvp/topic-detail-screen/en-topic-detail-screen.json';
import deSupplementaryRequests from '@/features/project/nachforderungen/de-nachforderungen.json';
import enSupplementaryRequests from '@/features/project/nachforderungen/en-nachforderungen.json';
import deProject from '@/features/project/de-project.json';
import enProject from '@/features/project/en-project.json';
import dePdfPopout from '@/features/project/pdf-popout/de-pdf-popout.json';
import enPdfPopout from '@/features/project/pdf-popout/en-pdf-popout.json';
import deRpb from '@/features/project/rpb/de-rpb.json';
import enRpb from '@/features/project/rpb/en-rpb.json';
import deVersioning from '@/features/project/versioning/de-versioning.json';
import enVersioning from '@/features/project/versioning/en-versioning.json';
import deSchwaerzungsagent from '@/features/schwaerzungsagent/de-schwaerzungsagent.json';
import enSchwaerzungsagent from '@/features/schwaerzungsagent/en-schwaerzungsagent.json';
import deShared from '@/features/shared/de-shared.json';
import enShared from '@/features/shared/en-shared.json';
import deLegalBasisPicker from '@/features/shared/legal-basis-picker/de-legal-basis-picker.json';
import enLegalBasisPicker from '@/features/shared/legal-basis-picker/en-legal-basis-picker.json';

export const resources = {
  de: {
    shared: deShared,
    DocumentTitle: deDocumentTitle,
    CreateProjectForm: deCreateProjectForm,
    Dashboard: deDashboard,
    FormalCompletenessCheck: deFormalCompletenessCheck,
    MaterialCompletenessCheck: deMaterialCompletenessCheck,
    PlausibilityCheck: dePlausibilityCheck,
    SupplementaryRequests: deSupplementaryRequests,
    Project: deProject,
    ProjectsOverview: deProjectsOverview,
    ProductMode: deProductMode,
    AuditLog: deAuditLog,
    Ewms: deEwms,
    FeedbackDialog: deFeedbackDialog,
    MvpRedesign: deMvpRedesign,
    Accessibility: deAccessibility,
    Administration: deAdministration,
    Changelog: deChangelog,
    Rpb: deRpb,
    PdfPopout: dePdfPopout,
    Schwaerzungsagent: deSchwaerzungsagent,
    Versioning: deVersioning,
    LegalBasisPicker: deLegalBasisPicker,
  },
  en: {
    shared: enShared,
    DocumentTitle: enDocumentTitle,
    CreateProjectForm: enCreateProjectForm,
    Dashboard: enDashboard,
    FormalCompletenessCheck: enFormalCompletenessCheck,
    MaterialCompletenessCheck: enMaterialCompletenessCheck,
    PlausibilityCheck: enPlausibilityCheck,
    SupplementaryRequests: enSupplementaryRequests,
    Project: enProject,
    ProjectsOverview: enProjectsOverview,
    ProductMode: enProductMode,
    AuditLog: enAuditLog,
    Ewms: enEwms,
    FeedbackDialog: enFeedbackDialog,
    MvpRedesign: enMvpRedesign,
    Accessibility: enAccessibility,
    Administration: enAdministration,
    Changelog: enChangelog,
    Rpb: enRpb,
    PdfPopout: enPdfPopout,
    Schwaerzungsagent: enSchwaerzungsagent,
    Versioning: enVersioning,
    LegalBasisPicker: enLegalBasisPicker,
  },
} as const;
