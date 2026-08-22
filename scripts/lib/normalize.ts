// 기존 손글 노트(마크다운·CSV)를 DB로 옮기기 위한 정규화 순수 함수 모음.
// 부수효과 없이 문자열만 다루므로 vitest로 촘촘히 확인한다.

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
};

/** "3 février 2025" → UTC 자정 Date. 형식이 어긋나면 null. */
export function parseFrenchDate(input: string): Date | null {
  const m = input
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})\s+([a-zàâäéèêëîïôûùüç]+)\s+(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = FRENCH_MONTHS[m[2]];
  const year = Number(m[3]);
  if (!month) return null;
  return new Date(Date.UTC(year, month - 1, day));
}

/** "14,5" → 14.5, "14" → 14, 빈 값 → null. */
export function parseAbv(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "29 920 ₩", "39,900원" → 29920 / 39900. 숫자가 없으면 null. */
export function parsePriceKRW(input: string): number | null {
  const digits = input.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number(digits);
}

/** "2018 (+6)" → 2018, "없음"/빈 값 → null. */
export function parseVintage(input: string): number | null {
  const s = input.trim();
  if (!s || s === "없음") return null;
  const m = s.match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

/**
 * "신퀀타 꼴레지오네 Cinquanta Collezione" → { nameKo: "신퀀타 꼴레지오네", nameLocal: "Cinquanta Collezione" }.
 * 한글로 끝나는 앞부분과 라틴 문자로 시작해 끝까지 이어지는 뒷부분을 나눈다. 라틴 표기가 없으면 nameLocal은 null.
 */
export function splitName(full: string): { nameKo: string; nameLocal: string | null } {
  const trimmed = full.trim();
  const m = trimmed.match(/^(.*?[가-힣0-9)\]!])\s+([A-Za-z][\w\s'’.,()/&!-]*)$/);
  if (m && /[A-Za-z]/.test(m[2])) {
    return { nameKo: m[1].trim(), nameLocal: m[2].trim() };
  }
  return { nameKo: trimmed, nameLocal: null };
}

/** 슬러그화. 라틴/숫자/한글만 남기고 나머지는 하이픈으로. 비면 "item". */
export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

export interface ParsedGrape {
  nameKo: string;
  nameLocal: string | null;
  percent: number | null;
}

const GRAPE_STOPWORDS = new Set(["기타", "기타 품종", "others", "etc"]);

function pushGrape(list: ParsedGrape[], rawName: string, percent: number | null): void {
  const cleaned = rawName.replace(/^[\s,]+|[\s,]+$/g, "").trim();
  if (!cleaned || GRAPE_STOPWORDS.has(cleaned)) return;
  const { nameKo, nameLocal } = splitName(cleaned);
  list.push({ nameKo, nameLocal, percent });
}

/**
 * 품종 문자열을 { 품종, 비율 } 목록으로 파싱한다.
 * - "프리미티보 Primitivo 50%, 네그로아마로 Negroamaro 50%"
 * - "까르미네르 90 까베르네 소비뇽 10" (콤마 없이 붙은 형태)
 * - "메를로, 까베르네 소비뇽" (비율 없음)
 * "블렌딩" 같은 서술형은 구조화하지 않고 빈 배열을 돌려준다(blendRaw로만 보존).
 */
export function parseBlend(input: string): ParsedGrape[] {
  const raw = input.trim();
  if (!raw || raw.includes("블렌딩")) return [];
  const result: ParsedGrape[] = [];
  for (const seg of raw.split(",")) {
    const s = seg.trim();
    if (!s) continue;
    const pairRe = /([^\d]+?)\s*(\d{1,3})\s*%?(?=\s|$)/g;
    let matched = false;
    let m: RegExpExecArray | null = pairRe.exec(s);
    while (m !== null) {
      matched = true;
      pushGrape(result, m[1], Number(m[2]));
      m = pairRe.exec(s);
    }
    if (!matched) pushGrape(result, s, null);
  }
  return result;
}

/** 한글만 남긴 비교용 키. 이름 매칭에서 띄어쓰기·라틴 표기 차이를 무시하려고 쓴다. */
export function koreanKey(input: string): string {
  return input.replace(/[^가-힣0-9]/g, "");
}

/** 최소 CSV 파서. 따옴표 안의 콤마·개행을 처리하고 BOM을 제거한다. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/^﻿/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
