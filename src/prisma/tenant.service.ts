// src/prisma/tenant.service.ts
import { PrismaClient as TenantPrisma } from '../../prisma/generated/tenant';

export async function getTenantPrisma(org: {
  dbUser: string;
  dbPassword: string;
  dbHost: string;
  dbName: string;
}) {
  return new TenantPrisma({
    datasources: {
      db: {
        url: `mysql://${org.dbUser}:${org.dbPassword}@${org.dbHost}:3306/${org.dbName}`,
      },
    },
  });
}
