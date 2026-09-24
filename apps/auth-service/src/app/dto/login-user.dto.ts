import { ApiProperty } from '@nestjs/swagger';

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
}
