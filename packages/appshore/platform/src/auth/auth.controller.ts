import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  UseGuards,
  Res,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Response, Request as ExpressRequest } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiNoContentResponse } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { RefreshSessionService, type RefreshSession } from './refresh-session.service';
import { LoginResponseDto, UserProfileDto } from './dto/login.dto';
import { PasswordLoginDto, ForgotPasswordDto, ResetPasswordDto, PersonalRegisterDto } from './dto/password-login.dto';
import { FirebaseExchangeDto } from './dto/firebase-exchange.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { SetPinDto } from './dto/set-pin.dto';
import { AddPhoneDto } from './dto/add-phone.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto, ChangePasswordResponseDto } from './dto/change-password.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshJwtAuthGuard } from './guards/refresh-jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { AUTH_THROTTLE_TTL_MS, AUTH_THROTTLE_LIMIT_STRICT, AUTH_THROTTLE_LIMIT_OTP_SEND } from '../constants';
import { clearRefreshTokenCookie, setRefreshTokenCookie, type RefreshTokenCookieContext } from './refresh-token-cookie';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly isProduction: boolean;

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private refreshSessions: RefreshSessionService,
  ) {
    this.isProduction = this.configService.get<string>('environment') === 'production';
  }

  private get refreshCookieContext(): RefreshTokenCookieContext {
    return { secure: this.isProduction, legacyDomain: this.configService.get<string>('COOKIE_DOMAIN') || undefined };
  }

  /** Set the refresh token as a host-only httpOnly cookie (see refresh-token-cookie.ts). */
  private setRefreshTokenCookie(response: Response, refreshToken: string): void {
    setRefreshTokenCookie(response, refreshToken, this.refreshCookieContext);
  }

  @Public()
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT },
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'First-party email + password login' })
  @ApiBody({ type: PasswordLoginDto })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401 })
  async login(
    @Body() dto: PasswordLoginDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.loginWithPassword(dto, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    this.setRefreshTokenCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT },
  })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Personal-mode signup — creates the user and their own workspace (404 unless TENANCY_MODE=personal)',
  })
  @ApiBody({ type: PersonalRegisterDto })
  async registerPersonal(
    @Body() dto: PersonalRegisterDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (this.configService.get<string>('multiTenancy.mode') !== 'personal') {
      throw new NotFoundException();
    }
    const result = await this.authService.registerPersonal(dto, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    this.setRefreshTokenCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT },
  })
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Request a password reset link (always 204, so an account cannot be probed)' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiNoContentResponse()
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<void> {
    await this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT },
  })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Complete a password reset with a one-time token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiNoContentResponse()
  @ApiResponse({ status: 401 })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.authService.resetPassword(dto);
  }

  @Public()
  @Post('firebase/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange Firebase token for app JWT' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  async exchangeFirebaseToken(
    @Body() dto: FirebaseExchangeDto,
    @Req() req: ExpressRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.exchangeFirebaseToken(dto, {
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    this.setRefreshTokenCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @UseGuards(RefreshJwtAuthGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token (rotates the refresh cookie)' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401 })
  async refreshToken(@CurrentUser() session: RefreshSession, @Res({ passthrough: true }) response: Response) {
    const result = await this.refreshSessions.refresh(session);
    // Every refresh rotates: the cookie now holds the successor. The token it replaced stays valid until the
    // successor is first presented, so a lost response does not log the client out.
    this.setRefreshTokenCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiNoContentResponse()
  async logout(@CurrentUser() user: any, @Res({ passthrough: true }) response: Response): Promise<void> {
    if (user.tokenId) await this.authService.logout(user.tokenId, user.dbId, user.tenantDbId ?? null);
    clearRefreshTokenCookie(response, this.refreshCookieContext);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  async getProfile(@CurrentUser() user: any): Promise<UserProfileDto> {
    return this.authService.getProfile(user.userId);
  }

  @ApiBearerAuth()
  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  async updateProfile(@CurrentUser() user: any, @Body() dto: UpdateProfileDto): Promise<UserProfileDto> {
    return this.authService.updateProfile(user.userId, dto);
  }

  @ApiBearerAuth()
  @Patch('password')
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT },
  })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record password change and optionally revoke other sessions',
  })
  @ApiResponse({ status: 200, type: ChangePasswordResponseDto })
  async changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto): Promise<ChangePasswordResponseDto> {
    const revokeOtherSessions = dto.revokeOtherSessions !== false;
    const { sessionsRevoked } = await this.authService.recordPasswordChange(
      user.userId,
      user.tokenId || null,
      revokeOtherSessions,
      { currentPassword: dto.currentPassword, newPassword: dto.newPassword },
    );
    return { sessionsRevoked };
  }

  @Public()
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_OTP_SEND },
  })
  @Post('phone/send-otp')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Send OTP to phone number (always 204, so a number cannot be probed)' })
  @ApiNoContentResponse()
  async sendPhoneOtp(@Body() dto: SendOtpDto): Promise<void> {
    await this.authService.sendPhoneOtp(dto.phone);
  }

  @Public()
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT },
  })
  @Post('phone/verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and issue JWT tokens' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.loginWithOtp(dto);
    this.setRefreshTokenCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT },
  })
  @Post('phone/login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with phone number and PIN' })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  async phoneLogin(@Body() dto: PhoneLoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.loginWithPhone(dto);
    this.setRefreshTokenCookie(response, result.refreshToken);
    return { accessToken: result.accessToken, user: result.user };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('phone/set-pin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Set or update 4-digit PIN' })
  @ApiNoContentResponse()
  async setPin(@CurrentUser() user: any, @Body() dto: SetPinDto): Promise<void> {
    await this.authService.setPin(user.userId, dto.pin);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('phone/add-phone')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Add phone number to existing account and send OTP',
  })
  @ApiNoContentResponse()
  @ApiResponse({ status: 409 })
  async addPhone(@CurrentUser() user: any, @Body() dto: AddPhoneDto): Promise<void> {
    await this.authService.addPhone(user.userId, dto.phone);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('phone/verify-add-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP to confirm phone number on existing account',
  })
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiResponse({ status: 401 })
  async verifyAddPhone(@CurrentUser() user: any, @Body() dto: VerifyOtpDto): Promise<UserProfileDto> {
    await this.authService.verifyAndAddPhone(user.userId, dto.phone, dto.code);
    // The resource as it is now: the profile, with the phone on it.
    return this.authService.getProfile(user.userId);
  }
}
