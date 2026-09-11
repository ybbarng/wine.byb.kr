import type { Metadata } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono, Playfair_Display } from "next/font/google";
import localFont from "next/font/local";
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

// 건배말이 쓰는 문자들 — 홈에서 그 와인이 온 나라 말로 한 마디 할 때 쓴다
// (features/glass/toast.ts).
//
// **시스템 폰트에 기대면 안 된다.** 윈도우는 문자별 폰트를 "그 언어를 쓰는 사람에게만
// 나중에 까는" 선택 기능으로 돌려놨다. 태국 문자·한자를 안 쓰는 사람 기기엔 없어서
// 두부(□)가 뜬다. 맥에서는 다 나오지만 그건 맥 이야기일 뿐이다.
//
// 그렇다고 폰트를 통째로 실을 수는 없다 — 한자 폰트 하나가 수 MB다. 그래서
// `scripts/build-toast-fonts.ts` 로 **건배말에 실제로 나오는 글자만** 잘라 낸다.
// 아홉 벌 다 합쳐 19KB 고, 한자 벌은 1.3KB(乾干杯 셋뿐)다.
//
// `preload: false` 라 파일은 **그 글자가 화면에 나올 때** 받는다. 지금 산지 데이터는
// 12개국 전부 라틴 문자여서 아무도 안 받는다.
//
// `unicode-range` 는 빼면 안 된다. 없으면 브라우저가 "이 폰트에 이 글자가 있나"를
// 알아보려고 **파일을 일단 받는다** — 조지아어 한 줄 띄우자고 앞에 놓인 그리스·키릴까지
// 받아 보고 버리게 된다. 범위를 적어 두면 받기 전에 걸러진다. 값은 toast.ts 의
// `SCRIPT_UNICODE_RANGE` 와 같아야 하고, 어긋나면 toast.test.ts 가 잡는다.
const toastGreek = localFont({
  src: "./fonts/toast/greek.woff2",
  variable: "--font-toast-greek",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+370-3FF" }],
});
const toastCyrillic = localFont({
  src: "./fonts/toast/cyrillic.woff2",
  variable: "--font-toast-cyrillic",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+400-4FF" }],
});
const toastGeorgian = localFont({
  src: "./fonts/toast/georgian.woff2",
  variable: "--font-toast-georgian",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+10A0-10FF" }],
});
const toastArmenian = localFont({
  src: "./fonts/toast/armenian.woff2",
  variable: "--font-toast-armenian",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+530-58F" }],
});
const toastHebrew = localFont({
  src: "./fonts/toast/hebrew.woff2",
  variable: "--font-toast-hebrew",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+590-5FF" }],
});
const toastArabic = localFont({
  src: "./fonts/toast/arabic.woff2",
  variable: "--font-toast-arabic",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+600-6FF" }],
});
const toastThai = localFont({
  src: "./fonts/toast/thai.woff2",
  variable: "--font-toast-thai",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+E00-E7F" }],
});
const toastHangul = localFont({
  src: "./fonts/toast/hangul.woff2",
  variable: "--font-toast-hangul",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+AC00-D7AF" }],
});
const toastHan = localFont({
  src: "./fonts/toast/han.woff2",
  variable: "--font-toast-han",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: "unicode-range", value: "U+4E00-9FFF" }],
});

/** 건배말 문자용 폰트들. 한 곳에 모아 `<html>` 에 한 번만 붙인다. */
const TOAST_FONTS = [
  toastGreek,
  toastCyrillic,
  toastGeorgian,
  toastArmenian,
  toastHebrew,
  toastArabic,
  toastThai,
  toastHangul,
  toastHan,
]
  .map((f) => f.variable)
  .join(" ");

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
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} ${cormorant.variable} ${TOAST_FONTS} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
