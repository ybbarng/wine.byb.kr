// 화면 표시용 포맷 헬퍼.

/** 31920 → "31,920원". null이면 빈 문자열. */
export function formatKRW(value: number | null | undefined): string {
  if (value == null) return "";
  return `${value.toLocaleString("ko-KR")}원`;
}

/** Date → "2025.04.19". null이면 빈 문자열. UTC 기준으로 읽는다(시드가 UTC 자정). */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

/** 여러 항목을 "· "로 잇되 빈 값은 건너뛴다. */
export function joinDot(...parts: (string | null | undefined)[]): string {
  return parts.filter((p) => p?.trim()).join(" · ");
}
