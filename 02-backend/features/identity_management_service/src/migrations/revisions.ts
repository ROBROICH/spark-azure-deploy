const revisionFiles = [
  ["001", new URL("./schema/001.zed", import.meta.url)],
  ["002", new URL("./schema/002.zed", import.meta.url)],
  ["003", new URL("./schema/003.zed", import.meta.url)],
  ["004", new URL("./schema/004.zed", import.meta.url)],
  ["005", new URL("./schema/005.zed", import.meta.url)],
] satisfies [string, URL][];

export const loadSpiceDbRevisions = async () =>
  Promise.all(
    revisionFiles.map(async ([version, url]) => ({
      version,
      schema: await Bun.file(url).text(),
    })),
  );
