const FEATURES = [
  { tag: "탐험", desc: "산지 · 품종 · 와이너리" },
  { tag: "가치", desc: "시세 비교로 가격 판단" },
  { tag: "기록", desc: "마신 와인과 시음 노트" },
  { tag: "학습", desc: "와인 기초 자료" },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* 배경: 와인빛 오브가 천천히 떠돈다 */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] animate-drift rounded-full bg-wine/30 blur-3xl" />
        <div className="absolute -right-48 top-24 h-[30rem] w-[30rem] animate-drift-slow rounded-full bg-wine-bright/20 blur-3xl" />
      </div>

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-serif text-lg tracking-tight text-foreground">
          wine<span className="text-gold">.</span>byb.kr
        </span>
        <nav className="flex items-center gap-6 text-sm text-rose/70">
          <a href="/explore" className="transition-colors hover:text-foreground">
            탐험
          </a>
          <a href="/cellar" className="transition-colors hover:text-foreground">
            기록
          </a>
          <a href="/learn" className="transition-colors hover:text-foreground">
            학습
          </a>
        </nav>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 pb-24">
        {/* 검색이 주인공 */}
        <h1 className="font-serif text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
          와인 한 병의 뒷이야기
        </h1>
        <p className="mt-3 text-base text-rose/70">
          이름을 검색하면 산지, 품종, 가격, 기록을 한 화면에서.
        </p>

        <form
          className="mt-8 flex items-center gap-2 rounded-xl border border-rose/20 bg-white/5 px-4 py-3 backdrop-blur-sm transition-colors focus-within:border-gold/50"
          aria-label="와인 검색"
        >
          <svg
            className="h-5 w-5 shrink-0 text-muted"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            disabled
            placeholder="예: 이기갈 꼬뜨 뒤 론 블랑"
            className="w-full bg-transparent text-foreground placeholder:text-muted/70 focus:outline-none"
          />
          <span className="shrink-0 rounded-md bg-wine/40 px-2 py-1 text-xs text-rose/70">
            준비 중
          </span>
        </form>

        {/* 기능: 담백한 라벨 + 한 줄 */}
        <dl className="mt-12 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.tag} className="border-t border-rose/15 pt-3">
              <dt className="font-serif text-lg text-foreground">{f.tag}</dt>
              <dd className="mt-1 text-sm text-rose/60">{f.desc}</dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  );
}
