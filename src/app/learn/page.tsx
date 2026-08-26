import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { LESSONS } from "@/features/learn/learn-content";
import { WineQuiz } from "@/features/learn/wine-quiz";

export const metadata: Metadata = {
  title: "학습",
  description: "와인의 기초부터 흥미로운 이야기까지. 짧게 읽고 퀴즈로 확인해요.",
};

export default function LearnPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 pb-24">
        <header className="mt-6">
          <h1 className="font-serif text-4xl tracking-tight text-foreground">학습</h1>
          <p className="mt-2 text-muted/80">
            와인의 기초부터 흥미로운 이야기까지. 짧게 읽고 아래 퀴즈로 확인해요.
          </p>
        </header>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {LESSONS.map((l, i) => (
            <Link
              key={l.slug}
              href={`/learn/${l.slug}`}
              className="group rounded-2xl border border-foreground/12 bg-card/60 p-5 transition-colors hover:border-foreground/25 hover:bg-card"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{l.emoji}</span>
                <span className="text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <h2 className="mt-3 font-serif text-xl text-foreground group-hover:text-wine">
                {l.title}
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-muted/80">{l.summary}</p>
            </Link>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="mb-3 font-serif text-2xl text-foreground">상식 퀴즈</h2>
          <div className="max-w-xl">
            <WineQuiz />
          </div>
        </section>
      </main>
    </div>
  );
}
