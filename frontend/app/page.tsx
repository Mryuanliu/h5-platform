'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';

interface Conversation {
  id: string;
  title: string;
  sdkSessionId: string | null;
  status: string;
  messageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export default function Home() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/chat/conversations')
      .then((r) => r.json())
      .then((data) => {
        setConversations(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-[#0f0f0f] text-gray-200">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">H5 页面生成</h1>
          <p className="text-xs text-gray-500 mt-0.5">AI 驱动的 H5 页面构建平台</p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin"
            className="text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          >
            管理后台
          </Link>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* New task button */}
        <Link
          href="/task/new"
          className="block w-full p-4 mb-6 rounded-xl border border-dashed border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/60 transition-all text-center"
        >
          <span className="text-lg">＋ 新建任务</span>
          <p className="text-xs text-gray-500 mt-1">输入 H5 页面需求，AI 帮你生成代码</p>
        </Link>

        {/* Task list */}
        <h2 className="text-sm font-medium text-gray-400 mb-3">历史任务</h2>

        {loading ? (
          <div className="text-center py-12 text-gray-600">
            <div className="inline-block w-6 h-6 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <p className="text-sm">暂无历史任务</p>
            <p className="text-xs mt-1">点击上方按钮创建第一个 H5 页面</p>
          </div>
        ) : (
          <div className="space-y-2">
            {conversations.map((conv) => (
              <Link
                key={conv.id}
                href={`/task/${conv.id}`}
                className="block p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-white truncate">
                      {conv.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(conv.updatedAt).toLocaleString('zh-CN')}
                      {conv.sdkSessionId && (
                        <span className="ml-2 text-green-600">●</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    {conv.messageCount != null && (
                      <span className="text-xs text-gray-500">
                        {conv.messageCount} 条消息
                      </span>
                    )}
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
