import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePermissionDto {
    @ApiProperty({ example: 'broadcast.send' })
    @IsString()
    @MinLength(3)
    name: string;

    @ApiProperty({ example: 'broadcast' })
    @IsString()
    resource: string;

    @ApiProperty({ example: 'send' })
    @IsString()
    action: string;

    @ApiProperty({ example: 'Send broadcast messages', required: false })
    @IsString()
    description?: string;
}
