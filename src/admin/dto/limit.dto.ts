import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min } from 'class-validator';

export class LimitDto {
    @ApiProperty({
        description: 'Number of top winners to fetch (default 10)',
        example: 10,
        required: false
    })
    @IsOptional()
    @IsNumber()
    @Min(1)
    limit?: number;
}
