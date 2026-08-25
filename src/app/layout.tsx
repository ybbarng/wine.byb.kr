import type { Metadata } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

// 로고 워드마크용 — 우아한 세리프(와인/에디토리얼 톤).
const cormorant = Cormorant_Garamond({
  variable: "--font-logo",
  subsets: ["latin"],
  weight: ["500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const SITE_DESC =
  "와인의 산지·품종·가격·시음 기록을 한 곳에서. 검색하면 3D 와인잔에 그 와인의 빛깔이 담기고 산지가 지도에 펼쳐집니다.";

export const metadata: Metadata = {
  title: {
    default: "wine.byb.kr — 와인 검색 · 산지 · 시음 기록",
    template: "%s · wine.byb.kr",
  },
  description: SITE_DESC,
  applicationName: "wine.byb.kr",
  keywords: ["와인", "와인 검색", "산지", "품종", "시음 기록", "와인 가격", "와인 셀러", "wine"],
  authors: [{ name: "ybbarng" }],
  creator: "ybbarng",
  metadataBase: new URL("https://wine.byb.kr"),
  openGraph: {
    title: "wine.byb.kr — 와인 검색 · 산지 · 시음 기록",
    description: SITE_DESC,
    url: "https://wine.byb.kr",
    siteName: "wine.byb.kr",
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "wine.byb.kr — 와인 검색 · 산지 · 시음 기록",
    description: SITE_DESC,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
