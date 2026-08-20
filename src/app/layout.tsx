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
    default: "wine.byb.kr — 와인 검색 · 가격 · 기록",
    template: "%s · wine.byb.kr",
  },
  description: "와인의 산지, 품종, 가격, 시음 기록을 한 곳에서.",
  metadataBase: new URL("https://wine.byb.kr"),
  openGraph: {
    title: "wine.byb.kr",
    description: "와인의 산지, 품종, 가격, 시음 기록을 한 곳에서.",
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
