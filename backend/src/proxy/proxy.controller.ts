import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  HttpCode,
  Headers,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';

/**
 * Anthropic-compatible API proxy controller.
 * Exposes POST /v1/messages in Anthropic API format,
 * converts requests to OpenAI/DeepSeek format, and converts responses back.
 *
 * This allows @anthropic-ai/claude-agent-sdk (via ANTHROPIC_BASE_URL env)
 * to think it's talking to Anthropic when it's actually using DeepSeek.
 */
@Controller('v1/messages')
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @Post()
  @HttpCode(200)
  async handleMessages(
    @Body() body: any,
    @Res() res: Response,
    @Req() req: Request,
    @Headers('anthropic-version') anthropicVersion?: string,
  ) {
    // Validate required fields
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return res.status(400).json({
        type: 'error',
        error: { type: 'invalid_request_error', message: 'messages is required' },
      });
    }

    // Validate API key header
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({
        type: 'error',
        error: { type: 'authentication_error', message: 'x-api-key header is required' },
      });
    }

    try {
      if (body.stream) {
        // Streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        await this.proxyService.streamMessage(body, res);
      } else {
        // Non-streaming response
        const result = await this.proxyService.sendMessage(body);
        res.json(result);
      }
    } catch (error) {
      console.error('Proxy error:', error);
      // If headers already sent, end the stream
      if (res.headersSent) {
        res.end();
        return;
      }
      res.status(500).json({
        type: 'error',
        error: {
          type: 'internal_server_error',
          message: error.message || 'Internal server error',
        },
      });
    }
  }
}
