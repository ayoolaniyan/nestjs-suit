import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { ADMIN_ROLE, ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationDto } from './dto/update-reservation.dto';
import { CurrentUser, JwtAuthGuard, Roles, User } from '@app/common';

// Stripe's limit on idempotency key length.
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  /**
   * Clients should send a unique Idempotency-Key per reservation attempt and
   * reuse it when retrying, so a timeout followed by a retry does not charge
   * the card twice.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(
    @Body() createReservationDto: CreateReservationDto,
    @CurrentUser() user: User,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (idempotencyKey && idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
      throw new BadRequestException(
        `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`,
      );
    }
    return this.reservationsService.create(
      createReservationDto,
      user,
      idempotencyKey,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@CurrentUser() user: User) {
    return this.reservationsService.findAll(user);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.reservationsService.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateReservationDto: UpdateReservationDto,
    @CurrentUser() user: User,
  ) {
    return this.reservationsService.update(id, updateReservationDto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(ADMIN_ROLE)
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.reservationsService.remove(id, user);
  }
}
