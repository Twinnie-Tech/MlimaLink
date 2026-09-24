import { ApiProperty } from '@nestjs/swagger';

export class VerifyUserDto {
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

  @ApiProperty({
    example: '1234',
    description: 'One-time password sent to the email',
  })
  otp!: string;
}
