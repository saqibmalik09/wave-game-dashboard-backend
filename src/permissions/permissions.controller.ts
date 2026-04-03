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
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';

@ApiTags('Permissions')
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PermissionsController {
    constructor(private readonly permissionsService: PermissionsService) { }

    @Post()
    @Permissions('permission.create')
    @ApiOperation({ summary: 'Create a new permission' })
    create(@Body() createPermissionDto: CreatePermissionDto) {
        return this.permissionsService.create(createPermissionDto);
    }

    @Get()
    @Permissions('permission.read')
    @ApiOperation({ summary: 'Get all permissions with optional filtering' })
    @ApiQuery({ name: 'resource', required: false, example: 'game' })
    @ApiQuery({ name: 'page', required: false, example: 1 })
    @ApiQuery({ name: 'limit', required: false, example: 20 })
    findAll(
        @Query('resource') resource?: string,
        @Query('page', ParseIntPipe) page: number = 1,
        @Query('limit', ParseIntPipe) limit: number = 20,
    ): Promise<any> {
        return this.permissionsService.findAll(resource, page, limit);
    }

    @Get(':id')
    @Permissions('permission.read')
    @ApiOperation({ summary: 'Get permission by ID' })
    findOne(@Param('id', ParseIntPipe) id: number): Promise<any> {
        return this.permissionsService.findOne(id);
    }

    @Patch(':id')
    @Permissions('permission.update')
    @ApiOperation({ summary: 'Update permission' })
    update(
        @Param('id', ParseIntPipe) id: number,
        @Body() updatePermissionDto: UpdatePermissionDto,
    ): Promise<any> {
        return this.permissionsService.update(id, updatePermissionDto);
    }

    @Delete(':id')
    @Permissions('permission.delete')
    @ApiOperation({ summary: 'Delete permission' })
    remove(@Param('id', ParseIntPipe) id: number): Promise<any> {
        return this.permissionsService.remove(id);
    }
}
