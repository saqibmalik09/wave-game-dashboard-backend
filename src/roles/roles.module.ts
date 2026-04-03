import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { DatabaseService } from '../common/database.service';

@Module({
    controllers: [RolesController],
    providers: [RolesService, DatabaseService],
    exports: [RolesService],
})
export class RolesModule { }
