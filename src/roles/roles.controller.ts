import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class RolesController {
    constructor(private readonly rolesService: RolesService) { }

    @Post()
    @Permissions('role.create')
    @ApiOperation({ summary: 'Create a new role' })
    create(@Body() createRoleDto: CreateRoleDto) {
        return this.rolesService.create(createRoleDto);
    }

    @Get()
    @Permissions('role.read')
    @ApiOperation({ summary: 'Get all roles with pagination' })
    @ApiQuery({ name: 'page', required: false, example: 1 })
    @ApiQuery({ name: 'limit', required: false, example: 10 })
    findAll(
        @Query('page', ParseIntPipe) page: number = 1,
        @Query('limit', ParseIntPipe) limit: number = 10,
    ) {
        return this.rolesService.findAll(page, limit);
    }

    @Get(':id')
    @Permissions('role.read')
    @ApiOperation({ summary: 'Get role by ID with permissions' })
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.rolesService.findOne(id);
    }

    @Patch(':id')
    @Permissions('role.update')
    @ApiOperation({ summary: 'Update role' })
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() updateRoleDto: UpdateRoleDto,
    ) {
        return this.rolesService.update(id, updateRoleDto);
    }

    @Delete(':id')
    @Permissions('role.delete')
    @ApiOperation({ summary: 'Delete role (cannot delete system roles)' })
    remove(@Param('id', ParseIntPipe) id: number) {
        return this.rolesService.remove(id);
    }

    @Post(':id/permissions')
    @Permissions('role.update')
    @ApiOperation({ summary: 'Assign permissions to role' })
    assignPermissions(
        @Param('id', ParseIntPipe) id: number,
        @Body() assignPermissionsDto: AssignPermissionsDto,
    ) {
        return this.rolesService.assignPermissions(
            id,
            assignPermissionsDto.permission_ids,
        );
    }

    @Delete(':id/permissions')
    @Permissions('role.update')
    @ApiOperation({ summary: 'Remove permissions from role' })
    removePermissions(
        @Param('id', ParseIntPipe) id: number,
        @Body() assignPermissionsDto: AssignPermissionsDto,
    ) {
        return this.rolesService.removePermissions(
            id,
            assignPermissionsDto.permission_ids,
        );
    }
}
