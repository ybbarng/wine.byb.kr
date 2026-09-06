// 마신 와인 기록을 추가한다. slug 기준 upsert 라 재실행해도 중복이 없다.
// 산지·생산자·와인이 없으면 만들고, 있으면 재사용한다. 시음 기록은 같은
// (와인·마신날·구매가)이 이미 있으면 건너뛴다.
//
// 여기선 "연결에 필요한 최소한"만 채운다(이름·종류·좌표·대표 품종). 산지 설명·
// 기후·토양, 와이너리 소개, 정확한 abv·블렌드 비율 등 조사 기반 정보는 나중에
// 일괄로 보강한다.
import { db } from "@/lib/db";

// 없으면 만들 산지(부모가 먼저 오도록 순서 유지). 이미 있으면 재사용.
type RegionSeed = {
  slug: string;
  nameKo: string;
  nameLocal: string;
  country: string;
  level: string;
  parentSlug: string | null;
  latitude: number;
  longitude: number;
};

const REGIONS: RegionSeed[] = [
  {
    slug: "sancerre",
    nameKo: "상세르",
    nameLocal: "Sancerre",
    country: "프랑스",
    level: "region",
    parentSlug: "france",
    latitude: 47.331,
    longitude: 2.838,
  },
  {
    slug: "bordeaux",
    nameKo: "보르도",
    nameLocal: "Bordeaux",
    country: "프랑스",
    level: "region",
    parentSlug: "france",
    latitude: 44.838,
    longitude: -0.579,
  },
  {
    slug: "austria",
    nameKo: "오스트리아",
    nameLocal: "Austria",
    country: "오스트리아",
    level: "country",
    parentSlug: null,
    latitude: 47.7,
    longitude: 13.3,
  },
  {
    slug: "burgenland",
    nameKo: "부르겐란트",
    nameLocal: "Burgenland",
    country: "오스트리아",
    level: "region",
    parentSlug: "austria",
    latitude: 47.85,
    longitude: 16.52,
  },
  {
    slug: "chablis",
    nameKo: "샤블리",
    nameLocal: "Chablis",
    country: "프랑스",
    level: "region",
    parentSlug: "france",
    latitude: 47.817,
    longitude: 3.799,
  },
  {
    slug: "spain",
    nameKo: "스페인",
    nameLocal: "Spain",
    country: "스페인",
    level: "country",
    parentSlug: null,
    latitude: 40.4,
    longitude: -3.7,
  },
  {
    slug: "ribera-del-duero",
    nameKo: "리베라 델 두에로",
    nameLocal: "Ribera del Duero",
    country: "스페인",
    level: "region",
    parentSlug: "spain",
    latitude: 41.63,
    longitude: -3.69,
  },
  {
    slug: "montalcino",
    nameKo: "몬탈치노",
    nameLocal: "Montalcino",
    country: "이탈리아",
    level: "region",
    parentSlug: "italy",
    latitude: 43.06,
    longitude: 11.49,
  },
  {
    slug: "aconcagua-costa",
    nameKo: "아콩카과 코스타",
    nameLocal: "Aconcagua Costa",
    country: "칠레",
    level: "region",
    parentSlug: "chile",
    latitude: -32.9,
    longitude: -71.4,
  },
  {
    slug: "bourgogne",
    nameKo: "부르고뉴",
    nameLocal: "Bourgogne",
    country: "프랑스",
    level: "region",
    parentSlug: "france",
    latitude: 47.05,
    longitude: 4.8,
  },
  {
    slug: "anjou",
    nameKo: "앙주",
    nameLocal: "Anjou",
    country: "프랑스",
    level: "region",
    parentSlug: "france",
    latitude: 47.47,
    longitude: -0.55,
  },
  {
    slug: "langhe",
    nameKo: "랑게",
    nameLocal: "Langhe",
    country: "이탈리아",
    level: "region",
    parentSlug: "italy",
    latitude: 44.6,
    longitude: 8.0,
  },
  {
    slug: "rioja",
    nameKo: "리오하",
    nameLocal: "Rioja",
    country: "스페인",
    level: "region",
    parentSlug: "spain",
    latitude: 42.46,
    longitude: -2.45,
  },
  {
    slug: "penedes",
    nameKo: "페네데스",
    nameLocal: "Penedès",
    country: "스페인",
    level: "region",
    parentSlug: "spain",
    latitude: 41.35,
    longitude: 1.7,
  },
  {
    slug: "pedernal",
    nameKo: "페데르날 밸리",
    nameLocal: "Valle de Pedernal",
    country: "아르헨티나",
    level: "region",
    parentSlug: "argentina",
    latitude: -31.75,
    longitude: -68.95,
  },
  {
    slug: "mendocino",
    nameKo: "멘도시노 카운티",
    nameLocal: "Mendocino County",
    country: "미국",
    level: "region",
    parentSlug: "usa",
    latitude: 39.15,
    longitude: -123.11,
  },
  {
    slug: "clare-valley",
    nameKo: "클레어 밸리",
    nameLocal: "Clare Valley",
    country: "호주",
    level: "region",
    parentSlug: "australia",
    latitude: -33.83,
    longitude: 138.61,
  },
  {
    slug: "chianti-classico",
    nameKo: "키안티 클라시코",
    nameLocal: "Chianti Classico",
    country: "이탈리아",
    level: "region",
    parentSlug: "italy",
    latitude: 43.585,
    longitude: 11.316,
  },
];

