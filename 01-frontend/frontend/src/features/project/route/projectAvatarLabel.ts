/**
 * Returns the first character of a project name as an uppercase initial,
 * used for avatar labels in the sidebar and project navbar.
 */
export function getProjectAvatarLabel(projectName?: string) {
  if (!projectName) {
    return '?';
  }

  const trimmed = projectName.trim();
  if (trimmed.length === 0) {
    return '?';
  }

  return trimmed.at(0)?.toUpperCase() ?? '?';
}
