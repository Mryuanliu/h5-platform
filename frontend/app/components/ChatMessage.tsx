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
  const isUser = message.role === 'user';
  const hasThinking = !!message.thinkingChain && message.thinkingChain.length > 0;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600/20 border border-blue-500/30 text-blue-100'
            : 'bg-white/5 border border-white/10 text-gray-200'
        }`}
      >
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
