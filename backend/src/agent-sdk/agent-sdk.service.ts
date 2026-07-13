import { Injectable, Logger } from '@nestjs/common';
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as path from 'path';
import * as fs from 'fs';

export interface AgentChunk {
  type: 'session' | 'thinking' | 'text' | 'tool_start' | 'tool_end' | 'done';
  sessionId?: string;
  content?: string;
  /** For tool_start/tool_end */
  toolName?: string;
  toolId?: string;
  toolInput?: any;
  toolResult?: string;
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
 * Sandbox is enabled to restrict file writes to the output directory.
 */
@Injectable()
export class AgentSdkService {
  private readonly logger = new Logger(AgentSdkService.name);
  private outputDir: string;

  constructor() {
    // Resolve output directory — relative to project root
    this.outputDir = path.resolve(process.env.OUTPUT_DIR || './h5-output');
    fs.mkdirSync(this.outputDir, { recursive: true });
    this.logger.log(`Output directory: ${this.outputDir}`);
  }

  getOutputDir(): string {
    return this.outputDir;
  }

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
          cwd: this.outputDir,
          // Enable all built-in tools
          tools: { type: 'preset', preset: 'claude_code' },
          maxTurns: 20,
          permissionMode: 'bypassPermissions',
          includePartialMessages: true,
          // ── Sandbox: restrict filesystem + network ──
          sandbox: {
            enabled: true,
            failIfUnavailable: false, // graceful degradation if srt not installed
            filesystem: {
              allowWrite: [this.outputDir],
              allowRead: ['/tmp', this.outputDir],
            },
            network: {
              allowedDomains: ['api.deepseek.com', 'api.anthropic.com'],
            },
          },
          ...(resumeSessionId ? { resume: resumeSessionId } : {}),
        },
      });

      for await (const msg of q) {
        // Capture SDK session ID from first message
        if (!sdkSessionId) {
          sdkSessionId = (msg as any).session_id;
          if (sdkSessionId && !sessionYielded) {
            sessionYielded = true;
            yield { type: 'session', sessionId: sdkSessionId };
          }
        }

        // Handle content_block_start for tool_use
        if (msg.type === 'stream_event') {
          const event = (msg as any).event;
          if (!event) continue;

          // ── tool_use block start ──
          if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            const cb = event.content_block;
            yield {
              type: 'tool_start',
              toolName: cb.name,
              toolId: cb.id,
              toolInput: cb.input || {},
            };
            continue;
          }

          // ── content_block_delta: text, thinking, input_json ──
          if (event.type === 'content_block_delta') {
            const delta = event.delta;
            if (delta?.type === 'text_delta' && delta.text) {
              fullContent += delta.text;
              yield { type: 'text', content: delta.text };
            } else if (delta?.type === 'thinking_delta' && delta.thinking) {
              fullThinking += delta.thinking;
              yield { type: 'thinking', content: delta.thinking };
            }
          }

          // Note: content_block_stop for tool_use is handled by counting
          // OpenAI tool_calls finish → we emit tool_end in the 'result' handler
          // (The SDK's multi-turn handles tool_result internally)
          continue;
        }

        if (msg.type === 'result') {
          const result = msg as any;
          yield {
            type: 'done',
            usage: {
              input_tokens: result.usage?.input_tokens ?? 0,
              output_tokens: result.usage?.output_tokens ?? 0,
              total_cost_usd: result.total_cost_usd,
            },
          };
        }
      }
    } catch (error: any) {
      this.logger.error('Agent SDK error:', error.message);
      throw error;
    }
  }
}
