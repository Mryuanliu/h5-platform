'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage as ChatMessageType, EventLog } from '../hooks/useChatSSE';

interface Props {
  message: ChatMessageType;
  isLast: boolean;
}

/* ── Icons ── */
function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'tool_start':
      return <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
    case 'status':
      return <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case 'command_output':
      return <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>;
    default:
      return null;
  }
}

/* ── Format tool input for display ── */
function formatToolInput(toolName: string, input: any): string {
  if (!input) return '';
  switch (toolName) {
    case 'Bash':
    case 'bash':
      return input.command || input.script || '';
    case 'Write':
    case 'write':
      return input.file_path || input.path || '';
    case 'Read':
    case 'read':
      return input.file_path || input.path || '';
    case 'TaskCreate':
      return input.title || input.description || JSON.stringify(input).slice(0, 120);
    case 'TaskUpdate':
      return JSON.stringify(input).slice(0, 120);
    case 'WebSearch':
      return input.query || '';
    case 'WebFetch':
      return input.url || '';
    default:
      const simple = JSON.stringify(input);
      return simple.length > 100 ? simple.slice(0, 100) + '…' : simple;
  }
}

/* ── Tool emoji ── */
function toolEmoji(name: string): string {
  if (/bash|sh|shell|command|exec/i.test(name)) return '💻';
  if (/write|Write/i.test(name)) return '📄';
  if (/read|Read|grep|Glob/i.test(name)) return '📖';
  if (/task|Task/i.test(name)) return '📋';
  if (/search|web/i.test(name)) return '🔍';
  if (/fetch|curl/i.test(name)) return '🌐';
  if (/ask|question/i.test(name)) return '💬';
  return '🔧';
}

/* ── Single event item ── */
function EventItem({ ev, isStreaming }: { ev: EventLog; isStreaming: boolean }) {
  switch (ev.type) {
    case 'tool_start':
      return (
        <div className="flex items-start gap-2 text-xs py-1 px-2.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/[0.12]">
          <span className="flex-shrink-0 mt-0.5">
            <EventIcon type="tool_start" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="font-semibold text-amber-300">{toolEmoji(ev.toolName)} {ev.toolName}</span>
            {ev.toolInput && (
              <div className="font-mono text-gray-400 mt-0.5 truncate hover:text-gray-300 transition-colors" title={JSON.stringify(ev.toolInput, null, 2)}>
                {formatToolInput(ev.toolName || '', ev.toolInput)}
              </div>
            )}
          </div>
        </div>
      );

    case 'tool_progress':
      return (
        <div className="flex gap-2 text-xs text-gray-500 py-0.5 pl-2.5">
          <span className="flex-shrink-0"><EventIcon type="tool_start" /></span>
          <span className="italic">{ev.toolName} {ev.subtype === 'running' ? '…' : ev.subtype}</span>
        </div>
      );

    case 'status':
      return (
        <div className="flex gap-2 text-xs text-green-300/70 py-0.5 pl-2.5">
          <span className="flex-shrink-0 mt-0.5"><EventIcon type="status" /></span>
          <span>{ev.content}</span>
        </div>
      );

    case 'command_output':
      return (
        <div className="flex gap-2 text-xs py-1 pl-2.5">
          <span className="flex-shrink-0 mt-1"><EventIcon type="command_output" /></span>
          <pre className="flex-1 bg-black/30 rounded-lg p-2.5 text-cyan-300/80 overflow-x-auto max-h-36 leading-relaxed border border-white/5">
            {ev.content}
          </pre>
        </div>
      );

    case 'thinking':
      return null; // Rendered as typewriter block via thinkingChain below

    case 'tool_update':
      return null; // Handled by updating tool_start's toolInput

    case 'text_chunk':
      return null; // Shown as final markdown content

    default:
      return null;
  }
}

export default function ChatMessage({ message, isLast }: Props) {
  const [showFullThinking, setShowFullThinking] = useState(false);
  const [typewriterChars, setTypewriterChars] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isUser = message.role === 'user';
  const hasThinking = !!message.thinkingChain && message.thinkingChain.length > 0;
  const hasEvents = !!message.events && message.events.length > 0;

  // Typewriter effect for thinkingChain: reveal chars one by one
  const thinkingLen = message.thinkingChain?.length || 0;
  useEffect(() => {
    if (!isLast || !hasThinking) {
      setTypewriterChars(thinkingLen);
      return;
    }
    // When new text arrives, gradually increase displayed chars
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTypewriterChars((prev) => {
        if (prev >= thinkingLen) {
          if (timerRef.current) clearInterval(timerRef.current);
          return thinkingLen;
        }
        return prev + 1;
      });
    }, 15); // ~15ms per char ≈ 66 chars/sec
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [thinkingLen, isLast, hasThinking]);

  // Count tool types for badges
  const toolCalls = (message.events || []).filter((e) => e.type === 'tool_start');
  // Unique tools
  const uniqueTools = [...new Set(toolCalls.map((t) => t.toolName).filter(Boolean))];

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100'
            : 'bg-white/[0.03] border border-white/[0.08] text-gray-200'
        }`}
      >
        {/* ── Event log (skip thinking/text_chunk, rendered separately below) ── */}
        {!isUser && hasEvents && (
          <div className="space-y-1 mb-3">
            {message.events!.map((ev, i) => (
              <EventItem key={`ev-${i}`} ev={ev} isStreaming={isLast} />
            ))}
          </div>
        )}

        {/* ── Thinking typewriter block ── */}
        {!isUser && hasThinking && (
          <div className="mb-3">
            <button
              onClick={() => setShowFullThinking((s) => !s)}
              className="flex items-center gap-1.5 text-[11px] text-purple-400/70 hover:text-purple-300 transition-colors mb-1"
            >
              <svg className={`w-3 h-3 transition-transform ${showFullThinking ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 4l8 6-8 6V4z" />
              </svg>
              <span>🧠 思考过程</span>
              {isLast && <span className="inline-block w-1.5 h-3.5 bg-purple-400/60 ml-0.5 animate-pulse" />}
            </button>
            <div className="text-xs text-purple-300/70 leading-relaxed pl-4 border-l-2 border-purple-500/20 font-light whitespace-pre-wrap">
              {showFullThinking
                ? message.thinkingChain
                : isLast
                  ? message.thinkingChain.slice(0, typewriterChars)
                  : message.thinkingChain.length > 200
                    ? message.thinkingChain.slice(-200) + '…'
                    : message.thinkingChain}
            </div>
          </div>
        )}

        {/* ── Tool badges ── */}
        {uniqueTools.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {uniqueTools.map((name, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/80 font-mono">
                {toolEmoji(name!)} {name}
              </span>
            ))}
            {toolCalls.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500">
                ×{toolCalls.length}
              </span>
            )}
          </div>
        )}

        {/* ── Main markdown content ── */}
        <div className="markdown-content text-sm leading-relaxed">
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || (isLast && !hasEvents ? '处理中…' : '')}
            </ReactMarkdown>
          )}
        </div>

        {/* ── Streaming indicator ── */}
        {isLast && !isUser && !message.content && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
            <span className="animate-pulse">●</span>
            处理中…
          </div>
        )}
      </div>
    </div>
  );
}
