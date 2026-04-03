import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../common/database.service';

interface User {
    id: number;
    username: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

@Injectable()
export class UsersService {
    constructor(private databaseService: DatabaseService) { }

    async findAll(page: number = 1, limit: number = 10) {
        const offset = (page - 1) * limit;

        // Get total count
        const countResult = await this.databaseService.queryOne<{ total: number }>(
            'SELECT COUNT(*) as total FROM users',
        );
        const total = countResult?.total || 0;

        // Get users
        const users = await this.databaseService.query<User>(
            'SELECT id, username, email, full_name, is_active, created_at, updated_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?',
            [limit, offset],
        );

        return {
            success: true,
            data: {
                users,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(id: number) {
        const user = await this.databaseService.queryOne<User>(
            'SELECT id, username, email, full_name, is_active, created_at, updated_at FROM users WHERE id = ?',
            [id],
        );

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Get user roles
        const roles = await this.databaseService.query<any>(`
      SELECT r.id, r.name, r.description
      FROM roles r
      JOIN user_roles ur ON r.id = ur.role_id
      WHERE ur.user_id = ?
    `, [id]);

        return {
            success: true,
            data: {
                ...user,
                roles,
            },
        };
    }

    async assignRoles(userId: number, roleIds: number[]) {
        const user = await this.databaseService.queryOne<User>(
            'SELECT id FROM users WHERE id = ?',
            [userId],
        );

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Verify all roles exist
        const roles = await this.databaseService.query<{ id: number }>(
            `SELECT id FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`,
            roleIds,
        );

        if (roles.length !== roleIds.length) {
            throw new BadRequestException('One or more roles not found');
        }

        // Insert roles (ignore duplicates)
        const values = roleIds.map((roleId) => `(${userId}, ${roleId})`).join(',');
        await this.databaseService.execute(
            `INSERT IGNORE INTO user_roles (user_id, role_id) VALUES ${values}`,
        );

        return {
            success: true,
            message: 'Roles assigned successfully',
        };
    }

    async removeRoles(userId: number, roleIds: number[]) {
        const user = await this.databaseService.queryOne<User>(
            'SELECT id FROM users WHERE id = ?',
            [userId],
        );

        if (!user) {
            throw new NotFoundException('User not found');
        }

        await this.databaseService.execute(
            `DELETE FROM user_roles WHERE user_id = ? AND role_id IN (${roleIds.map(() => '?').join(',')})`,
            [userId, ...roleIds],
        );

        return {
            success: true,
            message: 'Roles removed successfully',
        };
    }

    async getUserPermissions(userId: number) {
        const user = await this.databaseService.queryOne<User>(
            'SELECT id FROM users WHERE id = ?',
            [userId],
        );

        if (!user) {
            throw new NotFoundException('User not found');
        }

        const permissions = await this.databaseService.query<{ name: string }>(`
      SELECT DISTINCT p.name
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = ?
    `, [userId]);

        return {
            success: true,
            data: {
                permissions: permissions.map((p) => p.name),
            },
        };
    }
}
