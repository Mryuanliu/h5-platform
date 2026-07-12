import { Injectable, Logger } from '@nestjs/common';

export interface DeepSeekChunk {
  type: 'thinking' | 'text';
  content: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoningContent?: string; // DeepSeek requires reasoning_content to be echoed back
}

@Injectable()
export class DeepseekService {
  private readonly logger = new Logger(DeepseekService.name);

  async *streamChat(
    messages: ChatMessage[],
  ): AsyncGenerator<DeepSeekChunk, void, undefined> {
    // Transform messages: inject reasoning_content for assistant messages
    const transformedMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.reasoningContent ? { reasoning_content: m.reasoningContent } : {}),
    }));

    const body: Record<string, unknown> = {
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      messages: transformedMessages,
      max_tokens: 4096,
      stream: true,
      stream_options: { include_usage: true },
    };

    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => 'unknown');
      throw new Error(`DeepSeek API ${response.status}: ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      const lines = buf.split('\n');
      buf = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;

        let chunk: Record<string, any>;
        try { chunk = JSON.parse(payload); } catch { continue; }

        if (!chunk.choices?.length) continue;

        const delta = chunk.choices[0].delta || {};
        const rc = (delta as any).reasoning_content;
        const text = delta.content;

        if (rc) yield { type: 'thinking' as const, content: rc };
        if (text) yield { type: 'text' as const, content: text };
      }
    }
  }
}
