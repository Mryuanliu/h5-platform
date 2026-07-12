import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'H5 页面生成平台',
  description: '使用 AI 生成 H5 页面',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
