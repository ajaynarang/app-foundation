import { Controller, Get, Post, Body, Query, Logger, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '@appshore/platform/auth/decorators/public.decorator';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { DevService } from './dev.service';
import { SwitchUserDto } from './dto/switch-user.dto';
import { DevAuthGuard } from './guards/dev-auth.guard';

// DevAuthGuard enforces DEV_AUTH_SECRET header presence and exactness with
// constant-time comparison. When DEV_AUTH_SECRET is unset (prod), the guard
// throws NotFoundException so the route behaves as if it doesn't exist.
@ApiTags('Dev Tools')
@Controller('dev')
@UseGuards(DevAuthGuard)
export class DevController {
  private readonly logger = new Logger(DevController.name);

  constructor(private devService: DevService) {}

  @Public()
  @Get('users')
  @SkipThrottle()
  @ApiOperation({
    summary: '[DEV ONLY] List all users grouped by tenant and role',
  })
  async getUsers(@Query('tenantId') tenantId?: string) {
    return this.devService.getUsers(tenantId);
  }

  @Public()
  @Post('switch')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: '[DEV ONLY] Switch to any user — issues real JWT tokens',
  })
  async switchUser(@Body() dto: SwitchUserDto, @Req() req: Request) {
    const ip = req.ip ?? null;
    const ua = req.get('user-agent') ?? null;
    this.logger.log(`dev-switch audit: userId=${dto.userId} ip=${ip ?? 'unknown'} ua="${ua ?? 'unknown'}"`);
    return this.devService.switchToUser(dto.userId, { ip, userAgent: ua });
  }
}
