// 와인의 "원어(원래 언어) 이름" 교정본.
// 시드는 CSV의 한글+라틴 혼합 표기를 기계적으로 나누는데, 원어가 비어 있거나(11개)
// 오타·군더더기가 있는 경우가 있다. 여기서 손으로 바로잡아 nameLocal을 채운다.
// koreanKey(한글만 남긴 키)로 대조하므로 띄어쓰기 차이는 무시된다.
//
// 출처 표시: (노트) = 사용자 시음노트의 라틴 표기 정리, (웹) = 검색으로 확인.

import { koreanKey } from "./normalize";

interface NameOverride {
  ko: string; // 대조용(현재 nameKo 계열). koreanKey로 비교한다.
  local: string; // 바로잡은 원어 이름
}

const OVERRIDES: NameOverride[] = [
  { ko: "신퀀타 꼴레지오네", local: "Cinquanta Collezione" }, // (노트)
  { ko: "신퀀티나", local: "Cinquantina" }, // (노트)
  { ko: "음 말벡", local: "mmm! Malbec" }, // (노트) MALVEC 오타 교정
  { ko: "음 리즐링", local: "mmm! Riesling" }, // (노트)
  { ko: "음 피노타지", local: "mmm! Pinotage" }, // (노트) Pnotage 오타 교정
  { ko: "프리시전 네비게이터 진판델", local: "Precision Navigator Zinfandel" }, // (노트)
  { ko: "프리미티보 디 만두리아", local: "Primitivo di Manduria" }, // (노트)
  { ko: "반피 센티네", local: "Banfi Centine" }, // (노트)
  { ko: "샤또 딸보", local: "Château Talbot" }, // (노트) 악센트
  { ko: "비달 플뢰리 생조셉 루즈", local: "Vidal-Fleury Saint-Joseph Rouge" }, // (노트) VIdal 오타
  { ko: "까시에로 델 디아블로 까쇼", local: "Casillero del Diablo Cabernet Sauvignon" }, // (노트)
  { ko: "스파이 밸리 소비뇽 블랑", local: "Spy Valley Sauvignon Blanc" }, // (노트) 대문자 정리
  { ko: "폰타나프레다 브라케토 다뀌", local: "Fontanafredda Le Fronde Brachetto d'Acqui" }, // (노트) 오타
  { ko: "알타 비스타 프리미엄 말벡", local: "Alta Vista Premium Malbec" }, // (노트) 쉼표 제거
  { ko: "패트리셔스 토카이 푸르민트", local: "Patricius Tokaji Furmint" }, // (노트)
  { ko: "그로브밀 피노그리", local: "Grove Mill Pinot Gris" }, // (노트)
  { ko: "뷰 마넨 싱글 빈야드 말벡", local: "Viu Manent Single Vineyard Malbec" }, // (노트)
  { ko: "메종카스텔 메를로 로제", local: "Maison Castel Merlot Rosé" }, // (노트) 악센트

  // 원어가 비어 있던 것들 — 채움
  { ko: "덕혼 디코이 멀롯", local: "Duckhorn Decoy Merlot" },
  { ko: "카멜로드 피노누아", local: "Carmel Road Pinot Noir" },
  { ko: "펄리셔 소비뇽블랑", local: "Palliser Estate Sauvignon Blanc" },
  { ko: "맨션하우스베이 소비뇽 블랑", local: "Mansion House Bay Sauvignon Blanc" },
  { ko: "이기갈 꼬뜨 뒤 론 블랑", local: "E. Guigal Côtes du Rhône Blanc" },
  {
    ko: "제라르 베르트랑 샤또 로스피딸레 라 리저브",
    local: "Gérard Bertrand Château l'Hospitalet La Réserve",
  },
  {
    ko: "패트리셔스 토카이 레이트 하베스트 카틴카",
    local: "Patricius Tokaji Late Harvest Katinka",
  },
  { ko: "샤또생피에르13", local: "Château Saint-Pierre" }, // 13은 빈티지(2013)
  { ko: "파머스 립 더 브레이브 쉬라", local: "Farmer's Leap The Brave Shiraz" }, // (웹)
  {
    ko: "아프리몬도아파시멘토 산지오베제 루비코네",
    local: "Aprimondo Appassimento Sangiovese Rubicone",
  }, // (웹) Caviro
  { ko: "마르께스 데 까사 콘차 블루", local: "Marqués de Casa Concha Blue" }, // (웹) "NEW"는 태그
  { ko: "알랭 바이유 뀌베 페트로니유", local: "Alain Bailly Cuvée Pétronille" }, // (웹)
];

const BY_KEY = new Map(OVERRIDES.map((o) => [koreanKey(o.ko), o.local]));

/** 이 와인의 바로잡은 원어 이름을 돌려준다. 교정 대상이 아니면 null. */
export function originalNameFor(nameKo: string): string | null {
  return BY_KEY.get(koreanKey(nameKo)) ?? null;
}
