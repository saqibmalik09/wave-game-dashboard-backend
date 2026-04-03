import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class UserIdDto {
    @ApiProperty({
        description: 'User ID (number or string will be converted to string)',
        example: '505637'
    })
    @IsNotEmpty()
    userId: string | number;
}
