'use client';

import React, { useState, useCallback } from 'react';
import ChatPanel from './components/ChatPanel';
import PreviewPanel from './components/PreviewPanel';

export default function Home() {
  const [previewHtml, setPreviewHtml] = useState<string | undefined>();

  const handlePreviewHtml = useCallback((html: string) => {
    setPreviewHtml(html);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left: Chat Panel */}
      <div className="w-1/2 min-w-0 border-r border-white/10">
        <ChatPanel onPreviewHtml={handlePreviewHtml} />
      </div>

      {/* Right: Preview Panel */}
      <div className="w-1/2 min-w-0">
        <PreviewPanel html={previewHtml} />
      </div>
    </div>
  );
}
