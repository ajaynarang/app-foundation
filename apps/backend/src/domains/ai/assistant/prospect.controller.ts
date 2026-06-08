import { Controller, Get, Post, Param, Body, Headers, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../../../auth/decorators/public.decorator';
import { ProspectService } from './prospect.service';
import { SendMessageDto } from './dto/send-message.dto';
import type { Request, Response } from 'express';

@ApiTags('Sally AI Prospect (Public)')
@Controller('prospect/conversations')
@Public()
export class ProspectController {
  constructor(private readonly service: ProspectService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @ApiOperation({ summary: 'Create a new anonymous prospect conversation' })
  async createConversation() {
    return this.service.createConversation();
  }

  @Post(':conversationId/messages')
  @Throttle({ default: { limit: 50, ttl: 3600000 } })
  @ApiOperation({
    summary: 'Send a message and stream Sally AI response (prospect)',
  })
  async sendMessage(
    @Param('conversationId') conversationId: string,
    @Headers('x-session-token') sessionToken: string,
    @Body() dto: SendMessageDto,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!sessionToken) {
      res.status(401).json({ statusCode: 401, message: 'Missing X-Session-Token header' });
      return;
    }
    return this.service.streamMessage(conversationId, sessionToken, dto.content, dto.inputMode, req, res);
  }

  @Get(':conversationId/messages')
  @Throttle({ default: { limit: 100, ttl: 3600000 } })
  @ApiOperation({ summary: 'Get messages for a prospect conversation' })
  async getMessages(@Param('conversationId') conversationId: string, @Headers('x-session-token') sessionToken: string) {
    if (!sessionToken) {
      throw new UnauthorizedException('Missing X-Session-Token header');
    }
    return this.service.getMessages(conversationId, sessionToken);
  }
}
