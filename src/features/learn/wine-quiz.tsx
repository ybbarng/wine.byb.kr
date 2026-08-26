"use client";

import { useState } from "react";
import { QUIZ } from "./learn-content";

// 와인 상식 퀴즈. 한 문제씩 풀고, 고르면 정답·해설을 보여준 뒤 다음으로 넘어간다.
export function WineQuiz() {
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);

  const total = QUIZ.length;
  const q = QUIZ[idx];

  const pick = (i: number) => {
    if (picked != null) return; // 이미 답함
    setPicked(i);
    if (i === q.answer) setScore((s) => s + 1);
  };

  const next = () => {
    if (idx + 1 >= total) {
      setDone(true);
      return;
    }
    setIdx((i) => i + 1);
    setPicked(null);
  };

  const restart = () => {
    setIdx(0);
    setPicked(null);
    setScore(0);
    setDone(false);
  };

  if (done) {
    const perfect = score === total;
    return (
      <div className="rounded-2xl border border-foreground/12 bg-card/70 p-6 text-center">
        <div className="text-4xl">{perfect ? "🏆" : "🍷"}</div>
        <p className="mt-3 font-serif text-2xl text-foreground">
          {total}문제 중 {score}개 정답
        </p>
        <p className="mt-1 text-sm text-muted">
          {perfect ? "완벽해요! 이미 와인 애호가시네요." : "좋아요, 한 잔 하며 다시 도전해볼까요?"}
        </p>
        <button
          type="button"
          onClick={restart}
          className="mt-4 rounded-full border border-foreground/15 px-4 py-2 text-sm text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-foreground/5"
        >
          다시 풀기
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-foreground/12 bg-card/70 p-6">
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">
          퀴즈 {idx + 1} / {total}
        </span>
        <span className="text-xs text-muted">점수 {score}</span>
      </div>
      <p className="mt-2 font-serif text-lg text-foreground">{q.q}</p>

      <div className="mt-4 flex flex-col gap-2">
        {q.options.map((opt, i) => {
          const isAnswer = i === q.answer;
          const isPicked = i === picked;
          const answered = picked != null;
          const cls = !answered
            ? "border-foreground/15 hover:border-foreground/35 hover:bg-foreground/5"
            : isAnswer
              ? "border-wine bg-wine/10 text-foreground"
              : isPicked
                ? "border-foreground/20 bg-foreground/5 text-muted line-through"
                : "border-foreground/10 text-muted/70";
          return (
            <button
              key={opt}
              type="button"
              onClick={() => pick(i)}
              disabled={answered}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors ${cls}`}
            >
              {answered && isAnswer ? <span className="text-wine">✓</span> : null}
              {opt}
            </button>
          );
        })}
      </div>

      {picked != null ? (
        <div className="mt-4">
          <p className="text-sm leading-relaxed text-foreground/80">
            {picked === q.answer ? "정답! " : "아쉬워요. "}
            {q.explain}
          </p>
          <button
            type="button"
            onClick={next}
            className="mt-3 rounded-full bg-wine px-4 py-2 text-sm text-on-accent transition-colors hover:bg-wine-bright"
          >
            {idx + 1 >= total ? "결과 보기" : "다음 문제"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
