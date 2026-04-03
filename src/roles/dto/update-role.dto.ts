import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRoleDto {
    @ApiProperty({ required: false })
    @IsOptional()
    @IsString()
    description?: string;
}
