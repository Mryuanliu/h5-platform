'use client';

import { useState, useRef, useCallback } from 'react';

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  thinkingChain?: string;
}

export function useChatSSE() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [ttfb, setTtfb] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    // Add placeholder assistant message (will be updated via SSE)
    setMessages((prev) => [...prev, { role: 'assistant', content: '', thinkingChain: '' }]);
    setIsStreaming(true);

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    let fullContent = '';
    let fullThinking = '';

    try {
      // Call the SDK full chain: query() → proxy → DeepSeek
      const res = await fetch('http://localhost:3001/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text }),
        signal: abortCtrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buf = '';
      let lastEvent = '';

      const updateLastAssistant = (updater: (msg: ChatMessage) => ChatMessage) => {
        setMessages((prev) => {
          const arr = [...prev];
          const last = arr[arr.length - 1];
          if (last?.role === 'assistant') arr[arr.length - 1] = updater(last);
          return arr;
        });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (trimmed.startsWith('event: ')) {
            lastEvent = trimmed.slice(7);
            continue;
          }

          if (trimmed.startsWith('data: ')) {
            const payload = trimmed.slice(6);
            let data: Record<string, any>;
            try { data = JSON.parse(payload); } catch { continue; }

            switch (lastEvent) {
              case 'meta':
                if (data.ttfbMs != null) setTtfb(data.ttfbMs);
                if (data.messageId) {
                  updateLastAssistant((msg) => ({ ...msg, id: data.messageId }));
                }
                break;

              case 'thinking':
                fullThinking += data.content || '';
                updateLastAssistant((msg) => ({
                  ...msg,
                  thinkingChain: fullThinking,
                }));
                break;

              case 'text':
                fullContent += data.content || '';
                updateLastAssistant((msg) => ({
                  ...msg,
                  content: fullContent,
                  thinkingChain: fullThinking,
                }));
                break;

              case 'done':
                // Final update with complete content
                updateLastAssistant((msg) => ({
                  ...msg,
                  content: fullContent,
                  thinkingChain: fullThinking,
                }));
                break;

              case 'error':
                throw new Error(data.message || 'SSE error');
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.error('Chat SSE error:', err);
      setMessages((prev) => {
        const arr = [...prev];
        const last = arr[arr.length - 1];
        if (last?.role === 'assistant') {
          arr[arr.length - 1] = { ...last, content: `❌ ${err.message}` };
        }
        return arr;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [isStreaming]);

  return { messages, isStreaming, sendMessage, ttfb };
}
