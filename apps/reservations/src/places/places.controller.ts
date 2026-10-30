import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles } from '@app/common';
import { PlacesService } from './places.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { ADMIN_ROLE } from '../reservations.service';

@ApiTags('places')
@Controller('places')
export class PlacesController {
  constructor(private readonly placesService: PlacesService) {}

  /** Lists a new place. Admin only. */
  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles(ADMIN_ROLE)
  @ApiCookieAuth()
  @ApiSecurity('authentication-header')
  @ApiForbiddenResponse({ description: 'Caller is not an admin.' })
  create(@Body() createPlaceDto: CreatePlaceDto) {
    return this.placesService.create(createPlaceDto);
  }

  /** All places. Public. */
  @Get()
  findAll() {
    return this.placesService.findAll();
  }

  /** One place. Public. */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.placesService.findOne(id);
  }

  /** Changes a place. A new price applies to later bookings only. Admin only. */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @Roles(ADMIN_ROLE)
  @ApiCookieAuth()
  @ApiSecurity('authentication-header')
  @ApiForbiddenResponse({ description: 'Caller is not an admin.' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePlaceDto: UpdatePlaceDto,
  ) {
    return this.placesService.update(id, updatePlaceDto);
  }

  /** Booked stays between two dates (`to` exclusive, at most 366 days). Public. */
  @Get(':id/availability')
  availability(
    @Param('id', ParseIntPipe) id: number,
    @Query() { from, to }: AvailabilityQueryDto,
  ) {
    return this.placesService.availability(id, from, to);
  }
}
