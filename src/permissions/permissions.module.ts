import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { DatabaseService } from '../common/database.service';

@Module({
    controllers: [PermissionsController],
    providers: [PermissionsService, DatabaseService],
    exports: [PermissionsService],
})
export class PermissionsModule { }
