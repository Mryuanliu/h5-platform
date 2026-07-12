import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  Header,
} from '@nestjs/common';
import { Response } from 'express';
import { AgentSdkService } from './agent-sdk.service';

/**
 * Test endpoint for the @anthropic-ai/claude-agent-sdk integration.
 *
 * This endpoint calls query() from the SDK, which:
 * 1. Spawns the Claude CLI subprocess
 * 2. CLI calls ANTHROPIC_BASE_URL (→ our proxy at localhost:3001)
 * 3. Proxy converts Anthropic → OpenAI format → DeepSeek
 * 4. Response flows back through the full chain
 */
@Controller('agent')
export class AgentSdkController {
  constructor(private readonly agentSdk: AgentSdkService) {}

  @Post('run')
  @HttpCode(200)
  @Header('Content-Type', 'text/event-stream')
  @Header('Cache-Control', 'no-cache')
  @Header('Connection', 'keep-alive')
  @Header('X-Accel-Buffering', 'no')
  async run(
    @Body() body: { prompt: string },
    @Res() res: Response,
  ) {
    if (!body.prompt || !body.prompt.trim()) {
      res.status(400).json({ error: 'prompt is required' });
      return;
    }

    const sendSSE = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Save start time for TTFB measurement
      const startTime = Date.now();
      let hasSentFirstToken = false;

      // Run the agent through the full SDK → Proxy → DeepSeek chain
      for await (const chunk of this.agentSdk.run(body.prompt)) {
        if (!hasSentFirstToken) {
          hasSentFirstToken = true;
          sendSSE('meta', { ttfbMs: Date.now() - startTime });
        }

        switch (chunk.type) {
          case 'thinking':
            sendSSE('thinking', { content: chunk.content });
            break;
          case 'text':
            sendSSE('text', { content: chunk.content });
            break;
          case 'done':
            sendSSE('done', { usage: chunk.usage });
            break;
        }
      }

      if (!hasSentFirstToken) {
        // No streaming happened — send a minimal done
        sendSSE('meta', { ttfbMs: 0 });
        sendSSE('done', { usage: null });
      }

      res.end();
    } catch (error: any) {
      console.error('Agent SDK endpoint error:', error.message);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'Agent SDK error' });
        return;
      }
      try {
        sendSSE('error', { message: error.message });
      } catch { /* closed */ }
      res.end();
    }
  }
}
