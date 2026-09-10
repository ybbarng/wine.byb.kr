// 포도 껍질색: 레드(흑포도) / 화이트(청포도). 껍질색은 품종 고유라 거의 고정값이다.
// 레드 포도로 화이트·스파클링을 만들기도 하지만 그건 '와인'의 색이고(와인 상세의 타입
// 점·라벨이 담당), 품종 뱃지에는 품종 자체의 껍질색을 쓴다.
// Grape.color 필드가 비어 있어 코드 쪽 큐레이션으로 붙인다. seed 이름이 지저분해서
// (예: "시라/쉬라즈 (Syrah/Shiraz)") 공백을 지우고 includes로 찾는다.

const RED = [
  "그르나슈",
  "까르미네르",
  "카르미네르",
  "까베르네",
  "카베르네",
  "카버네",
  "네그로아마로",
  "말벡",
  "멀롯",
  "메를로",
  "무르베드르",
  "브라케토",
  "쁘띠베르도",
  "산지오베제",
  "쉬라즈",
  "시라",
  "진판델",
  "프리미티보",
  "피노누아",
  "피노뫼니에",
  "피노타지",
  "네비올로",
  "바르베라",
  "돌체토",
  "코르비나",
  "네로다볼라",
  "네렐로",
  "카리냥",
  "생소",
  "케크프란코시",
];

const WHITE = [
  "끌레레뜨",
  "루산느",
  "리즐링",
  "마르산느",
  "무스캇",
  "뮈스카",
  "부르불랑",
  "비오니에",
  "샤르도네",
  "소비뇽블랑", // "까베르네 소비뇽"과 겹치지 않도록 "블랑"까지 포함해 매칭
  "슈냉블랑",
  "게뷔르츠트라미너",
  "토론테스",
  "글레라",
  "가르가네가",
  "푸르민트",
  "제타",
  "피노그리",
];

const norm = (s: string) => s.replace(/\s+/g, "");

/** 품종명 → 껍질색. 알 수 없으면 null. */
export function grapeColor(nameKo: string | null | undefined): "red" | "white" | null {
  if (!nameKo) return null;
  const n = norm(nameKo);
  if (WHITE.some((k) => n.includes(k))) return "white";
  if (RED.some((k) => n.includes(k))) return "red";
  return null;
}

// 품종 뱃지 앞에 붙는 작은 껍질색 점. 레드=와인색, 화이트=연한 크림(황금빛 테).
export function GrapeColorDot({ nameKo }: { nameKo: string }) {
  const c = grapeColor(nameKo);
  if (!c) return null;
  return (
    <span
      title={c === "red" ? "레드 품종" : "화이트 품종"}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${
        c === "red" ? "border border-foreground/15 bg-wine" : "border border-gold/50 bg-on-accent"
      }`}
    />
  );
}
