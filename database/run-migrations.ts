import * as fs from 'fs';
import * as path from 'path';
import * as mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';

dotenv.config();

interface MigrationFile {
    name: string;
    path: string;
    order: number;
}

async function runMigrations() {
    const connection = await mysql.createConnection({
        host: process.env.MASTER_DB_HOST || 'localhost',
        user: process.env.MASTER_DB_USER || 'root',
        password: process.env.MASTER_DB_PASSWORD || 'root',
        database: process.env.MASTER_DB_NAME || 'wave-games-database',
        multipleStatements: true,
    });

    try {
        console.log('🚀 Starting RBAC migrations...\n');

        // Create migrations tracking table if it doesn't exist
        await connection.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_migration_name (migration_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

        // Get already executed migrations
        const [executedMigrations] = await connection.execute<any[]>(
            'SELECT migration_name FROM migrations',
        );
        const executedNames = new Set(
            executedMigrations.map((row) => row.migration_name),
        );

        // Read all migration files
        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir);

        const migrationFiles: MigrationFile[] = files
            .filter((file) => file.endsWith('.sql'))
            .map((file) => {
                const match = file.match(/^(\d+)_/);
                const order = match ? parseInt(match[1], 10) : 999;
                return {
                    name: file,
                    path: path.join(migrationsDir, file),
                    order,
                };
            })
            .sort((a, b) => a.order - b.order);

        if (migrationFiles.length === 0) {
            console.log('⚠️  No migration files found.');
            return;
        }

        // Execute migrations
        let executedCount = 0;
        for (const migration of migrationFiles) {
            if (executedNames.has(migration.name)) {
                console.log(`⏭️  Skipping ${migration.name} (already executed)`);
                continue;
            }

            console.log(`📝 Executing ${migration.name}...`);
            const sql = fs.readFileSync(migration.path, 'utf8');

            try {
                await connection.query(sql);
                await connection.execute(
                    'INSERT INTO migrations (migration_name) VALUES (?)',
                    [migration.name],
                );
                console.log(`✅ ${migration.name} executed successfully\n`);
                executedCount++;
            } catch (error) {
                console.error(`❌ Error executing ${migration.name}:`, error.message);
                throw error;
            }
        }

        if (executedCount === 0) {
            console.log('✨ All migrations are up to date!');
        } else {
            console.log(`\n🎉 Successfully executed ${executedCount} migration(s)!`);
        }
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

runMigrations();
