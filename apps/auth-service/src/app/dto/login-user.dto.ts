import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginUserDto {
  @ApiProperty({
    example: 'jane@example.com',
    description: 'Registered email address',
    format: 'email',
  })
  email!: string;

  @ApiProperty({
    example: 'Secret123!',
    description: 'Account password',
    format: 'password',
  })
  password!: string;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'Keep the user signed in for 7 days. When false, auth cookies end with the browser session.',
  })
  rememberMe?: boolean;
}
