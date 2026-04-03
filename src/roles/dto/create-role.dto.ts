import { IsString, IsOptional, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoleDto {
    @ApiProperty({ example: 'manager' })
    @IsString()
    @MinLength(2)
    name: string;

    @ApiProperty({ example: 'Manager role with limited permissions', required: false })
    @IsOptional()
    @IsString()
    description?: string;
}
