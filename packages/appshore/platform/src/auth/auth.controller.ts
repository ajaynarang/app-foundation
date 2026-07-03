import { Controller, Post, Get, Patch, Body, UseGuards, Res, Req, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { Response, Request as ExpressRequest } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { LoginResponseDto, UserProfileDto } from './dto/login.dto';
import { PasswordLoginDto, ForgotPasswordDto, ResetPasswordDto } from './dto/password-login.dto';
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
import {
  AUTH_THROTTLE_TTL_MS,
  AUTH_THROTTLE_LIMIT_STRICT,
  AUTH_THROTTLE_LIMIT_OTP_SEND,
  REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
  REFRESH_TOKEN_COOKIE_NAME,
  REFRESH_TOKEN_COOKIE_PATH,
} from '../constants';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);
  private readonly isProduction: boolean;

  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    this.isProduction = this.configService.get<string>('environment') === 'production';
  }

  /** Set refresh token as httpOnly cookie on the response. */
  private setRefreshTokenCookie(response: Response, refreshToken: string): void {
    // When set, the cookie domain should cover all subdomains (e.g. a leading-dot
    // domain like `.example.com`) so the refresh cookie is sent on cross-subdomain
    // requests. Without this, browsers may treat the cookie as third-party and
    // block it — causing unexpected logouts after the access token expires.
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');

    response.cookie(REFRESH_TOKEN_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
      maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE_MS,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
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
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request a password reset link (always 200 — no account enumeration)' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200 })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return { success: true };
  }

  @Public()
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT },
  })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a password reset with a one-time token' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { success: true };
  }

  @Public()
  @Post('firebase/exchange')
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
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ApiResponse({ status: 401 })
  async refreshToken(@CurrentUser() user: any) {
    const result = await this.authService.refreshAccessToken(user.userId, user.tokenId);
    return { accessToken: result.accessToken, user: result.user };
  }

  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 200 })
  async logout(@CurrentUser() user: any, @Res({ passthrough: true }) response: Response) {
    if (user.tokenId) await this.authService.logout(user.tokenId, user.dbId, user.tenantDbId ?? null);
    const cookieDomain = this.configService.get<string>('COOKIE_DOMAIN');
    response.clearCookie(REFRESH_TOKEN_COOKIE_NAME, {
      httpOnly: true,
      secure: this.isProduction,
      sameSite: 'lax',
      path: REFRESH_TOKEN_COOKIE_PATH,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
    return { message: 'Logout successful' };
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
    return { success: true, sessionsRevoked };
  }

  @Public()
  @Throttle({
    default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_OTP_SEND },
  })
  @Post('phone/send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to phone number' })
  @ApiResponse({ status: 200 })
  async sendPhoneOtp(@Body() dto: SendOtpDto): Promise<{ message: string }> {
    await this.authService.sendPhoneOtp(dto.phone);
    return {
      message: 'If this phone number is registered, a code has been sent.',
    };
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set or update 4-digit PIN' })
  @ApiResponse({ status: 200 })
  async setPin(@CurrentUser() user: any, @Body() dto: SetPinDto): Promise<{ message: string }> {
    await this.authService.setPin(user.userId, dto.pin);
    return { message: 'PIN set successfully' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('phone/add-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Add phone number to existing account and send OTP',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 409 })
  async addPhone(@CurrentUser() user: any, @Body() dto: AddPhoneDto): Promise<{ message: string }> {
    await this.authService.addPhone(user.userId, dto.phone);
    return { message: 'Verification code sent to your phone' };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('phone/verify-add-phone')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP to confirm phone number on existing account',
  })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 401 })
  async verifyAddPhone(@CurrentUser() user: any, @Body() dto: VerifyOtpDto): Promise<{ message: string }> {
    await this.authService.verifyAndAddPhone(user.userId, dto.phone, dto.code);
    return { message: 'Phone number verified and added to your account' };
  }
}
