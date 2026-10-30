import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { CurrentUser, User } from '@app/common';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import {
  ApiBody,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Starts a session: sets the short-lived Authentication cookie and the
   * Refresh cookie, and returns the user.
   */
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @ApiBody({ type: LoginDto })
  @ApiUnauthorizedResponse({ description: 'Credentials are not valid.' })
  @ApiTooManyRequestsResponse({
    description: 'Too many attempts for this email from this address.',
  })
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
   * Exchanges the Refresh cookie for new Authentication and Refresh cookies.
   * Each refresh token works once; presenting a used one ends the session.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiUnauthorizedResponse({
    description: 'No refresh token, or it is expired, revoked or used.',
  })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.refresh(request, response);
  }

  /** Ends this session and clears the cookies. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(request, response);
  }

  /** Ends every session of the signed-in user, on every device. */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiNoContentResponse()
  async logoutEverywhere(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logoutEverywhere(user, response);
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
