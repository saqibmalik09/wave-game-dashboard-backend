import { IsString, IsEmail, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
    @ApiProperty({ example: 'john_doe' })
    @IsString()
    @MinLength(3)
    username: string;

    @ApiProperty({ example: 'john@example.com' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'SecurePass123!' })
    @IsString()
    @MinLength(6)
    password: string;

    @ApiProperty({ example: 'John Doe', required: false })
    @IsOptional()
    @IsString()
    full_name?: string;
}
