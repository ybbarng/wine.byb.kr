import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { LESSONS, lessonBySlug } from "@/features/learn/learn-content";
import { LessonBlocks } from "@/features/learn/lesson-blocks";

export async function generateMetadata({ params }: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const lesson = lessonBySlug(slug);
  return { title: lesson ? lesson.title : "학습을 찾을 수 없음" };
}

export default async function LessonPage({ params }: PageProps<"/learn/[slug]">) {
  const { slug } = await params;
  const lesson = lessonBySlug(slug);
  if (!lesson) notFound();

  const idx = LESSONS.findIndex((l) => l.slug === lesson.slug);
  const prev = idx > 0 ? LESSONS[idx - 1] : null;
  const next = idx < LESSONS.length - 1 ? LESSONS[idx + 1] : null;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 pb-24">
        <Link
          href="/learn"
          className="mt-6 inline-block text-sm text-muted transition-colors hover:text-foreground"
        >
          ← 학습
        </Link>

        <header className="mt-4">
          <div className="text-3xl">{lesson.emoji}</div>
          <h1 className="mt-2 font-serif text-3xl leading-tight text-foreground">{lesson.title}</h1>
          <p className="mt-2 text-muted/80">{lesson.summary}</p>
        </header>

        <div className="mt-8">
          <LessonBlocks blocks={lesson.blocks} />
        </div>

        {lesson.links && lesson.links.length > 0 ? (
          <div className="mt-8 flex flex-wrap gap-2">
            {lesson.links.map((lk) => (
              <Link
                key={lk.href}
                href={lk.href}
                className="rounded-full border border-foreground/15 bg-foreground/5 px-3.5 py-1.5 text-sm text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-foreground/10"
              >
                {lk.label} →
              </Link>
            ))}
          </div>
        ) : null}

        <nav className="mt-12 flex items-stretch justify-between gap-3 border-t border-foreground/10 pt-6">
          {prev ? (
            <Link
              href={`/learn/${prev.slug}`}
              className="flex-1 rounded-xl border border-foreground/12 px-4 py-3 transition-colors hover:border-foreground/25 hover:bg-foreground/5"
            >
              <div className="text-xs text-muted">← 이전</div>
              <div className="mt-0.5 text-sm text-foreground/85">
                {prev.emoji} {prev.title}
              </div>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {next ? (
            <Link
              href={`/learn/${next.slug}`}
              className="flex-1 rounded-xl border border-foreground/12 px-4 py-3 text-right transition-colors hover:border-foreground/25 hover:bg-foreground/5"
            >
              <div className="text-xs text-muted">다음 →</div>
              <div className="mt-0.5 text-sm text-foreground/85">
                {next.title} {next.emoji}
              </div>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
      </main>
    </div>
  );
}
