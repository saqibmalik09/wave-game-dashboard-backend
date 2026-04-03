import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
    private pool: mysql.Pool;

    constructor(private configService: ConfigService) { }

    async onModuleInit() {
        this.pool = mysql.createPool({
            host: this.configService.get<string>('MASTER_DB_HOST', 'localhost'),
            user: this.configService.get<string>('MASTER_DB_USER', 'root'),
            password: this.configService.get<string>('MASTER_DB_PASSWORD', 'root'),
            database: this.configService.get<string>(
                'MASTER_DB_NAME',
                'wave-games-database',
            ),
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });

        console.log('✅ Database connection pool initialized');
    }

    async onModuleDestroy() {
        await this.pool.end();
        console.log('🔌 Database connection pool closed');
    }

    /**
     * Execute a SELECT query and return results
     */
    async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
        const [rows] = await this.pool.execute(sql, params);
        return rows as T[];
    }

    /**
     * Execute an INSERT, UPDATE, or DELETE query
     */
    async execute(
        sql: string,
        params: any[] = [],
    ): Promise<mysql.ResultSetHeader> {
        const [result] = await this.pool.execute(sql, params);
        return result as mysql.ResultSetHeader;
    }

    /**
     * Execute a single query and return the first row
     */
    async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
        const rows = await this.query<T>(sql, params);
        return rows.length > 0 ? rows[0] : null;
    }

    /**
     * Begin a transaction
     */
    async getConnection(): Promise<mysql.PoolConnection> {
        return await this.pool.getConnection();
    }

    /**
     * Execute multiple queries in a transaction
     */
    async transaction<T>(
        callback: (connection: mysql.PoolConnection) => Promise<T>,
    ): Promise<T> {
        const connection = await this.getConnection();
        try {
            await connection.beginTransaction();
            const result = await callback(connection);
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}
