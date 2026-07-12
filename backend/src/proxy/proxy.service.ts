import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

/* ── Anthropic request type definitions ── */
interface AnthropicBlock {
  type: string;
  text?: string;
  thinking?: string;
  signature?: string;
  name?: string;
  input?: any;
  tool_use_id?: string;
  content?: any;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicBlock[];
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  messages: AnthropicMessage[];
  system?: string | AnthropicBlock[];
  stream?: boolean;
  temperature?: number;
  stop_sequences?: string[];
  metadata?: Record<string, any>;
  thinking?: { type: 'enabled'; budget_tokens?: number };
  tools?: any[];
  tool_choice?: any;
  top_p?: number;
}

/**
 * ProxyService
 *
 * Translates between the Anthropic Messages API format
 * and OpenAI/DeepSeek format in both streaming and non-streaming modes.
 *
 * This lets @anthropic-ai/claude-agent-sdk (or any Anthropic SDK client)
 * believe it's talking to Anthropic when it's actually calling DeepSeek.
 */
@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);
  private defaultModel: string;

  constructor() {
    this.defaultModel = process.env.DEEPSEEK_MODEL || 'deepseek-reasoner';
    this.logger.log(`Proxy active — mapping Anthropic API → ${this.defaultModel}`);
    if (!process.env.DEEPSEEK_API_KEY) {
      this.logger.warn('DEEPSEEK_API_KEY is not set! Run: export DEEPSEEK_API_KEY=sk-...');
    }
  }

  // ──────────────────────────────────────────────
  //  PUBLIC: Streaming entry-point
  // ──────────────────────────────────────────────

  async streamMessage(req: AnthropicRequest, res: Response): Promise<void> {
    const msgId = `msg_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
    const dsMessages = this.toOpenAI(req);
    const useThinking = !!req.thinking || /reasoner|thinking/.test(this.defaultModel);

    let msgStarted = false;
    let streamEnded = false;
    let blockIdx = 0;
    let inThink = false;
    let inText = false;
    let fullThink = '';
    let fullText = '';

    const sse = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Build the DeepSeek request body
      const body: Record<string, unknown> = {
        model: this.defaultModel,
        messages: dsMessages,
        max_tokens: req.max_tokens || 4096,
        stream: true,
        stream_options: { include_usage: true },
      };
      if (req.temperature !== undefined) body.temperature = req.temperature;
      if (req.stop_sequences?.length) body.stop = req.stop_sequences;
      if (req.top_p !== undefined) body.top_p = req.top_p;
      if (useThinking) body.extra_body = { thinking_mode: process.env.DEEPSEEK_THINKING_MODE || 'thinking' };

      // Use raw fetch to sidestep OpenAI SDK typing issues with extra_body
      const raw = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!raw.ok) {
        const errText = await raw.text().catch(() => 'unknown');
        throw new Error(`DeepSeek API ${raw.status}: ${errText}`);
      }

      const reader = raw.body?.getReader();
      if (!reader) throw new Error('DeepSeek returned no body');

      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });

        // Split SSE stream on double newlines
        const lines = buf.split('\n');
        buf = lines.pop() || ''; // keep incomplete fragment

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const payload = trimmed.slice(6);
          if (payload === '[DONE]') continue;

          let chunk: Record<string, any>;
          try { chunk = JSON.parse(payload); } catch { continue; }

          // ── Token-usage-only chunk (end of stream) ──
          if (!chunk.choices && chunk.usage) {
            if (streamEnded) continue; // already finished via finish_reason
            if (inText) { sse('content_block_stop', { type: 'content_block_stop', index: blockIdx }); inText = false; }
            sse('message_delta', {
              type: 'message_delta',
              delta: { stop_reason: 'end_turn', stop_sequence: null },
              usage: { input_tokens: chunk.usage.prompt_tokens ?? 0, output_tokens: chunk.usage.completion_tokens ?? 0 },
            });
            sse('message_stop', { type: 'message_stop' });
            continue;
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;
          const delta = choice.delta || {};
          const finish = choice.finish_reason;
          const rc = (delta as any).reasoning_content;

          // ── message_start ──
          if (!msgStarted) {
            msgStarted = true;
            sse('message_start', {
              type: 'message_start',
              message: { id: msgId, type: 'message', role: 'assistant', content: [], model: req.model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
            });
          }

          // ── Thinking block ──
          if (rc && rc.length > 0) {
            if (!inThink) {
              sse('content_block_start', { type: 'content_block_start', index: blockIdx, content_block: { type: 'thinking', thinking: '' } });
              inThink = true;
            }
            fullThink += rc;
            sse('content_block_delta', { type: 'content_block_delta', index: blockIdx, delta: { type: 'thinking_delta', thinking: rc } });
          }

          // ── Text block ──
          if (delta.content && delta.content.length > 0) {
            if (inThink) {
              sse('content_block_stop', { type: 'content_block_stop', index: blockIdx });
              blockIdx++;
              inThink = false;
              // mock signature (Anthropic protocol expects this after thinking)
              const sig = `proxy:${Buffer.from(fullThink.slice(0, 32)).toString('base64').slice(0, 32)}`;
              sse('content_block_start', { type: 'content_block_start', index: blockIdx, content_block: { type: 'signature', signature: sig } });
              sse('content_block_stop', { type: 'content_block_stop', index: blockIdx });
              blockIdx++;
              sse('content_block_start', { type: 'content_block_start', index: blockIdx, content_block: { type: 'text', text: '' } });
              inText = true;
            } else if (!inText) {
              sse('content_block_start', { type: 'content_block_start', index: blockIdx, content_block: { type: 'text', text: '' } });
              inText = true;
            }
            fullText += delta.content;
            sse('content_block_delta', { type: 'content_block_delta', index: blockIdx, delta: { type: 'text_delta', text: delta.content } });
          }

          // ── Finish ──
          if (finish) {
            if (inThink) {
              sse('content_block_stop', { type: 'content_block_stop', index: blockIdx });
              blockIdx++;
              inThink = false;
              const sig = `proxy:${Buffer.from(fullThink.slice(0, 32)).toString('base64').slice(0, 32)}`;
              sse('content_block_start', { type: 'content_block_start', index: blockIdx, content_block: { type: 'signature', signature: sig } });
              sse('content_block_stop', { type: 'content_block_stop', index: blockIdx });
              blockIdx++;
            }
            if (inText) {
              sse('content_block_stop', { type: 'content_block_stop', index: blockIdx });
              inText = false;
            }
            // Always send message_delta/message_stop on finish.
            // The usage-only chunk (if it arrives later) is a duplicate but harmless.
            sse('message_delta', {
              type: 'message_delta',
              delta: { stop_reason: this.finishMap(finish), stop_sequence: null },
              usage: { input_tokens: chunk.usage?.prompt_tokens ?? 0, output_tokens: chunk.usage?.completion_tokens ?? 0 },
            });
            sse('message_stop', { type: 'message_stop' });
            streamEnded = true;
          }
        }
      }

      // Guard: close any dangling blocks if stream ended without proper events
      if (inThink) { sse('content_block_stop', { type: 'content_block_stop', index: blockIdx }); blockIdx++; }
      if (inText) { sse('content_block_stop', { type: 'content_block_stop', index: blockIdx }); }
      res.end();
    } catch (err: any) {
      this.logger.error('Streaming error:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ type: 'error', error: { type: 'api_error', message: err.message || 'DeepSeek API error' } });
        return;
      }
      try { sse('error', { type: 'error', error: { type: 'api_error', message: err.message } }); } catch { /* closed */ }
      res.end();
    }
  }

  // ──────────────────────────────────────────────
  //  PUBLIC: Non‑streaming entry-point
  // ──────────────────────────────────────────────

  async sendMessage(req: AnthropicRequest): Promise<any> {
    const msgId = `msg_${uuidv4().replace(/-/g, '').slice(0, 24)}`;
    const dsMessages = this.toOpenAI(req);
    const useThinking = !!req.thinking || /reasoner|thinking/.test(this.defaultModel);

    const body: Record<string, unknown> = {
      model: this.defaultModel,
      messages: dsMessages,
      max_tokens: req.max_tokens || 4096,
    };
    if (req.temperature !== undefined) body.temperature = req.temperature;
    if (req.stop_sequences?.length) body.stop = req.stop_sequences;
    if (req.top_p !== undefined) body.top_p = req.top_p;
    if (useThinking) body.extra_body = { thinking_mode: process.env.DEEPSEEK_THINKING_MODE || 'thinking' };

    try {
      const raw = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!raw.ok) {
        const errText = await raw.text().catch(() => 'unknown');
        throw new Error(`DeepSeek API ${raw.status}: ${errText}`);
      }

      const data: any = await raw.json();
      const choice = data.choices?.[0];
      const msg = choice?.message || {};
      const rc: string = msg.reasoning_content || '';
      const fr = choice?.finish_reason || 'stop';

      const content: AnthropicBlock[] = [];
      if (rc) {
        content.push({ type: 'thinking', thinking: rc });
        content.push({ type: 'signature', signature: `proxy:${Buffer.from(rc.slice(0, 32)).toString('base64').slice(0, 32)}` });
      }
      content.push({ type: 'text', text: msg.content || '' });

      return {
        id: msgId,
        type: 'message',
        role: 'assistant',
        content,
        model: req.model,
        stop_reason: this.finishMap(fr),
        stop_sequence: null,
        usage: { input_tokens: data.usage?.prompt_tokens ?? 0, output_tokens: data.usage?.completion_tokens ?? 0 },
      };
    } catch (err: any) {
      this.logger.error('Non-streaming error:', err.message);
      throw err;
    }
  }

  // ──────────────────────────────────────────────
  //  PRIVATE helpers
  // ──────────────────────────────────────────────

  /** Convert Anthropic message list → OpenAI message list. */
  private toOpenAI(req: AnthropicRequest): any[] {
    const out: any[] = [];
    // system prompt
    if (req.system) {
      const txt = this.textOf(req.system);
      if (txt) out.push({ role: 'system', content: txt });
    }
    for (const m of req.messages) {
      if (m.role === 'user') {
        out.push({ role: 'user', content: this.textOf(m.content) || '' });
      } else {
        const blocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
        let text = '';
        let rc = '';
        for (const b of blocks) {
          if (b.type === 'text' && b.text) text += b.text;
          else if (b.type === 'thinking' && b.thinking) rc += b.thinking;
          else if (b.type === 'tool_use') text += `[tool_use: ${b.name} ${JSON.stringify(b.input)}]`;
        }
        if (rc) {
          // DeepSeek requires reasoning_content to be echoed back
          out.push({ role: 'assistant', content: text, reasoning_content: rc });
        } else {
          out.push({ role: 'assistant', content: text || ' ' });
        }
      }
    }
    return out;
  }

  /** Extract plain text from Anthropic content (string | block[]). */
  private textOf(c: string | AnthropicBlock[]): string {
    if (typeof c === 'string') return c;
    return c.filter(b => b.type === 'text').map(b => b.text || '').join('\n');
  }

  /** OpenAI finish_reason → Anthropic stop_reason. */
  private finishMap(r: string | null): string {
    switch (r) {
      case 'stop': return 'end_turn';
      case 'length': return 'max_tokens';
      case 'content_filter': return 'content_filtered';
      case 'tool_calls': return 'tool_use';
      default: return 'end_turn';
    }
  }
}
