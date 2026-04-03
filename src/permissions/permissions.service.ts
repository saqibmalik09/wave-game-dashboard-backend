import {
    Injectable,
    ConflictException,
    NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../common/database.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

interface Permission {
    id: number;
    name: string;
    resource: string;
    action: string;
    description: string | null;
    created_at: Date;
}

@Injectable()
export class PermissionsService {
    constructor(private databaseService: DatabaseService) { }

    async create(createPermissionDto: CreatePermissionDto) {
        // Check if permission name already exists
        const existing = await this.databaseService.queryOne<Permission>(
            'SELECT id FROM permissions WHERE name = ?',
            [createPermissionDto.name],
        );

        if (existing) {
            throw new ConflictException('Permission name already exists');
        }

        const result = await this.databaseService.execute(
            'INSERT INTO permissions (name, resource, action, description) VALUES (?, ?, ?, ?)',
            [
                createPermissionDto.name,
                createPermissionDto.resource,
                createPermissionDto.action,
                createPermissionDto.description || null,
            ],
        );

        return {
            success: true,
            message: 'Permission created successfully',
            data: {
                id: result.insertId,
                ...createPermissionDto,
            },
        };
    }

    async findAll(resource?: string, page: number = 1, limit: number = 20) {
        const offset = (page - 1) * limit;
        let whereClause = '';
        const params: any[] = [];

        if (resource) {
            whereClause = 'WHERE resource = ?';
            params.push(resource);
        }

        // Get total count
        const countResult = await this.databaseService.queryOne<{ total: number }>(
            `SELECT COUNT(*) as total FROM permissions ${whereClause}`,
            params,
        );
        const total = countResult?.total || 0;

        // Get permissions
        const permissions = await this.databaseService.query<Permission>(
            `SELECT * FROM permissions ${whereClause} ORDER BY resource, action LIMIT ? OFFSET ?`,
            [...params, limit, offset],
        );

        return {
            success: true,
            data: {
                permissions,
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        };
    }

    async findOne(id: number) {
        const permission = await this.databaseService.queryOne<Permission>(
            'SELECT * FROM permissions WHERE id = ?',
            [id],
        );

        if (!permission) {
            throw new NotFoundException('Permission not found');
        }

        return {
            success: true,
            data: permission,
        };
    }

    async update(id: number, updatePermissionDto: UpdatePermissionDto) {
        const permission = await this.databaseService.queryOne<Permission>(
            'SELECT * FROM permissions WHERE id = ?',
            [id],
        );

        if (!permission) {
            throw new NotFoundException('Permission not found');
        }

        await this.databaseService.execute(
            'UPDATE permissions SET description = ? WHERE id = ?',
            [updatePermissionDto.description || null, id],
        );

        return {
            success: true,
            message: 'Permission updated successfully',
        };
    }

    async remove(id: number) {
        const permission = await this.databaseService.queryOne<Permission>(
            'SELECT * FROM permissions WHERE id = ?',
            [id],
        );

        if (!permission) {
            throw new NotFoundException('Permission not found');
        }

        await this.databaseService.execute('DELETE FROM permissions WHERE id = ?', [
            id,
        ]);

        return {
            success: true,
            message: 'Permission deleted successfully',
        };
    }
}
