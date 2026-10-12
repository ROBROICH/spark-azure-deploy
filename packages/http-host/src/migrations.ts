import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const migrationLockId = 1_752_041_503;

type ReservedConnection = Awaited<ReturnType<SQL["reserve"]>>;

async function withReservedMigratorConnection<T>(
  client: SQL,
  work: (connection: ReservedConnection) => Promise<T>,
): Promise<T> {
  const connection = await client.reserve();
  try {
    return await work(connection);
  } finally {
    connection.release();
  }
}

export async function withSessionLock<T>(
  client: SQL,
  lockId: number,
  work: () => Promise<T>,
): Promise<T> {
  return withReservedMigratorConnection(client, async (connection) => {
    await connection`SELECT pg_advisory_lock(${lockId})`;
    try {
      return await work();
    } finally {
      await connection`SELECT pg_advisory_unlock(${lockId})`;
    }
  });
}

export async function migrateDatabase(client: SQL, migrationsFolder: string): Promise<void> {
  await withReservedMigratorConnection(client, async (connection) => {
    await connection`SELECT pg_advisory_lock(${migrationLockId})`;
    try {
      await migrate(drizzle(connection), { migrationsFolder });
    } finally {
      await connection`SELECT pg_advisory_unlock(${migrationLockId})`;
    }
  });
}
