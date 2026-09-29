import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WEEK_DAYS, type WeekDay } from '@org/models/opening-hours';

export class OpeningDayDto {
  @ApiProperty({ enum: WEEK_DAYS.map((day) => day.key), example: 'mon' })
  day!: WeekDay;

  @ApiProperty({ example: '08:00', description: '24-hour HH:mm' })
  open!: string;

  @ApiProperty({
    example: '18:00',
    description: '24-hour HH:mm, later than open',
  })
  close!: string;
}

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

  @ApiPropertyOptional({
    type: [OpeningDayDto],
    description: 'Open days only; leave out the days the shop is closed.',
    example: [
      { day: 'mon', open: '08:00', close: '18:00' },
      { day: 'sat', open: '09:00', close: '13:00' },
    ],
  })
  opening_hours?: OpeningDayDto[];

  @ApiPropertyOptional({ example: 'https://mlimafresh.co.ke' })
  website?: string;
}
