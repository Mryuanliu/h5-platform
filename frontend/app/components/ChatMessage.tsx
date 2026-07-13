'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage as ChatMessageType, EventLog } from '../hooks/useChatSSE';

interface Props {
  message: ChatMessageType;
  isLast: boolean;
}

/** Icons for different event types */
function EventIcon({ type }: { type: string }) {
  switch (type) {
    case 'thinking':
      return (
        <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case 'tool_start':
    case 'tool_progress':
      return (
        <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'status':
      return (
        <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'command_output':
      return (
        <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
      );
    default:
      return null;
  }
}

/** Render a single event in the log */
function EventItem({ ev, index }: { ev: EventLog; index: number }) {
  switch (ev.type) {
    case 'thinking':
      return (
        <div className="flex gap-2 text-xs text-purple-300/80 py-0.5">
          <span className="flex-shrink-0 mt-0.5"><EventIcon type="thinking" /></span>
          <span className="italic leading-relaxed line-clamp-1 hover:line-clamp-none transition-all">{ev.content}</span>
        </div>
      );

    case 'tool_start':
      return (
        <div className="flex gap-2 text-xs py-1 px-2 rounded bg-amber-500/5 border border-amber-500/10">
          <span className="flex-shrink-0 mt-0.5"><EventIcon type="tool_start" /></span>
          <div>
            <span className="font-mono text-amber-300">{ev.toolName}</span>
            {ev.toolInput && (
              <span className="text-gray-500 ml-2 truncate max-w-[200px] inline-block align-bottom">
                {JSON.stringify(ev.toolInput)}
              </span>
            )}
          </div>
        </div>
      );

    case 'tool_progress':
      return (
        <div className="flex gap-2 text-xs text-gray-500 py-0.5">
          <span className="flex-shrink-0 mt-0.5"><EventIcon type="tool_progress" /></span>
          <span>{ev.toolName} {ev.subtype === 'running' ? '执行中...' : ev.subtype}</span>
        </div>
      );

    case 'status':
      return (
        <div className="flex gap-2 text-xs text-green-300/70 py-0.5">
          <span className="flex-shrink-0 mt-0.5"><EventIcon type="status" /></span>
          <span>{ev.content}</span>
        </div>
      );

    case 'command_output':
      return (
        <div className="flex gap-2 text-xs py-1">
          <span className="flex-shrink-0 mt-0.5"><EventIcon type="command_output" /></span>
          <pre className="flex-1 bg-black/30 rounded p-2 text-cyan-300/80 overflow-x-auto max-h-32 leading-relaxed">
            {ev.content}
          </pre>
        </div>
      );

    case 'text_chunk':
      return null; // Text chunks are rendered as the final content below

    default:
      return null;
  }
}

export default function ChatMessage({ message, isLast }: Props) {
  const [showRawEvents, setShowRawEvents] = useState(false);
  const isUser = message.role === 'user';
  const hasEvents = !!message.events && message.events.length > 0;
  const hasThinking = !!message.thinkingChain && message.thinkingChain.length > 0;

  // Extract tool_start events count for badge
  const toolCount = message.events?.filter((e) => e.type === 'tool_start').length || 0;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100'
            : 'bg-white/[0.03] border border-white/[0.08] text-gray-200'
        }`}
      >
        {/* ── Role label ── */}
        {!isUser && (
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">AI</div>
        )}

        {/* ── Event log (chronological) ── */}
        {!isUser && hasEvents && (
          <div className="space-y-0.5 mb-2">
            {message.events!.map((ev, i) => (
              <EventItem key={`${ev.type}-${i}`} ev={ev} index={i} />
            ))}
          </div>
        )}

        {/* ── Thinking chain collapse ── */}
        {!isUser && hasThinking && (
          <div className="mb-2">
            <button
              onClick={() => setShowRawEvents(!showRawEvents)}
              className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-400 transition-colors"
            >
              <svg className={`w-3 h-3 transition-transform ${showRawEvents ? 'rotate-90' : ''}`} fill="currentColor" viewBox="0 0 20 20">
                <path d="M6 4l8 6-8 6V4z" />
              </svg>
              完整思考链
              <span className="text-gray-600 ml-0.5">({message.thinkingChain.length} 字)</span>
            </button>
            {showRawEvents && (
              <div className="mt-1.5 p-3 rounded-lg bg-purple-900/10 border border-purple-500/10 text-xs text-purple-200/70 whitespace-pre-wrap max-h-48 overflow-y-auto">
                {message.thinkingChain}
              </div>
            )}
          </div>
        )}

        {/* ── Tool count badge ── */}
        {!isUser && toolCount > 0 && (
          <div className="mb-1.5 flex gap-1.5 flex-wrap">
            {message.events!.filter((e) => e.type === 'tool_start').map((ev, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/80 font-mono">
                {ev.toolName}
              </span>
            ))}
          </div>
        )}

        {/* ── Markdown content ── */}
        <div className="markdown-content text-sm leading-relaxed">
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || (isLast && !hasEvents ? '思考中...' : '')}
            </ReactMarkdown>
          )}
        </div>

        {/* ── Streaming indicator ── */}
        {isLast && !isUser && !message.content && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-500">
            <span className="animate-pulse">●</span>
            处理中...
          </div>
        )}
      </div>
    </div>
  );
}
