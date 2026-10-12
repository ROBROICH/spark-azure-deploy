export const testScope = <Database>(
  database: Database & {
    transaction<Result>(callback: (transaction: Database) => Promise<Result>): Promise<Result>;
  },
) => {
  let transaction: Database | undefined;
  return {
    query: <Result>(callback: (database: Database) => Promise<Result>) =>
      callback(transaction ?? database),
    streamRows: async function* () {
      yield* [];
    },
    transact: <Result>(callback: () => Promise<Result>) =>
      database.transaction(async (current) => {
        transaction = current;
        try {
          return await callback();
        } finally {
          transaction = undefined;
        }
      }),
  };
};
