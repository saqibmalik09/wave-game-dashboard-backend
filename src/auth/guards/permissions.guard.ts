import {
    Injectable,
    CanActivate,
    ExecutionContext,
    ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { DatabaseService } from '../../common/database.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
    constructor(
        private reflector: Reflector,
        private databaseService: DatabaseService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
            PERMISSIONS_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (!requiredPermissions || requiredPermissions.length === 0) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        if (!user) {
            throw new ForbiddenException('User not authenticated');
        }

        // Check if user has super_admin role (bypass all permission checks)
        const isSuperAdmin = await this.checkSuperAdmin(user.id);
        if (isSuperAdmin) {
            return true;
        }

        // Get user permissions
        const userPermissions = await this.getUserPermissions(user.id);

        // Check if user has all required permissions
        const hasAllPermissions = requiredPermissions.every((permission) =>
            userPermissions.includes(permission),
        );

        if (!hasAllPermissions) {
            throw new ForbiddenException(
                `Missing required permissions: ${requiredPermissions.join(', ')}`,
            );
        }

        return true;
    }

    private async checkSuperAdmin(userId: number): Promise<boolean> {
        const result = await this.databaseService.queryOne<{ count: number }>(`
      SELECT COUNT(*) as count
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ? AND r.name = 'super_admin'
    `, [userId]);

        return result && result.count > 0;
    }

    private async getUserPermissions(userId: number): Promise<string[]> {
        const permissions = await this.databaseService.query<{ name: string }>(`
      SELECT DISTINCT p.name
      FROM permissions p
      JOIN role_permissions rp ON p.id = rp.permission_id
      JOIN user_roles ur ON rp.role_id = ur.role_id
      WHERE ur.user_id = ?
    `, [userId]);

        return permissions.map((p) => p.name);
    }
}
