function normalizeTitlePart(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function joinTitleParts(parts: ReadonlyArray<string | undefined>) {
  return parts.filter(Boolean).join(' | ');
}

const MAX_PROJECT_TITLE_LENGTH = 12;

function truncateProjectTitle(projectTitle?: string | null) {
  const normalizedProjectTitle = normalizeTitlePart(projectTitle);
  if (!normalizedProjectTitle) {
    return undefined;
  }

  if (normalizedProjectTitle.length <= MAX_PROJECT_TITLE_LENGTH) {
    return normalizedProjectTitle;
  }

  return `${normalizedProjectTitle
    .slice(0, MAX_PROJECT_TITLE_LENGTH)
    .trimEnd()}…`;
}

export function buildDocumentTitle(options: {
  appTitle: string;
  featureTitle: string;
  projectTitle?: string | null;
  titleType: 'page' | 'project';
}) {
  const { appTitle, featureTitle, projectTitle, titleType } = options;

  if (titleType === 'project') {
    return joinTitleParts([
      truncateProjectTitle(projectTitle),
      featureTitle,
      appTitle,
    ]);
  }

  return joinTitleParts([featureTitle, appTitle]);
}
