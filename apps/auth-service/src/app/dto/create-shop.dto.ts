import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShopDto {
  @ApiProperty({ example: 'Mlima Fresh Farm', maxLength: 100 })
  name!: string;

  @ApiProperty({ example: 'Fruits & Vegetables' })
  category!: string;

  @ApiProperty({ example: 'Moi Avenue, Nairobi' })
  address!: string;

  @ApiPropertyOptional({
    example: 'Organic produce straight from our farm in Limuru.',
    maxLength: 500,
  })
  bio?: string;

  @ApiPropertyOptional({ example: 'Mon - Sat: 8am - 6pm' })
  opening_hours?: string;

  @ApiPropertyOptional({ example: 'https://mlimafresh.co.ke' })
  website?: string;
}
