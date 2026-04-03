// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient as MasterPrisma } from '../../prisma/generated/master';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

@Injectable()
export class PrismaService extends MasterPrisma implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();

    const dbName = 'wave-games-database';

    try {
      // Check if DB exists
      const result: Array<{ SCHEMA_NAME: string }> = await this.$queryRawUnsafe(
        `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '${dbName}'`
      );

      if (result.length > 0) {
        this.logger.log(`✅ Database "${dbName}" already exists`);
      } else {
        // Create DB if not exists
        await this.$executeRawUnsafe(`CREATE DATABASE \`${dbName}\``);
        this.logger.log(`🆕 Database "${dbName}" did not exist, created successfully`);

        // Run migration for master schema
        this.logger.log(`⚡ Running Prisma migration for master schema...`);
        const { stdout, stderr } = await execAsync(
          'npx prisma migrate deploy --schema=./prisma/master/schema.prisma'
        );
        if (stdout) this.logger.log(stdout);
        if (stderr) this.logger.error(stderr);

        this.logger.log(` Master schema migration applied successfully`);
      }
    } catch (err) {
      this.logger.error('❌ Error checking/creating database or migrating schema', err);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
