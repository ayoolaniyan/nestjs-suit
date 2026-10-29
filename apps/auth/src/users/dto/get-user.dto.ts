import { IsInt, IsPositive } from 'class-validator';

export class GetUserDto {
  @IsInt()
  @IsPositive()
  id: number;
}
