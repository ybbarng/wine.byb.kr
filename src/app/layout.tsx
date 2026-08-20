import type { Metadata } from "next";
import { Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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

export const metadata: Metadata = {
  title: {
    default: "wine.byb.kr — 와인을 검색하고, 마주하고, 기록하다",
    template: "%s · wine.byb.kr",
  },
  description:
    "와인을 검색하면 생산지·포도·와이너리 이야기를 지도와 함께 보여주고, 가격이 합리적인지 판단을 돕고, 마신 기록을 쌓아 나가는 와인 아카이브.",
  metadataBase: new URL("https://wine.byb.kr"),
  openGraph: {
    title: "wine.byb.kr",
    description:
      "검색 한 번으로 이 와인이 어디서, 어떤 포도로, 어떤 맥락에서 만들어졌는지.",
    url: "https://wine.byb.kr",
    siteName: "wine.byb.kr",
    locale: "ko_KR",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
