// 시음 기록의 입력 타입과 기본값 변환 — 마법사(`tasting-note-wizard.tsx`)와 편집
// 페이지가 공유한다. 화면은 없다(폼 UI 는 마법사가 전부 가진다).

import type { WinemakingTag } from "@/features/wine/winemaking";
import type { FlavorFelt, TastingNoteFormInput } from "./tasting-note-schema";

export interface WineOption {
  id: string;
  nameKo: string;
  nameLocal: string | null;
  type: string | null;
  colorHex: string | null;
  // 오크 숙성 정도(none|light|heavy). 오크에서 오는 향의 근거.
  oakAging: string | null;
  // 양조 기법(lees·appassimento). 빵·건포도처럼 포도가 아닌 향의 근거.
  winemaking: WinemakingTag[];
  // 도수·산지 — 질감(바디)과 기후 안내의 근거.
  abv: number | null;
  // 등급 표기 — 단맛을 품종이 못 정할 때 라벨에서 읽는 근거(트로켄·브뤼 등).
  classification: string | null;
  regionName: string | null;
  // 가이드 시음의 예상 계산용 — 비율 내림차순. 비율은 모르는 와인이 많다(null).
  grapes: { name: string; percent: number | null }[];
}

// 수정 모드에서 폼을 채울 기존 값. 날짜는 서버에서 "YYYY-MM-DD"로 넘긴다.
export interface ExistingNote {
  id: string;
  wineId: string;
  drankOn: string | null;
  purchasedOn: string | null;
  vintageYear: number | null;
  purchasePrice: number | null;
  purchasePlace: string | null;
  rating: number | null;
  repurchase: string | null;
  value: string | null;
  colorHex: string | null;
  aromasConfirmed: string[];
  flavorFelt: FlavorFelt;
  legsFelt: number | null;
  bodyText: string | null;
  foodPaired: string | null;
}

export function toDefaults(n: ExistingNote): TastingNoteFormInput {
  return {
    wineId: n.wineId,
    drankOn: n.drankOn ?? "",
    purchasedOn: n.purchasedOn ?? "",
    vintageYear: n.vintageYear?.toString() ?? "",
    purchasePrice: n.purchasePrice?.toString() ?? "",
    purchasePlace: n.purchasePlace ?? "",
    rating: n.rating ?? undefined,
    repurchase: (n.repurchase as TastingNoteFormInput["repurchase"]) ?? undefined,
    value: (n.value as TastingNoteFormInput["value"]) ?? undefined,
    colorHex: n.colorHex ?? undefined,
    aromasConfirmed: n.aromasConfirmed,
    flavorFelt: n.flavorFelt,
    legsFelt: n.legsFelt ?? undefined,
    bodyText: n.bodyText ?? "",
    foodPaired: n.foodPaired ?? "",
  };
}
