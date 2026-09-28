import { ApiProperty } from '@nestjs/swagger';
import { RegisterUserDto } from './register-user.dto';

export class RegisterSellerDto extends RegisterUserDto {
  @ApiProperty({
    example: '+254712345678',
    description: 'Phone number in international format, with country code',
  })
  phone_number!: string;

  @ApiProperty({
    example: 'KE',
    description: 'ISO 3166-1 alpha-2 country code',
    minLength: 2,
    maxLength: 2,
  })
  country!: string;
}

export class VerifySellerDto extends RegisterSellerDto {
  @ApiProperty({ example: '1234', description: '4-digit code sent by email' })
  otp!: string;
}
