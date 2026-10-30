import { Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CurrentUser, User } from '@app/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { ApiBody, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Sets the Authentication cookie and returns the user. */
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiBody({ type: LoginDto })
  @ApiUnauthorizedResponse({ description: 'Credentials are not valid.' })
  async login(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.login(user, response);
    // Returned rather than passed to response.send(), which bypassed the
    // serializer interceptor and sent the password hash to the client.
    return user;
  }

  /**
   * Called over TCP by other services to resolve a token into a user.
   * The guard runs the JWT strategy, which is what actually validates the
   * token; this handler only returns what the strategy resolved.
   */
  @UseGuards(JwtAuthGuard)
  @MessagePattern('authenticate')
  async authenticate(@Payload() data: { user: User }) {
    return data.user;
  }
}
