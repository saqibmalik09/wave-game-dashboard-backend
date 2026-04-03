import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'Acme Games Ltd',
    description: 'The full name of the organization',
  })
  name: string;

  @ApiProperty({
    example: 'admin@acmegames.com',
    description: 'Primary contact email for the organization',
  })
  email: string;

  @ApiProperty({
    example: '+1234567890',
    required: false,
    description: 'Optional contact phone number',
  })
  phone?: string;

  @ApiProperty({
    example: 'tenant-db-host.example.com',
    description: 'Database host for the tenant',
  })
  dbHost: string;

  @ApiProperty({
    example: 'acme_games_db',
    description: 'Database name to create or connect for the tenant',
  })
  dbName: string;

  @ApiProperty({
    example: 'acme_admin',
    description: 'Database username for the tenant connection',
  })
  dbUser: string;

  @ApiProperty({
    example: 'strongpassword123',
    description: 'Database password for the tenant connection',
  })
  dbPassword: string;
}
