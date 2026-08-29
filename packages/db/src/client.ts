import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export type DatabaseClient = PrismaClient;

export function createPrismaClient(databaseUrl: string): PrismaClient {
  if (databaseUrl.trim() === "") {
    throw new Error("DATABASE_URL is required to create a database client");
  }

  const connectionUrl = new URL(databaseUrl);
  const schema = connectionUrl.searchParams.get("schema") ?? undefined;

  if (schema && !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(schema)) {
    throw new Error("DATABASE_URL contains an invalid PostgreSQL schema name");
  }

  connectionUrl.searchParams.delete("schema");
  const adapter = new PrismaPg(
    { connectionString: connectionUrl.toString() },
    schema ? { schema } : undefined,
  );
  return new PrismaClient({ adapter });
}
