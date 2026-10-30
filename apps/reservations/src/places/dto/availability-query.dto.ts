import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({ type: String, format: 'date', example: '2026-12-01' })
  @IsDate()
  @Type(() => Date)
  from: Date;

  @ApiProperty({
    type: String,
    format: 'date',
    example: '2026-12-31',
    description: 'Exclusive.',
  })
  @IsDate()
  @Type(() => Date)
  to: Date;
}
