import { Injectable, Logger } from '@nestjs/common';
import { query } from '@anthropic-ai/claude-agent-sdk';

export interface AgentChunk {
  type: 'session' | 'thinking' | 'text' | 'done';
  sessionId?: string;
  content?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_cost_usd?: number;
  };
}

/**
 * AgentSdkService
 *
 * Wraps @anthropic-ai/claude-agent-sdk's query() function.
 * Supports session persistence via resumeSessionId.
 *
 * Full chain:
 *   query() → Claude CLI (ANTHROPIC_BASE_URL) → our proxy → DeepSeek
 */
@Injectable()
export class AgentSdkService {
  private readonly logger = new Logger(AgentSdkService.name);

  async *run(
    prompt: string,
    resumeSessionId?: string,
  ): AsyncGenerator<AgentChunk, void, undefined> {
    this.logger.log(`Agent SDK run: "${prompt.slice(0, 60)}..."${resumeSessionId ? ' (resume)' : ''}`);

    let fullContent = '';
    let fullThinking = '';
    let sdkSessionId: string | undefined;
    let sessionYielded = false;

    try {
      const q = query({
        prompt,
        options: {
          env: {
            ...process.env as Record<string, string>,
            ANTHROPIC_BASE_URL: 'http://localhost:3001',
            ANTHROPIC_API_KEY: 'test-key',
          },
          cwd: '/tmp',
          tools: [],
          maxTurns: 1,
          permissionMode: 'bypassPermissions',
          includePartialMessages: true,
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        },
      });

      for await (const msg of q) {
        // Capture SDK session ID from first message for persistence
        if (!sdkSessionId) {
          sdkSessionId = (msg as any).session_id;
          if (sdkSessionId && !sessionYielded) {
            sessionYielded = true;
            yield { type: 'session', sessionId: sdkSessionId };
          }
        }

        switch (msg.type) {
          case 'stream_event': {
            const event = (msg as any).event;
            if (!event) break;
            switch (event.type) {
              case 'content_block_delta': {
                const delta = event.delta;
                if (delta?.type === 'text_delta' && delta.text) {
                  fullContent += delta.text;
                  yield { type: 'text', content: delta.text };
                } else if (delta?.type === 'thinking_delta' && delta.thinking) {
                  fullThinking += delta.thinking;
                  yield { type: 'thinking', content: delta.thinking };
                }
                break;
              }
            }
            break;
          }
          case 'result': {
            const result = msg as any;
            yield {
              type: 'done',
              usage: {
                input_tokens: result.usage?.input_tokens ?? 0,
                output_tokens: result.usage?.output_tokens ?? 0,
                total_cost_usd: result.total_cost_usd,
              },
            };
            break;
          }
        }
      }
    } catch (error: any) {
      this.logger.error('Agent SDK error:', error.message);
      throw error;
    }
  }
}
