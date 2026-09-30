import { ApiProperty } from '@nestjs/swagger';
import { RegisterUserDto } from './register-user.dto';

export class RegisterRiderDto extends RegisterUserDto {
  @ApiProperty({
    example: '+254712345678',
    description: 'Phone number in international format, with country code',
  })
  phone_number!: string;
}

export class VerifyRiderDto extends RegisterRiderDto {
  @ApiProperty({ example: '1234', description: '4-digit code sent by email' })
  otp!: string;
}
