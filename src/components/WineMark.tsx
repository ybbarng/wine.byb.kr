// 와인잔 심볼 — 로고 마크에 쓰는 SVG. currentColor 를 따르므로 text-* 로 색 지정.
export function WineMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* 볼: 위 림에서 아래로 좁아지는 잔 */}
      <path d="M7 3h10c0 5.6-2.24 9-5 9S7 8.6 7 3Z" />
      {/* 스템 */}
      <path d="M12 12v7.5" />
      {/* 베이스 */}
      <path d="M8.5 19.5h7" />
    </svg>
  );
}
