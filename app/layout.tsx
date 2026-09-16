import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ieum",
  description: "함께한 시간을 기억하고, 다음 이야기를 이어가는 개인 AI 비서.",
};

// 모바일 웹이 첫 사용 범위이므로 뷰포트를 기기 폭에 맞춘다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
