// 양조 기법에서 오는 향·질감.
//
// 왜 품종과 따로 두나: 빵·브리오슈는 포도가 아니라 **효모 앙금과 오래 숙성해서** 생기고,
// 건포도 같은 졸인 단 향은 **포도를 말려서** 생긴다. 품종 아로마에 섞어 두면 그 기법을
// 안 쓴 와인에도 그 향이 뜬다 — 오크(바닐라·토스트)를 `Wine.oakAging` 으로 뺀 것과 같은
// 이유다. 실제로 "빵"이 피노뫼니에 품종에 붙어 있었는데, 그건 샴페인의 리 숙성에서
// 오는 향이지 그 포도의 향이 아니다.
//
// 값은 `Wine.winemaking`(JSON 배열)에 담는다. 확신이 없으면 아예 안 적는다 → 가이드는
// 양조 얘기를 하지 않는다(모르면 말하지 않는다).
//
// 태그를 늘리려면 여기 정의를 더하고 `scripts/set-wine-winemaking.ts` 로 와인을 큐레이션
// 한다. 정의만 있고 붙는 와인이 없으면 죽은 코드다 — 둘을 같이 한다.

export type WinemakingTag = "lees" | "appassimento";

type TechniqueDetail = {
  /** 화면에 보일 이름. "양조에서 (효모 숙성)" 처럼 근거를 밝히는 데 쓴다. */
  label: string;
  /** 이 기법에서 오는 향. 품종 향과 겹치면 앞 묶음이 먼저라 자동으로 빠진다. */
  aromas: string[];
  /** 왜 그 향이 나는지 — 근거 없이 단정하지 않는다. */
  why: string;
  /** 맛·질감에 남기는 결. 예상 값을 바꾸지 않고 안내만 곁들인다(기후와 같은 취급). */
  flavorNote: string;
};

const TECHNIQUES: Record<WinemakingTag, TechniqueDetail> = {
  lees: {
    label: "효모 숙성",
    aromas: ["빵", "브리오슈", "비스킷", "견과"],
    why: "다 발효된 뒤에도 효모 앙금과 함께 오래 두었어요 — 갓 구운 빵 같은 고소한 향은 포도가 아니라 여기서 옵니다.",
    flavorNote: "효모와 오래 숙성해 기포가 곱고 입안이 크리미하게 감길 수 있어요.",
  },
  appassimento: {
    label: "포도 말리기",
    aromas: ["건포도", "말린 자두", "잼"],
    why: "포도를 말려 수분을 날린 뒤 담갔어요 — 당과 향이 농축돼 건포도처럼 졸인 단 향이 납니다.",
    flavorNote: "말린 포도로 담가 같은 품종보다 바디가 두툼하고 단맛이 도는 인상일 수 있어요.",
  },
};

/** DB 의 winemaking(JSON 배열 문자열)을 태그 배열로. 깨졌거나 모르는 값은 버린다. */
export function parseWinemaking(raw: string | null | undefined): WinemakingTag[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v.filter((t): t is WinemakingTag => typeof t === "string" && t in TECHNIQUES);
  } catch {
    return [];
  }
}

/** 태그 배열을 DB 저장용 JSON 문자열로. 비었으면 null(= 모름). */
export function serializeWinemaking(tags: WinemakingTag[]): string | null {
  const kept = tags.filter((t) => t in TECHNIQUES);
  return kept.length > 0 ? JSON.stringify(kept) : null;
}

/** 이 기법들에서 오는 향(중복 제거). 태그가 없으면 빈 배열. */
export function winemakingAromas(tags: WinemakingTag[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    for (const a of TECHNIQUES[t]?.aromas ?? []) {
      if (seen.has(a)) continue;
      seen.add(a);
      out.push(a);
    }
  }
  return out;
}

/** "효모 숙성·포도 말리기" 처럼 근거로 밝힐 이름. 없으면 null. */
export function winemakingLabel(tags: WinemakingTag[]): string | null {
  const labels = tags.map((t) => TECHNIQUES[t]?.label).filter(Boolean);
  return labels.length > 0 ? labels.join("·") : null;
}

/** 왜 그 향이 나는지. 여러 기법이면 이어 붙인다. 없으면 null. */
export function winemakingWhy(tags: WinemakingTag[]): string | null {
  const whys = tags.map((t) => TECHNIQUES[t]?.why).filter(Boolean);
  return whys.length > 0 ? whys.join(" ") : null;
}

/** 맛·질감 안내. 예상 값은 바꾸지 않는다. 없으면 null. */
export function winemakingFlavorNote(tags: WinemakingTag[]): string | null {
  const notes = tags.map((t) => TECHNIQUES[t]?.flavorNote).filter(Boolean);
  return notes.length > 0 ? notes.join(" ") : null;
}