// 없으면 만들 품종. GRAPE_ABSORB(wine-glass.ts) 색은 nameKo 로 찾으니 nameKo 를 맞춘다.
const GRAPES: { slug: string; nameKo: string; nameLocal: string; color: string }[] = [
  { slug: "susumaniello", nameKo: "수수마니엘로", nameLocal: "Susumaniello", color: "red" },
  { slug: "tempranillo", nameKo: "템프라니요", nameLocal: "Tempranillo", color: "red" },
  { slug: "chenin-blanc", nameKo: "슈냉 블랑", nameLocal: "Chenin Blanc", color: "white" },
  { slug: "nebbiolo", nameKo: "네비올로", nameLocal: "Nebbiolo", color: "red" },
  { slug: "zweigelt", nameKo: "츠바이겔트", nameLocal: "Zweigelt", color: "red" },
  { slug: "macabeo", nameKo: "마카베오", nameLocal: "Macabeo", color: "white" },
  { slug: "xarel-lo", nameKo: "사렐-로", nameLocal: "Xarel·lo", color: "white" },
  { slug: "parellada", nameKo: "파레야다", nameLocal: "Parellada", color: "white" },
  { slug: "canaiolo", nameKo: "카나이올로", nameLocal: "Canaiolo", color: "red" },
  { slug: "semillon", nameKo: "세미용", nameLocal: "Sémillon", color: "white" },
];

// 와인별 abv(라벨 기준 추정 — 정확값은 라벨 확인 후 조정)와 시음 포인트.
const WINE_DETAILS: Record<string, { abv?: number; notesKo?: string }> = {
  "henri-bourgeois-sancerre-les-baronnes": {
    abv: 13,
    notesKo: "드라이하고 미네랄이 또렷한 화이트. 감귤·풋풀 향에 부싯돌 같은 미네랄이 받친다.",
  },
  "esterhazy-klimt-red": {
    abv: 13,
    notesKo: "가볍고 향긋한 오스트리아 레드. 붉은 과실과 은은한 후추 향, 부드러운 타닌.",
  },
  "chateau-pey-la-tour-reserve": {
    abv: 14.5,
    notesKo: "메를로 중심의 부드러운 보르도. 자두·블랙베리와 은은한 오크, 편하게 마시는 스타일.",
  },
  "tosti-moscato-d-asti": {
    abv: 5.5,
    notesKo: "달콤하고 살짝 발포하는 저알코올 화이트. 복숭아·머스캇 향이 화사하다.",
  },
  "montgras-intriga-maxima": {
    abv: 14.5,
    notesKo: "마이포 고지대 카베르네. 블랙커런트·삼나무 향에 짜임새 있는 타닌, 진하고 길다.",
  },
  "carlo-sani-susumaniello": {
    abv: 15,
    notesKo: "뿔리아 토착 품종의 진한 레드. 잘 익은 붉은 과실과 향신료, 부드러운 질감.",
  },
  "gosset-grand-rose-brut": {
    abv: 12,
    notesKo: "로제 샴페인. 딸기·라즈베리 향에 섬세한 기포와 또렷한 산미.",
  },
  "domaine-laroche-chablis-saint-martin": {
    abv: 12.5,
    notesKo: "오크를 절제한 샤블리. 레몬·초록 사과에 부싯돌 같은 미네랄, 산뜻하다.",
  },
  "pesquera-crianza": {
    abv: 14.5,
    notesKo: "리베라 델 두에로 템프라니요. 검은 과실과 오크의 바닐라·가죽, 힘 있는 구조.",
  },
  "fattoria-dei-barbi-brunello-blue-label": {
    abv: 14.5,
    notesKo: "산지오베제 100% 브루넬로. 체리·말린 허브·가죽 향에 높은 산미와 타닌, 장기 숙성형.",
  },
  "errazuriz-aconcagua-costa-chardonnay": {
    abv: 13,
    notesKo: "서늘한 연안 샤르도네. 감귤·흰 꽃에 짭짤한 미네랄, 산뜻하고 긴장감 있다.",
  },
  "vranken-pommery-brut-nature": {
    abv: 12.5,
    notesKo: "당분을 넣지 않은 브뤼 나투르 샴페인. 매우 드라이하고 사과·빵 향에 날카로운 산미.",
  },
  "domaine-vincent-prunier-bourgogne-chardonnay": {
    abv: 12.5,
    notesKo: "부르고뉴 샤르도네. 사과·감귤에 은은한 오크, 균형 잡힌 미디엄 화이트.",
  },
  "domaine-des-hardieres-anjou-blanc": {
    abv: 12.5,
    notesKo: "루아르 슈냉 블랑. 노란 사과·꿀 향에 높은 산미, 드라이하면서 풍미가 있다.",
  },
  "luigi-baudana-langhe-bianco": {
    abv: 13,
    notesKo: "피에몬테 화이트. 흰 꽃·감귤 향에 또렷한 산미, 깔끔하고 미네랄이 있다.",
  },
  "luigi-baudana-langhe-rosso": {
    abv: 13,
    notesKo: "네비올로 중심의 랑게 레드. 체리·장미·타르 향에 산미와 타닌이 살아 있다.",
  },
  "muga-reserva": {
    abv: 14.5,
    notesKo: "리오하 레세르바. 딸기·자두에 오크의 바닐라·가죽, 부드럽게 숙성된 균형.",
  },
  "brown-brothers-premium-cuvee": {
    abv: 13,
    notesKo: "호주 스파클링. 사과·시트러스 향에 상큼한 기포, 가볍고 마시기 편하다.",
  },
  "marques-de-monistrol-cava-brut": {
    abv: 11.5,
    notesKo:
      "전통방식으로 빚은 스페인 카바. 잔에 따르면 고운 기포가 끊임없이 올라오는지 먼저 보고, 청사과·레몬에 흰 꽃과 은은한 빵 효모 향을 맡아본다. 입에서는 바짝 드라이하고 산미가 또렷해 개운하며, 촘촘한 기포가 부드럽게 감긴다. 6~8도로 차게 해서 식전주나 튀김·해산물과 곁들이면 좋다.",
  },
  "pyros-vineyard-block-n4-malbec-2022": { abv: 14 },
  "bel-air-bordeaux-2023": { abv: 13.5 },
  "bigios-moscato-passion-fruit": { abv: 5.5 },
  "tosti-moscato-black-edition-spumante": { abv: 6.5 },
  "bonterra-sauvignon-blanc": { abv: 13 },
  lovely: { abv: 11 },
  "canti-estate-brachetto": { abv: 6 },
  "pikes-clare-valley-riesling": { abv: 11.5 },
  "carpineto-chianti-classico-riserva-2019": { abv: 14 },
  "te-henga-sauvignon-blanc-2025": { abv: 12.5 },
  "carmel-road-pinot-noir": { abv: 13.5 },
};

