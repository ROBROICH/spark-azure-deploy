export const getLegacyPlausibilityCheckRedirect = (verfahrenId: string) => ({
  to: '/verfahren/$verfahrenId/fvp/pp',
  params: { verfahrenId },
  replace: true,
});
