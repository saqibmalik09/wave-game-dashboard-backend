import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePermissionDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;
}