type Entry = {
  regionSlug: string;
  producer: { slug: string; nameKo: string; nameLocal: string };
  wine: {
    slug: string;
    nameKo: string;
    nameLocal: string;
    type: string;
    classification?: string;
  };
  // 단일 품종이거나 대표 품종이 확실할 때만. 애매한 블렌드는 비워 두고 나중에 보강.
  grapeSlugs: { slug: string; percent?: number }[];
  tasting: {
    drankOn?: string; // YYYY-MM-DD (아직 안 마셨으면 생략)
    purchasedOn?: string; // YYYY-MM-DD (픽업/구매일; 편의점 직접구매 등 모르면 생략)
    purchasePrice?: number; // 모르면 생략
    purchasePlace?: string; // 구매처 불명이면 생략
  };
};

const ENTRIES: Entry[] = [
  {
    regionSlug: "sancerre",
    producer: { slug: "henri-bourgeois", nameKo: "앙리 부르주아", nameLocal: "Henri Bourgeois" },
    wine: {
      slug: "henri-bourgeois-sancerre-les-baronnes",
      nameKo: "상세르 레 바론",
      nameLocal: "Sancerre Les Baronnes",
      type: "white",
      classification: "Sancerre AOC",
    },
    grapeSlugs: [{ slug: "sauvignon-blanc", percent: 100 }],
    tasting: {
      drankOn: "2025-09-12",
      purchasedOn: "2025-09-09",
      purchasePrice: 57000,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "burgenland",
    producer: { slug: "esterhazy", nameKo: "에스터하지", nameLocal: "Esterházy" },
    wine: {
      slug: "esterhazy-klimt-red",
      nameKo: "에스터하지 클림트 레드",
      nameLocal: "Esterházy Klimt Red",
      type: "red",
    },
    grapeSlugs: [{ slug: "zweigelt" }],
    tasting: {
      drankOn: "2025-09-12",
      purchasedOn: "2025-09-11",
      purchasePrice: 10160,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "bordeaux",
    producer: {
      slug: "chateau-pey-la-tour",
      nameKo: "샤또 뻬이 라 뚜르",
      nameLocal: "Château Pey La Tour",
    },
    wine: {
      slug: "chateau-pey-la-tour-reserve",
      nameKo: "샤또 뻬이 라 뚜르 리저브",
      nameLocal: "Château Pey La Tour Réserve",
      type: "red",
      classification: "Bordeaux Supérieur",
    },
    grapeSlugs: [{ slug: "메를로" }],
    tasting: {
      drankOn: "2025-09-19",
      purchasedOn: "2025-09-18",
      purchasePrice: 21120,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "piemonte",
    producer: { slug: "tosti", nameKo: "또스띠", nameLocal: "Tosti" },
    wine: {
      slug: "tosti-moscato-d-asti",
      nameKo: "또스띠 모스카토 다스티 하트",
      nameLocal: "Tosti Moscato d'Asti Hearts",
      type: "sparkling",
      classification: "Moscato d'Asti DOCG",
    },
    grapeSlugs: [{ slug: "무스캇", percent: 100 }],
    tasting: {
      drankOn: "2025-09-26",
      purchasedOn: "2025-09-26",
      purchasePrice: 22410,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "maipo-valley",
    producer: { slug: "montgras", nameKo: "몽그라스", nameLocal: "MontGras" },
    wine: {
      slug: "montgras-intriga-maxima",
      nameKo: "몽그라스 인트리가 막시마",
      nameLocal: "MontGras Intriga Maxima",
      type: "red",
    },
    grapeSlugs: [{ slug: "까베르네-소비뇽" }],
    tasting: {
      drankOn: "2026-01-23",
      purchasedOn: "2026-01-22",
      purchasePrice: 127000,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "puglia",
    producer: { slug: "carlo-sani", nameKo: "까를로 사니", nameLocal: "Carlo Sani" },
    wine: {
      slug: "carlo-sani-susumaniello",
      nameKo: "까를로 사니 수수마니엘로",
      nameLocal: "Carlo Sani Susumaniello",
      type: "red",
      classification: "Puglia IGT",
    },
    grapeSlugs: [{ slug: "susumaniello", percent: 100 }],
    tasting: {
      drankOn: "2026-01-30",
      purchasedOn: "2026-01-29",
      purchasePrice: 15120,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "샹파뉴",
    producer: { slug: "gosset", nameKo: "고세", nameLocal: "Gosset" },
    wine: {
      slug: "gosset-grand-rose-brut",
      nameKo: "고세 그랑 로제 브륏 NV",
      nameLocal: "Gosset Grand Rosé Brut NV",
      type: "champagne",
      classification: "Champagne",
    },
    grapeSlugs: [],
    tasting: {
      drankOn: "2026-02-20",
      purchasedOn: "2026-02-05",
      purchasePrice: 94200,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "chablis",
    producer: { slug: "domaine-laroche", nameKo: "도멘 라로쉬", nameLocal: "Domaine Laroche" },
    wine: {
      slug: "domaine-laroche-chablis-saint-martin",
      nameKo: "도멘 라로쉬 샤블리 생마르땡",
      nameLocal: "Domaine Laroche Chablis Saint Martin",
      type: "white",
      classification: "Chablis AOC",
    },
    grapeSlugs: [{ slug: "샤르도네", percent: 100 }],
    tasting: {
      drankOn: "2026-03-01",
      purchasedOn: "2026-02-27",
      purchasePrice: 47200,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "ribera-del-duero",
    producer: { slug: "pesquera", nameKo: "뻬스께라", nameLocal: "Pesquera" },
    wine: {
      slug: "pesquera-crianza",
      nameKo: "뻬스께라 크리안자",
      nameLocal: "Pesquera Crianza",
      type: "red",
      classification: "Ribera del Duero DO",
    },
    grapeSlugs: [{ slug: "tempranillo", percent: 100 }],
    tasting: {
      drankOn: "2026-05-15",
      purchasedOn: "2026-05-14",
      purchasePrice: 26920,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "montalcino",
    producer: {
      slug: "fattoria-dei-barbi",
      nameKo: "파토리아 데이 바르비",
      nameLocal: "Fattoria dei Barbi",
    },
    wine: {
      slug: "fattoria-dei-barbi-brunello-blue-label",
      nameKo: "파토리아 데이 바르비 브루넬로 디 몬탈치노 블루라벨",
      nameLocal: "Fattoria dei Barbi Brunello di Montalcino Blue Label",
      type: "red",
      classification: "Brunello di Montalcino DOCG",
    },
    grapeSlugs: [{ slug: "산지오베제", percent: 100 }],
    tasting: {
      drankOn: "2026-05-22",
      purchasedOn: "2026-05-21",
      purchasePrice: 100000,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "aconcagua-costa",
    producer: { slug: "errazuriz", nameKo: "에라주리즈", nameLocal: "Errázuriz" },
    wine: {
      slug: "errazuriz-aconcagua-costa-chardonnay",
      nameKo: "에라주리즈 아콩카과 코스타 샤르도네",
      nameLocal: "Errázuriz Aconcagua Costa Chardonnay",
      type: "white",
    },
    grapeSlugs: [{ slug: "샤르도네", percent: 100 }],
    tasting: {
      drankOn: "2026-05-29",
      purchasedOn: "2026-05-28",
      purchasePrice: 36920,
      purchasePlace: "와인25플러스",
    },
  },
  {
    // 라로쉬 샤블리 재구매 — 와인은 이미 있고 시음 기록만 하나 더.
    regionSlug: "chablis",
    producer: { slug: "domaine-laroche", nameKo: "도멘 라로쉬", nameLocal: "Domaine Laroche" },
    wine: {
      slug: "domaine-laroche-chablis-saint-martin",
      nameKo: "도멘 라로쉬 샤블리 생마르땡",
      nameLocal: "Domaine Laroche Chablis Saint Martin",
      type: "white",
      classification: "Chablis AOC",
    },
    grapeSlugs: [{ slug: "샤르도네", percent: 100 }],
    tasting: {
      drankOn: "2026-07-31",
      purchasedOn: "2026-07-30",
      purchasePrice: 47600,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "샹파뉴",
    producer: { slug: "vranken-pommery", nameKo: "브랑켄 뽀므리", nameLocal: "Vranken Pommery" },
    wine: {
      slug: "vranken-pommery-brut-nature",
      nameKo: "브랑켄 뽀므리 브뤼 나투르",
      nameLocal: "Vranken Pommery Brut Nature",
      type: "champagne",
      classification: "Champagne",
    },
    grapeSlugs: [],
    tasting: {
      drankOn: "2026-08-07",
      purchasedOn: "2026-08-03",
      purchasePrice: 63720,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "bourgogne",
    producer: {
      slug: "domaine-vincent-prunier",
      nameKo: "도멘 뱅상 푸르니에",
      nameLocal: "Domaine Vincent Prunier",
    },
    wine: {
      slug: "domaine-vincent-prunier-bourgogne-chardonnay",
      nameKo: "도멘 뱅상 푸르니에 부르고뉴 샤르도네",
      nameLocal: "Domaine Vincent Prunier Bourgogne Chardonnay",
      type: "white",
      classification: "Bourgogne AOC",
    },
    grapeSlugs: [{ slug: "샤르도네", percent: 100 }],
    tasting: {
      drankOn: "2026-08-14",
      purchasedOn: "2026-08-13",
      purchasePrice: 29920,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "anjou",
    producer: {
      slug: "domaine-des-hardieres",
      nameKo: "도멘 데 아르디에",
      nameLocal: "Domaine des Hardières",
    },
    wine: {
      slug: "domaine-des-hardieres-anjou-blanc",
      nameKo: "도멘 데 아르디에 앙주 블랑 레 쁘띠 갸르",
      nameLocal: "Domaine des Hardières Anjou Blanc Les Petites Gardes",
      type: "white",
      classification: "Anjou AOC",
    },
    grapeSlugs: [{ slug: "chenin-blanc", percent: 100 }],
    tasting: {
      drankOn: "2026-08-21",
      purchasedOn: "2026-08-18",
      purchasePrice: 27000,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "langhe",
    producer: { slug: "luigi-baudana", nameKo: "루이지 바우다나", nameLocal: "Luigi Baudana" },
    wine: {
      slug: "luigi-baudana-langhe-bianco",
      nameKo: "루이지 바우다나 랑게 비앙코",
      nameLocal: "Luigi Baudana Langhe Bianco",
      type: "white",
      classification: "Langhe Bianco DOC",
    },
    grapeSlugs: [],
    tasting: {
      drankOn: "2026-08-28",
      purchasedOn: "2026-08-24",
      purchasePrice: 42400,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "langhe",
    producer: { slug: "luigi-baudana", nameKo: "루이지 바우다나", nameLocal: "Luigi Baudana" },
    wine: {
      slug: "luigi-baudana-langhe-rosso",
      nameKo: "루이지 바우다나 랑게 로쏘",
      nameLocal: "Luigi Baudana Langhe Rosso",
      type: "red",
      classification: "Langhe Rosso DOC",
    },
    grapeSlugs: [{ slug: "nebbiolo" }],
    tasting: {
      drankOn: "2026-08-21",
      purchasedOn: "2026-08-20",
      purchasePrice: 32000,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "rioja",
    producer: { slug: "muga", nameKo: "무가", nameLocal: "Bodegas Muga" },
    wine: {
      slug: "muga-reserva",
      nameKo: "무가 레세르바",
      nameLocal: "Muga Reserva",
      type: "red",
      classification: "Rioja DOCa Reserva",
    },
    grapeSlugs: [{ slug: "tempranillo" }],
    tasting: {
      drankOn: "2026-08-28",
      purchasedOn: "2026-08-27",
      purchasePrice: 51120,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "australia",
    producer: { slug: "brown-brothers", nameKo: "브라운 브라더스", nameLocal: "Brown Brothers" },
    wine: {
      slug: "brown-brothers-premium-cuvee",
      nameKo: "브라운 브라더스 프리미엄 뀌베",
      nameLocal: "Brown Brothers Premium Cuvée",
      type: "sparkling",
    },
    grapeSlugs: [],
    tasting: {
      purchasedOn: "2026-08-31",
      purchasePrice: 32720,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "penedes",
    producer: {
      slug: "marques-de-monistrol",
      nameKo: "마르케스 드 모니스트롤",
      nameLocal: "Marqués de Monistrol",
    },
    wine: {
      slug: "marques-de-monistrol-cava-brut",
      nameKo: "마르케스 드 모니스트롤 까바 브뤼",
      nameLocal: "Marqués de Monistrol Cava Brut",
      type: "sparkling",
      classification: "Cava DO",
    },
    grapeSlugs: [{ slug: "macabeo" }, { slug: "xarel-lo" }, { slug: "parellada" }],
    tasting: {
      purchasedOn: "2026-08-31",
      purchasePrice: 10320,
      purchasePlace: "와인25플러스",
    },
  },
  {
    regionSlug: "pedernal",
    producer: { slug: "pyros-wines", nameKo: "피로스 와인", nameLocal: "Pyros Wines" },
    wine: {
      slug: "pyros-vineyard-block-n4-malbec-2022",
      nameKo: "피로스 빈야드 블록 N4 말벡 2022",
      nameLocal: "PYROS Vineyard Block N4 Malbec 2022",
      type: "red",
      classification: "Valle de Pedernal (San Juan GI)",
    },
    grapeSlugs: [{ slug: "malvec" }],
    tasting: { drankOn: "2026-07-24" },
  },
  {
    regionSlug: "bordeaux",
    producer: { slug: "maison-sichel", nameKo: "메종 시셸", nameLocal: "Maison Sichel" },
    wine: {
      slug: "bel-air-bordeaux-2023",
      nameKo: "벨 에어 보르도 2023",
      nameLocal: "Bel Air Bordeaux 2023",
      type: "red",
      classification: "Bordeaux AOC",
    },
    grapeSlugs: [{ slug: "메를로" }, { slug: "까베르네-소비뇽" }],
    tasting: { drankOn: "2026-07-10" },
  },
  {
    regionSlug: "italy",
    producer: { slug: "bigios", nameKo: "비지오스", nameLocal: "Bigio's" },
    wine: {
      slug: "bigios-moscato-passion-fruit",
      nameKo: "비지오스 모스카토 패션프루트",
      nameLocal: "Bigio's Moscato Wine + Passion Fruit",
      type: "dessert",
    },
    grapeSlugs: [{ slug: "무스캇" }],
    tasting: { drankOn: "2026-07-03" },
  },
  {
    regionSlug: "piemonte",
    producer: { slug: "tosti", nameKo: "또스띠", nameLocal: "Tosti1820" },
    wine: {
      slug: "tosti-moscato-black-edition-spumante",
      nameKo: "또스띠 모스카토 블랙 에디션 스푸만테",
      nameLocal: "Tosti Moscato Black Edition Vino Spumante",
      type: "dessert",
      classification: "Vino Spumante",
    },
    grapeSlugs: [{ slug: "무스캇" }],
    tasting: { drankOn: "2026-06-19" },
  },
  {
    regionSlug: "mendocino",
    producer: {
      slug: "bonterra",
      nameKo: "본테라 오가닉 이스테이트",
      nameLocal: "Bonterra Organic Estates",
    },
    wine: {
      slug: "bonterra-sauvignon-blanc",
      nameKo: "본테라 소비뇽 블랑",
      nameLocal: "Bonterra Sauvignon Blanc",
      type: "white",
    },
    grapeSlugs: [{ slug: "sauvignon-blanc" }],
    tasting: { drankOn: "2026-05-08" },
  },
  {
    regionSlug: "bordeaux",
    producer: {
      slug: "gcf",
      nameKo: "그랑 셰 드 프랑스",
      nameLocal: "Les Grands Chais de France",
    },
    wine: {
      slug: "lovely",
      nameKo: "러블리",
      nameLocal: "LOVELY",
      type: "white",
      classification: "Vin de France",
    },
    grapeSlugs: [{ slug: "sauvignon-blanc" }, { slug: "semillon" }],
    tasting: { drankOn: "2026-05-08" },
  },
  {
    regionSlug: "piemonte",
    producer: { slug: "canti", nameKo: "칸티", nameLocal: "CANTI" },
    wine: {
      slug: "canti-estate-brachetto",
      nameKo: "칸티 에스테이트 브라케토",
      nameLocal: "CANTI Estate Brachetto",
      type: "dessert",
      classification: "Piemonte Brachetto DOC",
    },
    grapeSlugs: [{ slug: "brachetto" }],
    tasting: { drankOn: "2026-04-24" },
  },
  {
    regionSlug: "clare-valley",
    producer: { slug: "pikes-wines", nameKo: "파이크스", nameLocal: "Pikes Wines" },
    wine: {
      slug: "pikes-clare-valley-riesling",
      nameKo: "파이크스 클레어 밸리 리슬링",
      nameLocal: "Pikes Clare Valley Riesling",
      type: "white",
    },
    grapeSlugs: [{ slug: "리즐링" }],
    tasting: { drankOn: "2026-02-27" },
  },
  {
    regionSlug: "chianti-classico",
    producer: { slug: "carpineto", nameKo: "카르피네토", nameLocal: "Carpineto" },
    wine: {
      slug: "carpineto-chianti-classico-riserva-2019",
      nameKo: "카르피네토 키안티 클라시코 리세르바 2019",
      nameLocal: "Carpineto Chianti Classico Riserva 2019",
      type: "red",
      classification: "Chianti Classico Riserva DOCG",
    },
    grapeSlugs: [{ slug: "산지오베제" }, { slug: "canaiolo" }],
    tasting: { drankOn: "2026-02-13" },
  },
  {
    regionSlug: "말보로",
    producer: { slug: "te-henga-wines", nameKo: "테 헹가 와인즈", nameLocal: "Te Henga Wines" },
    wine: {
      slug: "te-henga-sauvignon-blanc-2025",
      nameKo: "테 헹가 소비뇽 블랑 2025",
      nameLocal: "Te Henga Sauvignon Blanc 2025",
      type: "white",
    },
    grapeSlugs: [{ slug: "sauvignon-blanc" }],
    tasting: { drankOn: "2026-02-01" },
  },
  {
    regionSlug: "미국-캘리포니아-몬테레이",
    producer: {
      slug: "잭슨-패밀리-와이너리",
      nameKo: "잭슨 패밀리 와이너리",
      nameLocal: "Jackson Family Wines",
    },
    wine: {
      slug: "carmel-road-pinot-noir",
      nameKo: "카멜로드 피노누아",
      nameLocal: "Carmel Road Pinot Noir",
      type: "red",
    },
    grapeSlugs: [{ slug: "피노누아" }],
    tasting: { drankOn: "2026-06-26" },
  },
  {
    regionSlug: "australia",
    producer: { slug: "brown-brothers", nameKo: "브라운 브라더스", nameLocal: "Brown Brothers" },
    wine: {
      slug: "brown-brothers-premium-cuvee",
      nameKo: "브라운 브라더스 프리미엄 뀌베",
      nameLocal: "Brown Brothers Premium Cuvée",
      type: "sparkling",
    },
    grapeSlugs: [],
    tasting: { drankOn: "2026-07-17" },
  },
];

async function main() {
  // 1) 산지 보장(부모 먼저).
  for (const r of REGIONS) {
    const parent = r.parentSlug
      ? await db.region.findUnique({ where: { slug: r.parentSlug } })
      : null;
    if (r.parentSlug && !parent) throw new Error(`부모 산지 없음: ${r.parentSlug}`);
    await db.region.upsert({
      where: { slug: r.slug },
      update: {},
      create: {
        slug: r.slug,
        nameKo: r.nameKo,
        nameLocal: r.nameLocal,
        country: r.country,
        level: r.level,
        parentId: parent?.id ?? null,
        latitude: r.latitude,
        longitude: r.longitude,
      },
    });
  }

  // 1.5) 품종 보장.
  for (const g of GRAPES) {
    await db.grape.upsert({
      where: { slug: g.slug },
      update: {},
      create: { slug: g.slug, nameKo: g.nameKo, nameLocal: g.nameLocal, color: g.color },
    });
  }

  // 1.7) 원어명 오기 교정에 따른 슬러그 리네임(멱등: 옛 슬러그가 있고 새 슬러그가
  // 아직 없을 때만 바꾼다). 슬러그가 upsert 키라, 이걸 안 하면 재시드 때 옛 행이
  // 남고 중복이 생긴다. id는 유지되므로 시음 노트 연결(wineId)도 그대로다.
  const producerRenames: [string, string][] = [
    ["domaine-vincent-fournier", "domaine-vincent-prunier"],
    ["domaine-des-ardillers", "domaine-des-hardieres"],
  ];
  const wineRenames: [string, string][] = [
    [
      "domaine-vincent-fournier-bourgogne-chardonnay",
      "domaine-vincent-prunier-bourgogne-chardonnay",
    ],
    ["domaine-des-ardillers-anjou-blanc", "domaine-des-hardieres-anjou-blanc"],
  ];
  for (const [from, to] of producerRenames) {
    const old = await db.producer.findUnique({ where: { slug: from }, select: { id: true } });
    const taken = await db.producer.findUnique({ where: { slug: to }, select: { id: true } });
    if (old && !taken) await db.producer.update({ where: { slug: from }, data: { slug: to } });
  }
  for (const [from, to] of wineRenames) {
    const old = await db.wine.findUnique({ where: { slug: from }, select: { id: true } });
    const taken = await db.wine.findUnique({ where: { slug: to }, select: { id: true } });
    if (old && !taken) await db.wine.update({ where: { slug: from }, data: { slug: to } });
  }

  // 2) 기록.
  for (const e of ENTRIES) {
    const region = await db.region.findUnique({ where: { slug: e.regionSlug } });
    if (!region) throw new Error(`산지 없음: ${e.regionSlug}`);

    const producer = await db.producer.upsert({
      where: { slug: e.producer.slug },
      update: { nameLocal: e.producer.nameLocal },
      create: {
        slug: e.producer.slug,
        nameKo: e.producer.nameKo,
        nameLocal: e.producer.nameLocal,
        regionId: region.id,
      },
    });

    const d = WINE_DETAILS[e.wine.slug] ?? {};
    const wine = await db.wine.upsert({
      where: { slug: e.wine.slug },
      // nameLocal·abv·notesKo·classification 은 재실행 때도 갱신(시드가 단일 소스).
      update: {
        nameLocal: e.wine.nameLocal,
        abv: d.abv ?? null,
        notesKo: d.notesKo ?? null,
        classification: e.wine.classification ?? null,
      },
      create: {
        slug: e.wine.slug,
        nameKo: e.wine.nameKo,
        nameLocal: e.wine.nameLocal,
        type: e.wine.type,
        classification: e.wine.classification,
        abv: d.abv,
        notesKo: d.notesKo,
        producerId: producer.id,
        regionId: region.id,
      },
    });

    for (const g of e.grapeSlugs) {
      const grape = await db.grape.findUnique({ where: { slug: g.slug } });
      if (!grape) throw new Error(`품종 없음: ${g.slug}`);
      const has = await db.wineGrape.findFirst({ where: { wineId: wine.id, grapeId: grape.id } });
      if (!has) {
        await db.wineGrape.create({
          data: { wineId: wine.id, grapeId: grape.id, percent: g.percent ?? null },
        });
      }
    }

    // 아직 안 마신 와인은 drankOn 없이 구매 기록만 남긴다.
    const drankOn = e.tasting.drankOn ? new Date(`${e.tasting.drankOn}T00:00:00.000Z`) : null;
    const purchasedOn = e.tasting.purchasedOn
      ? new Date(`${e.tasting.purchasedOn}T00:00:00.000Z`)
      : null;
    // 같은 구매(와인·구매일·가격)를 한 번만 만든다. 음용 여부(drankOn)와 무관하게
    // 인식해, 나중에 마셔서 음용일이 붙거나 추정일이 바뀌어도 중복이 안 생긴다.
    const dup = await db.tastingNote.findFirst({
      where: { wineId: wine.id, purchasedOn, purchasePrice: e.tasting.purchasePrice },
    });
    if (dup) {
      // 이미 있는 노트는 사용자가 앱에서 편집했을 수 있다. 시드는 **비어 있는 칸만
      // 채우고** 사용자가 넣은 값은 절대 덮지 않는다. (과거: 시드가 구매처·음용일을
      // 시드값으로 덮어써, 사용자가 앱에서 적은 음용일이 배포마다 null 로 지워졌다.)
      const fill: { purchasePlace?: string | null; drankOn?: Date | null } = {};
      const place = e.tasting.purchasePlace ?? null;
      if (dup.purchasePlace == null && place != null) fill.purchasePlace = place;
      if (dup.drankOn == null && drankOn != null) fill.drankOn = drankOn;
      if (Object.keys(fill).length > 0) {
        await db.tastingNote.update({ where: { id: dup.id }, data: fill });
        console.log(`~ 채움: ${e.wine.nameLocal} (${Object.keys(fill).join(", ")})`);
      } else {
        console.log(`= 이미 있음: ${e.wine.nameLocal} (${e.tasting.drankOn ?? "미시음"})`);
      }
      continue;
    }
    await db.tastingNote.create({
      data: {
        wineId: wine.id,
        drankOn,
        purchasedOn,
        purchasePrice: e.tasting.purchasePrice,
        purchasePlace: e.tasting.purchasePlace ?? null,
      },
    });
    console.log(
      `+ 추가: ${e.wine.nameLocal} — 마신날 ${e.tasting.drankOn ?? "미시음"}, ${e.tasting.purchasePrice}원`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
