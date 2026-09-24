import { ApiProperty } from '@nestjs/swagger';

export class RegisterUserDto {
  @ApiProperty({ example: 'Jane Doe', description: 'Full name' })
  name!: string;

  @ApiProperty({
    example: 'jane@example.com',
    description: 'Valid email address',
    format: 'email',
  })
  email!: string;

  @ApiProperty({
    example: 'Secret123!',
    description:
      'Min 8 characters; must include uppercase, lowercase, a number, and a special character',
    format: 'password',
    minLength: 8,
  })
  password!: string;
}
