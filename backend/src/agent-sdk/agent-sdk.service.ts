import { Injectable, Logger } from '@nestjs/common';
import { query } from '@anthropic-ai/claude-agent-sdk';

export interface AgentChunk {
  type: 'thinking' | 'text' | 'done';
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
 * The SDK spawns a Claude Code CLI subprocess, which calls
 * ANTHROPIC_BASE_URL (→ our proxy on localhost:3001).
 * Our proxy translates Anthropic API ↔ DeepSeek API.
 *
 * Full chain:
 *   ts query() → Claude CLI subprocess → POST /v1/messages (our proxy)
 *   → Anthropic→OpenAI conversion → DeepSeek API
 *   → OpenAI→Anthropic conversion → SSE events → CLI process → SDK yields messages
 */
@Injectable()
export class AgentSdkService {
  private readonly logger = new Logger(AgentSdkService.name);

  async *run(prompt: string): AsyncGenerator<AgentChunk, void, undefined> {
    this.logger.log(`Agent SDK run: "${prompt.slice(0, 60)}..."`);

    let fullContent = '';
    let fullThinking = '';
    let blockIndex = 0; // tracks current content block index from proxy

    try {
      // The SDK spawns a Claude CLI subprocess.
      // We inject ANTHROPIC_BASE_URL so the CLI's internal SDK
      // routes all API calls to our proxy at localhost:3001.
      const q = query({
        prompt,
        options: {
          env: {
            ...process.env as Record<string, string>,
            ANTHROPIC_BASE_URL: 'http://localhost:3001',
            ANTHROPIC_API_KEY: 'test-key',
          },
          cwd: '/tmp',
          // Disable built-in tools — this is a chat, not an agent task
          tools: [],
          // Single turn — no follow-up tool calls
          maxTurns: 1,
          // Bypass permission prompts (no interactive UI)
          permissionMode: 'bypassPermissions',
          // Get real-time streaming events
          includePartialMessages: true,
        },
      });

      for await (const msg of q) {
        switch (msg.type) {
          // ── Real-time streaming events ──
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
              case 'content_block_start': {
                // Track when thinking/text blocks start
                blockIndex = event.index;
                break;
              }
            }
            break;
          }

          // ── Complete assistant message ──
          case 'assistant': {
            // This fires after the full message is assembled.
            // Extract final content from the BetaMessage
            const betaMsg = (msg as any).message;
            if (betaMsg?.content) {
              for (const block of betaMsg.content) {
                if (block.type === 'text' && block.text) {
                  // Full content is already streamed, but verify
                } else if (block.type === 'thinking' && block.thinking) {
                  // Full thinking already streamed
                }
              }
            }
            break;
          }

          // ── Final result ──
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
