'use client';

import React from 'react';

interface Props {
  html?: string;
}

export default function PreviewPanel({ html }: Props) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);

  // Update iframe content when HTML changes
  React.useEffect(() => {
    if (!html || !iframeRef.current) return;
    const iframe = iframeRef.current;
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  if (!html) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 bg-black/20">
        <svg className="w-20 h-20 mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">等待生成 H5 页面...</p>
        <p className="text-xs mt-1 text-gray-600">
          在左侧输入描述后，生成的页面将在此预览
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <span className="text-xs text-gray-500">H5 预览</span>
        <div className="flex gap-2">
          <button
            onClick={() => {
              if (iframeRef.current) {
                const doc =
                  iframeRef.current.contentDocument ||
                  iframeRef.current.contentWindow?.document;
                if (doc) {
                  doc.open();
                  doc.write(html);
                  doc.close();
                }
              }
            }}
            className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-gray-400 transition-colors"
          >
            刷新
          </button>
        </div>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 bg-white">
        <iframe
          ref={iframeRef}
          className="w-full h-full border-none"
          title="H5 Preview"
          sandbox="allow-scripts"
        />
      </div>
    </div>
  );
}
