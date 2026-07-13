import { Injectable, Logger } from '@nestjs/common';
import { query } from '@anthropic-ai/claude-agent-sdk';
import * as path from 'path';
import * as fs from 'fs';

export interface AgentChunk {
  type: 'session' | 'thinking' | 'text' | 'tool_start' | 'tool_end'
       | 'tool_progress' | 'status' | 'command_output' | 'done';
  sessionId?: string;
  content?: string;
  toolName?: string;
  toolId?: string;
  toolInput?: any;
  toolResult?: string;
  /** For status events (e.g. "File created at ...") */
  subtype?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    total_cost_usd?: number;
  };
}

@Injectable()
export class AgentSdkService {
  private readonly logger = new Logger(AgentSdkService.name);
  private outputDir: string;

  constructor() {
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

    let sdkSessionId: string | undefined;
    let sessionYielded = false;

    const makeQuery = (resume?: string) => query({
      prompt,
      options: {
        env: {
          ...process.env as Record<string, string>,
          ANTHROPIC_BASE_URL: 'http://localhost:3001',
          ANTHROPIC_API_KEY: 'test-key',
        },
        cwd: this.outputDir,
        tools: { type: 'preset', preset: 'claude_code' },
        maxTurns: 20,
        permissionMode: 'bypassPermissions',
        includePartialMessages: true,
        sandbox: {
          enabled: true,
          failIfUnavailable: false,
          filesystem: { allowWrite: [this.outputDir], allowRead: ['/tmp', this.outputDir] },
          network: { allowedDomains: ['api.deepseek.com', 'api.anthropic.com'] },
        },
        ...(resume ? { resume } : {}),
      },
    });

    try {
      // Attempt resume; fall back to fresh session if session deleted
      const tryQuery = async (): Promise<Awaited<ReturnType<typeof makeQuery>>> => {
        try {
          return makeQuery(resumeSessionId);
        } catch (e: any) {
          if (resumeSessionId && (e.message?.includes('No conversation found') || e.message?.includes('not found'))) {
            this.logger.warn(`Session ${resumeSessionId} not found, starting fresh`);
            return makeQuery();
          }
          throw e;
        }
      };

      const q = await tryQuery();

      for await (const msg of q) {
        // Capture session ID from any message
        if (!sdkSessionId) {
          sdkSessionId = (msg as any).session_id;
          if (sdkSessionId && !sessionYielded) {
            sessionYielded = true;
            yield { type: 'session', sessionId: sdkSessionId };
          }
        }

        switch (msg.type) {

          // ── Raw API streaming events (thinking, text, tool use) ──
          case 'stream_event': {
            const ev = (msg as any).event;
            if (!ev) continue;

            if (ev.type === 'content_block_start' && ev.content_block?.type === 'tool_use') {
              yield { type: 'tool_start', toolName: ev.content_block.name, toolId: ev.content_block.id, toolInput: ev.content_block.input || {} };
              continue;
            }

            if (ev.type === 'content_block_delta') {
              const d = ev.delta;
              if (d?.type === 'thinking_delta' && d.thinking) yield { type: 'thinking', content: d.thinking };
              if (d?.type === 'text_delta' && d.text) yield { type: 'text', content: d.text };
              continue;
            }

            // content_block_start for thinking/text are not emitted (we let deltas handle it)
            // content_block_stop is ignored (no UI value)
            continue;
          }

          // ── Tool execution progress (agent is running a tool) ──
          case 'tool_progress': {
            const tp = msg as any;
            yield { type: 'tool_progress', toolName: tp.tool_name, toolId: tp.tool_use_id, subtype: tp.status || 'running' };
            continue;
          }

          // ── Status updates (file written, command output, etc.) ──
          case 'system': {
            const sm = msg as any;
            yield { type: 'status', content: typeof sm.text === 'string' ? sm.text : undefined, subtype: sm.subtype };
            continue;
          }

          // ── Complete assistant message (end of a turn) ──
          case 'assistant': {
            // Assistant messages containing tool_use blocks indicate a tool was called.
            // The tool_result will come in subsequent messages.
            // Just pass through — the deltas already carried the thinking/text.
            continue;
          }

          // ── Final result ──
          case 'result': {
            const result = msg as any;
            yield { type: 'done', usage: { input_tokens: result.usage?.input_tokens ?? 0, output_tokens: result.usage?.output_tokens ?? 0, total_cost_usd: result.total_cost_usd } };
            continue;
          }

          // ── Everything else (user messages, etc.) — forward as status ──
          default:
            continue;
        }
      }
    } catch (error: any) {
      this.logger.error('Agent SDK error:', error.message);
      throw error;
    }
  }
}
