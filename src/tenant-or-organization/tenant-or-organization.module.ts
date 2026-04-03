import { Module } from '@nestjs/common';
import { TenantOrOrganizationService } from './tenant-or-organization.service';
import { TenantOrOrganizationController } from './tenant-or-organization.controller';

@Module({
  providers: [TenantOrOrganizationService],
  controllers: [TenantOrOrganizationController]
})
export class TenantOrOrganizationModule {}
