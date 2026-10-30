import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';
import { CurrentUser, User } from '@app/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import {
  ApiCookieAuth,
  ApiSecurity,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** Signs up. Roles cannot be set here. */
  @Post()
  @ApiUnprocessableEntityResponse({ description: 'Email already exists.' })
  async createUser(@Body() createUser: CreateUserDto) {
    return this.usersService.create(createUser);
  }

  /** The signed-in user. */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth()
  @ApiSecurity('authentication-header')
  async getUser(@CurrentUser() user: User) {
    return user;
  }
}
