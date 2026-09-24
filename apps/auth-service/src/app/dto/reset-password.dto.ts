import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token from the reset link in the email' })
  token!: string;

  @ApiProperty({
    example: 'NewSecret123!',
    description:
      'Min 8 characters; must include uppercase, lowercase, a number, and a special character',
    format: 'password',
    minLength: 8,
  })
  password!: string;

  @ApiProperty({
    example: 'NewSecret123!',
    description: 'Must match password',
    format: 'password',
  })
  confirmPassword!: string;
}
