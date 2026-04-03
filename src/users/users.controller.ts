import {
    Controller,
    Get,
    Post,
    Delete,
    Param,
    Body,
    Query,
    UseGuards,
    ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    @Permissions('user.read')
    @ApiOperation({ summary: 'Get all users with pagination' })
    @ApiQuery({ name: 'page', required: false, example: 1 })
    @ApiQuery({ name: 'limit', required: false, example: 10 })
    findAll(
        @Query('page', ParseIntPipe) page: number = 1,
        @Query('limit', ParseIntPipe) limit: number = 10,
    ) {
        return this.usersService.findAll(page, limit);
    }

    @Get(':id')
    @Permissions('user.read')
    @ApiOperation({ summary: 'Get user by ID with roles' })
    findOne(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.findOne(id);
    }

    @Post(':id/roles')
    @Permissions('user.update')
    @ApiOperation({ summary: 'Assign roles to user' })
    assignRoles(
        @Param('id', ParseIntPipe) id: number,
        @Body() assignRolesDto: AssignRolesDto,
    ) {
        return this.usersService.assignRoles(id, assignRolesDto.role_ids);
    }

    @Delete(':id/roles')
    @Permissions('user.update')
    @ApiOperation({ summary: 'Remove roles from user' })
    removeRoles(
        @Param('id', ParseIntPipe) id: number,
        @Body() assignRolesDto: AssignRolesDto,
    ) {
        return this.usersService.removeRoles(id, assignRolesDto.role_ids);
    }

    @Get(':id/permissions')
    @Permissions('user.read')
    @ApiOperation({ summary: 'Get all permissions for user' })
    getUserPermissions(@Param('id', ParseIntPipe) id: number) {
        return this.usersService.getUserPermissions(id);
    }
}
