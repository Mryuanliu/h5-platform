'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface ToolCall {
  toolName: string;
  toolId: string;
  toolInput?: any;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  thinkingChain?: string;
  tools?: ToolCall[];
}

/**
 * SSE hook for the agent run endpoint.
 * Supports loading initial messages from DB and session resume.
 */
export function useChatSSE(opts?: {
  initialMessages?: ChatMessage[];
  initialConversationId?: string;
  initialSdkSessionId?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(opts?.initialMessages || []);
  const [isStreaming, setIsStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(opts?.initialConversationId || null);
  const [sdkSessionId, setSdkSessionId] = useState<string | null>(opts?.initialSdkSessionId || null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync when opts change (e.g. historical conversation loaded)
  useEffect(() => {
    if (opts?.initialMessages) setMessages(opts.initialMessages);
    if (opts?.initialConversationId) setConversationId(opts.initialConversationId);
    if (opts?.initialSdkSessionId) setSdkSessionId(opts.initialSdkSessionId);
  }, [opts?.initialMessages, opts?.initialConversationId, opts?.initialSdkSessionId]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setMessages((prev) => [...prev, { role: 'assistant', content: '', thinkingChain: '' }]);
    setIsStreaming(true);

    const abortCtrl = new AbortController();
    abortRef.current = abortCtrl;

    let fullContent = '';
    let fullThinking = '';

    try {
      const res = await fetch('http://localhost:3001/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: text,
          conversationId,
          resumeSessionId: sdkSessionId,
        }),
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
                if (data.conversationId) setConversationId(data.conversationId);
                if (data.sdkSessionId) setSdkSessionId(data.sdkSessionId);
                if (data.messageId) {
                  updateLastAssistant((msg) => ({ ...msg, id: data.messageId }));
                }
                break;
              case 'thinking':
                fullThinking += data.content || '';
                updateLastAssistant((msg) => ({ ...msg, thinkingChain: fullThinking }));
                break;
              case 'text':
                fullContent += data.content || '';
                updateLastAssistant((msg) => ({
                  ...msg, content: fullContent, thinkingChain: fullThinking,
                }));
                break;
              case 'tool_start':
                updateLastAssistant((msg) => ({
                  ...msg,
                  tools: [...(msg.tools || []), {
                    toolName: data.toolName,
                    toolId: data.toolId,
                    toolInput: data.toolInput,
                  }],
                }));
                break;
              case 'tool_end':
                // Could update tool status in the future
                break;
              case 'done':
                updateLastAssistant((msg) => ({
                  ...msg, content: fullContent, thinkingChain: fullThinking,
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
  }, [conversationId, sdkSessionId, isStreaming]);

  return { messages, isStreaming, sendMessage, conversationId, setMessages };
}
