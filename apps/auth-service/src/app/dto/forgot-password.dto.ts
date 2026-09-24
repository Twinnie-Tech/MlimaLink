import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({
    example: 'jane@example.com',
    description: 'Email of the account to reset',
    format: 'email',
  })
  email!: string;
}
