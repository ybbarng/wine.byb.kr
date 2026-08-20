const PILLARS = [
  {
    tag: "탐험",
    title: "이 와인이 어디서 왔는지",
    body: "와인을 검색하면 지도가 산지로 흘러가고, 포도·지역·와이너리 이야기가 펼쳐집니다.",
  },
  {
    tag: "가치",
    title: "이 가격이 합리적인지",
    body: "시세 분포 위에 내가 본 가격을 얹어, 편의점 할인 와인이 살 만한지 판단합니다.",
  },
  {
    tag: "기록",
    title: "전에 마셨던 그 와인",
    body: "언제 얼마에 마셨고 어땠는지. 마신 기록이 쌓이며 취향과 가격 추이가 드러납니다.",
  },
  {
    tag: "학습",
    title: "와인을 공부하는 재미",
    body: "떼루아, 등급, 라벨 읽는 법을 지루한 줄글이 아니라 만지며 익히는 자료로.",
  },
];

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden">
      {/* 배경: 와인빛 오브가 천천히 떠돈다 */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-32 -top-32 h-[38rem] w-[38rem] animate-drift rounded-full bg-wine/40 blur-3xl" />
        <div className="absolute -right-40 top-20 h-[32rem] w-[32rem] animate-drift-slow rounded-full bg-wine-bright/25 blur-3xl" />
        <div className="absolute bottom-[-10rem] left-1/3 h-[30rem] w-[30rem] animate-drift rounded-full bg-gold/10 blur-3xl" />
      </div>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center px-6 py-20 sm:py-28">
        {/* 히어로 */}
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/5 px-4 py-1.5 text-xs font-medium tracking-widest text-gold uppercase">
          <span className="h-1.5 w-1.5 animate-shimmer rounded-full bg-gold" />
          wine.byb.kr
        </span>

        <h1 className="text-center font-serif text-5xl leading-[1.1] tracking-tight text-foreground sm:text-7xl">
          와인을 검색하고,
          <br />
          <span className="bg-gradient-to-r from-rose via-wine-bright to-gold bg-clip-text italic text-transparent">
            마주하고, 기록하다
          </span>
        </h1>

        <p className="mt-7 max-w-xl text-center text-lg leading-8 text-rose/80">
          검색 한 번으로 이 와인이 어디서, 어떤 포도로, 어떤 맥락에서 만들어졌는지.
          그리고 그 가격이 마실 만한 값인지까지.
        </p>

        {/* 검색창 (자리표시 — 탐험 기능은 다음 단계) */}
        <form
          className="group mt-10 flex w-full max-w-xl items-center gap-2 rounded-full border border-rose/20 bg-white/5 px-5 py-3 backdrop-blur-sm transition-colors focus-within:border-gold/50"
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
            placeholder="예: 도멘 데 아르디에 앙주 블랑 레 쁘디 갸르"
            className="w-full bg-transparent text-foreground placeholder:text-muted/70 focus:outline-none"
          />
          <span className="shrink-0 rounded-full bg-wine/40 px-3 py-1 text-xs font-medium text-rose/70">
            곧 열려요
          </span>
        </form>

        {/* 네 기둥 */}
        <section className="mt-20 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          {PILLARS.map((p) => (
            <article
              key={p.tag}
              className="group rounded-2xl border border-rose/10 bg-white/[0.03] p-6 transition-colors hover:border-gold/30 hover:bg-white/[0.05]"
            >
              <span className="text-xs font-semibold tracking-widest text-gold uppercase">
                {p.tag}
              </span>
              <h2 className="mt-2 font-serif text-2xl text-foreground">
                {p.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-rose/70">{p.body}</p>
            </article>
          ))}
        </section>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 pb-10 text-center text-sm text-muted">
        마신 와인 한 병 한 병을, 기억할 수 있는 이야기로.
      </footer>
    </div>
  );
}
