'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage as ChatMessageType } from '../hooks/useChatSSE';

interface Props {
  message: ChatMessageType;
  isLast: boolean;
}

export default function ChatMessage({ message, isLast }: Props) {
  const [showThinking, setShowThinking] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const isUser = message.role === 'user';
  const hasThinking = !!message.thinkingChain && message.thinkingChain.length > 0;
  const hasTools = !!message.tools && message.tools.length > 0;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100'
            : 'bg-white/5 border border-white/10 text-gray-200'
        }`}
      >
        {/* Tool calls */}
        {!isUser && hasTools && (
          <div className="mb-2">
            <button
              onClick={() => setShowTools(!showTools)}
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showTools ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6 4l8 6-8 6V4z" />
              </svg>
              <span className="flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                工具调用 ({message.tools.length})
              </span>
            </button>

            {showTools && (
              <div className="mt-2 space-y-1.5">
                {message.tools.map((t, i) => (
                  <div
                    key={t.toolId || i}
                    className="p-2 rounded-lg bg-amber-900/10 border border-amber-500/15 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-amber-300">{t.toolName}</span>
                      <span className="text-gray-600 truncate font-mono">
                        {t.toolInput ? JSON.stringify(t.toolInput).slice(0, 80) : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Thinking chain toggle */}
        {!isUser && hasThinking && (
          <div className="mb-2">
            <button
              onClick={() => setShowThinking(!showThinking)}
              className="flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <svg
                className={`w-3 h-3 transition-transform ${showThinking ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M6 4l8 6-8 6V4z" />
              </svg>
              思考过程
              <span className="text-gray-500 ml-1">
                ({message.thinkingChain.length} 字)
              </span>
            </button>

            {showThinking && (
              <div className="mt-2 p-3 rounded-lg bg-purple-900/20 border border-purple-500/20 text-sm text-purple-200/80 whitespace-pre-wrap">
                {message.thinkingChain}
              </div>
            )}
          </div>
        )}

        {/* Message content */}
        <div className="markdown-content text-sm leading-relaxed">
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content || (isLast ? '思考中...' : '')}
            </ReactMarkdown>
          )}
        </div>

        {/* Streaming indicator */}
        {isLast && !isUser && !message.content && message.thinkingChain && (
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
            <span className="animate-pulse">●</span>
            正在思考...
          </div>
        )}
      </div>
    </div>
  );
}
