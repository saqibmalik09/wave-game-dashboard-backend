import {
    Injectable,
    ConflictException,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';

interface Role {
    id: number;
    name: string;
    description: string | null;
    is_system_role: boolean;
    created_at: Date;
    updated_at: Date;
}

@Injectable()
export class RolesService {
    constructor(private databaseService: DatabaseService) { }

    async create(createRoleDto: CreateRoleDto) {
        // Check if role name already exists
        const existing = await this.databaseService.queryOne<Role>(
            'SELECT id FROM roles WHERE name = ?',
            [createRoleDto.name],
        );

        if (existing) {
            throw new ConflictException('Role name already exists');
        }

        const result = await this.databaseService.execute(
            'INSERT INTO roles (name, description) VALUES (?, ?)',
            [createRoleDto.name, createRoleDto.description || null],
        );

        return {
            success: true,
            message: 'Role created successfully',
            data: {
                id: result.insertId,
                name: createRoleDto.name,
                description: createRoleDto.description,
                is_system_role: false,
            },
        };
    }

    async findAll(page: number = 1, limit: number = 10) {
        const offset = (page - 1) * limit;

        // Get total count
        const countResult = await this.databaseService.queryOne<{ total: number }>(
            'SELECT COUNT(*) as total FROM roles',
        );
        const total = countResult?.total || 0;

        // Get roles with permission count
        const roles = await this.databaseService.query<any>(`
      SELECT 
        r.id,
        r.name,
        r.description,
        r.is_system_role,
        r.created_at,
        r.updated_at,
        COUNT(rp.permission_id) as permissions_count
      FROM roles r
      LEFT JOIN role_permissions rp ON r.id = rp.role_id
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);

        return {
            success: true,
            data: {
                roles,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(id: number) {
        const role = await this.databaseService.queryOne<Role>(
            'SELECT * FROM roles WHERE id = ?',
            [id],
        );

        if (!role) {
            throw new NotFoundException('Role not found');
        }

        // Get permissions for this role
        const permissions = await this.databaseService.query<any>(`
      SELECT p.id, p.name, p.resource, p.action, p.description
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `, [id]);

        return {
            success: true,
            data: {
                ...role,
                permissions,
            },
        };
    }

    async update(id: number, updateRoleDto: UpdateRoleDto) {
        const role = await this.databaseService.queryOne<Role>(
            'SELECT * FROM roles WHERE id = ?',
            [id],
        );

        if (!role) {
            throw new NotFoundException('Role not found');
        }

        if (role.is_system_role) {
            throw new ForbiddenException('Cannot modify system role');
        }

        await this.databaseService.execute(
            'UPDATE roles SET description = ? WHERE id = ?',
            [updateRoleDto.description || null, id],
        );

        return {
            success: true,
            message: 'Role updated successfully',
        };
    }

    async remove(id: number) {
        const role = await this.databaseService.queryOne<Role>(
            'SELECT * FROM roles WHERE id = ?',
            [id],
        );

        if (!role) {
            throw new NotFoundException('Role not found');
        }

        if (role.is_system_role) {
            throw new ForbiddenException('Cannot delete system role');
        }

        await this.databaseService.execute('DELETE FROM roles WHERE id = ?', [id]);

        return {
            success: true,
            message: 'Role deleted successfully',
        };
    }

    async assignPermissions(roleId: number, permissionIds: number[]) {
        const role = await this.databaseService.queryOne<Role>(
            'SELECT * FROM roles WHERE id = ?',
            [roleId],
        );

        if (!role) {
            throw new NotFoundException('Role not found');
        }

        // Verify all permissions exist
        const permissions = await this.databaseService.query<{ id: number }>(
            `SELECT id FROM permissions WHERE id IN (${permissionIds.map(() => '?').join(',')})`,
            permissionIds,
        );

        if (permissions.length !== permissionIds.length) {
            throw new BadRequestException('One or more permissions not found');
        }

        // Insert permissions (ignore duplicates)
        const values = permissionIds.map((permId) => `(${roleId}, ${permId})`).join(',');
        await this.databaseService.execute(
            `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES ${values}`,
        );

        return {
            success: true,
            message: 'Permissions assigned successfully',
        };
    }

    async removePermissions(roleId: number, permissionIds: number[]) {
        const role = await this.databaseService.queryOne<Role>(
            'SELECT * FROM roles WHERE id = ?',
            [roleId],
        );

        if (!role) {
            throw new NotFoundException('Role not found');
        }

        await this.databaseService.execute(
            `DELETE FROM role_permissions WHERE role_id = ? AND permission_id IN (${permissionIds.map(() => '?').join(',')})`,
            [roleId, ...permissionIds],
        );

        return {
            success: true,
            message: 'Permissions removed successfully',
        };
    }
}
