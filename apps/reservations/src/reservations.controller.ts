import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Headers,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { ADMIN_ROLE, ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { CurrentUser, JwtAuthGuard, Roles, User } from '@app/common';

// Stripe's limit on idempotency key length.
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

@ApiTags('reservations')
@ApiCookieAuth()
@ApiSecurity('authentication-header')
@UseGuards(JwtAuthGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  /**
   * Books a place and charges for it. The price is nights × the place's
   * nightly rate.
   */
  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      'Unique per booking attempt; reuse it when retrying so a timeout followed by a retry cannot book or charge twice.',
  })
  @ApiConflictResponse({
    description:
      'The dates are taken, or the Idempotency-Key belongs to another attempt.',
  })
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

  /** The caller's reservations (every reservation, for an admin). */
  @Get()
  async findAll(@CurrentUser() user: User) {
    return this.reservationsService.findAll(user);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.reservationsService.findOne(id, user);
  }

  /** Cancels a confirmed reservation before check-in and refunds it in full. */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiConflictResponse({ description: 'The reservation is not confirmed.' })
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.reservationsService.cancel(id, user);
  }

  /** Deletes the record outright, without a refund. Admin only. */
  @Delete(':id')
  @Roles(ADMIN_ROLE)
  @ApiForbiddenResponse({ description: 'Caller is not an admin.' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.reservationsService.remove(id, user);
  }
}
