/**
 * Downloads a YAML text file through a temporary object URL and revokes it
 * after the click. Matches the local Blob download used by the redaction
 * success step rather than the remote HTTPS download used by EWMS export.
 *
 * @param filename Browser download name, including `.yaml`.
 * @param yaml Serialized YAML document.
 */
export const downloadYamlFile = (filename: string, yaml: string): void => {
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener noreferrer';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
};

export const catalogExportPayload = (usecase: {
  projekttyp: unknown;
  gesetzesgrundlage: unknown;
  dokumente: unknown;
  beschluss: unknown;
}) => ({
  projekttyp: usecase.projekttyp,
  gesetzesgrundlage: usecase.gesetzesgrundlage,
  dokumente: usecase.dokumente,
  beschluss: usecase.beschluss,
});
