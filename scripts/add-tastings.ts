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
    slug: "mosel",
    nameKo: "모젤",
    nameLocal: "Mosel",
    country: "독일",
    level: "region",
    parentSlug: "germany",
    latitude: 49.85,
    longitude: 6.97, // 트리어~베른카스텔 구간(리슬링 산지의 중심)
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
    slug: "barossa-valley",
    nameKo: "바로사 밸리",
    nameLocal: "Barossa Valley",
    country: "호주",
    level: "region",
    parentSlug: "australia",
    latitude: -34.53,
    longitude: 138.95,
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
  {
    slug: "japan",
    nameKo: "일본",
    nameLocal: "Japan",
    country: "일본",
    level: "country",
    parentSlug: null,
    latitude: 36.2,
    longitude: 138.25,
  },
  {
    slug: "hokkaido",
    nameKo: "홋카이도",
    nameLocal: "Hokkaido (北海道)",
    country: "일본",
    level: "region",
    parentSlug: "japan",
    latitude: 43.3,
    longitude: 142.4,
  },
  {
    slug: "yoichi",
    nameKo: "요이치",
    nameLocal: "Yoichi (余市)",
    country: "일본",
    level: "subregion",
    parentSlug: "hokkaido",
    latitude: 43.19,
    longitude: 140.78,
  },
  {
    slug: "sorachi",
    nameKo: "소라치",
    nameLocal: "Sorachi (空知)",
    country: "일본",
    level: "subregion",
    parentSlug: "hokkaido",
    latitude: 43.43,
    longitude: 141.83,
  },
  {
    slug: "tokachi",
    nameKo: "도카치",
    nameLocal: "Tokachi (十勝)",
    country: "일본",
    level: "subregion",
    parentSlug: "hokkaido",
    latitude: 42.91,
    longitude: 143.05,
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
  { slug: "rondo", nameKo: "론도", nameLocal: "Rondo", color: "red" },
  { slug: "yamasachi", nameKo: "야마사치", nameLocal: "Yamasachi (山幸)", color: "red" },
  { slug: "yama-sauvignon", nameKo: "야마 소비뇽", nameLocal: "Yama Sauvignon", color: "red" },
  { slug: "armo-noir", nameKo: "아르모 누아르", nameLocal: "Armo Noir", color: "red" },
  // 껍질은 붉은빛(옛 이름 베니시오야=紅塩谷)이지만 화이트 와인으로 빚는다.
  { slug: "tabiji", nameKo: "다비지", nameLocal: "Tabiji (旅路)", color: "white" },
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
  "grans-fassian-mineralschiefer-riesling": {
    abv: 11.5,
    notesKo:
      "이름의 '미네랄시퍼'가 모젤의 점판암을 가리킨다. 첫 향은 라임과 아삭한 풋사과, 잔에 두고 공기를 먹이면 살구·복숭아가 올라온다. 입에 넣으면 산미가 곧게 서고 그 뒤로 젖은 돌 같은 짭짤한 기운이 남는데, 이게 모젤 리슬링에서 흔히 말하는 미네랄이다. 도수가 11.5도로 낮아 가볍다고 느끼기 쉽지만 그만큼 산미와 과실이 또렷하게 드러난다. 너무 차게 하면 향이 닫히니 8~10도쯤에서 마시고, 잔에서 온도가 올라갈수록 달라지는 걸 지켜보면 재미있다.",
  },
  // 홋카이도 와인들은 라벨 도수를 확인하지 못해 abv 를 비워 둔다.
  "hokkaido-wine-otaru-hatsushibori-rondo": {
    notesKo:
      "그해 수확한 포도를 열처리 없이 바로 병에 담는 홋카이도 와인의 햇와인 '하쓰시보리'. 론도는 추위에 강한 독일 교배 품종이라 색이 짙게 나오는데, 잔에 따르면 그 진한 보랏빛부터 보인다. 첫 향은 갓 으깬 포도와 체리 같은 풋풋한 과실이고, 입에서는 타닌보다 산미와 과즙이 앞선다. 햇와인이라 오래 두기보다 사서 곧 마시는 게 맞고, 숙성 향 대신 막 담근 포도의 생기를 느껴보면 된다.",
  },
  "hokkaido-wine-tsurunuma-rondo": {
    notesKo:
      "홋카이도 와인이 소라치 우라우스의 직영 농장 쓰루누마에서 기른 론도로 빚은 레드. 론도 특유의 짙은 색에 비해 맛은 생각보다 순한 편이라, 색만 보고 묵직한 와인을 기대하면 의외라고 느낄 수 있다. 체리·자두 같은 검붉은 과실을 찾아보고, 떫은맛이 얼마나 가볍게 지나가는지 확인해 보자. 너무 차갑지 않게 14~16도쯤이 과실이 잘 드러난다.",
  },
  "occigabi-zweigelt": {
    notesKo:
      "요이치 언덕의 오치가비가 자기 밭 포도로 빚은 츠바이겔트. 오스트리아 품종이지만 서늘한 홋카이도에서 자라 색이 밝고 산미가 또렷하게 선다. 첫 향의 붉은 체리와 은은한 후추를 맡아본 뒤, 입안에서 가벼운 몸집에 비해 타닌이 살짝 조여 오는 느낌에 주목해 보자. 살짝 차게 마셔도 좋은 레드다.",
  },
  "osa-winery-tabi": {
    notesKo:
      "오타루에서 태어난 희귀 품종 다비지(旅路)로 빚은 오사 와이너리의 화이트. 껍질이 붉은 포도지만 화이트로 빚어, 청포도 알을 그대로 깨문 듯한 생생한 포도 향이 먼저 온다. 유럽 품종 와인과는 결이 다른 '포도 그 자체' 같은 맛이 이 와인의 개성이니, 익숙한 과일 이름을 찾기보다 그 낯선 포도 맛을 그대로 즐기면 된다. 차게 해서 가벼운 일식과 곁들이기 좋다.",
  },
  "yoichi-winery-tarujuku-zweigeltrebe": {
    notesKo:
      "요이치 와이너리가 오랫동안 내 온 대표 레드로, 츠바이겔트를 오크통에서 길게 숙성했다. 서늘한 요이치의 츠바이겔트라 산미가 먼저 날카롭게 서는데, 그 뒤에 오크에서 온 바닐라·삼나무 향과 떫은맛이 과실을 얼마나 감싸는지 보자. 잔에서 몇 분 공기를 쐬면 처음의 각진 느낌이 누그러지니, 첫 모금과 나중 모금을 비교해 보면 좋다.",
  },
  "otobe-winery-yama-sauvignon-tarujukusei": {
    notesKo:
      "일본 산머루와 카베르네 소비뇽을 교배한 야마 소비뇽을 오크통에서 숙성한 레드. 잔에서는 산머루를 닮은 짙은 색이 먼저 보이고, 입에서는 농축된 검은 과실과 또렷한 산미가 함께 온다. 오크 숙성이 그 산미를 얼마나 둥글게 다듬었는지, 카베르네에서 온 짜임새가 느껴지는지에 주목해 보자.",
  },
  "hakkenzan-winery-kyoko": {
    notesKo:
      "삿포로 남쪽 핫켄잔 기슭의 와이너리가 아르모 누아르를 주로 써서 빚은 레드. 오크통이 아니라 탱크에서 숙성해 나무 향보다 과실이 앞에 선다. 미디엄 바디에 산미와 떫은맛이 뼈대를 받치는 구조라, 과일 맛 뒤로 그 둘이 어떻게 받쳐 주는지 느껴 보자.",
  },
  "memuro-winery-yamasachi": {
    notesKo:
      "도카치 메무로 땅에서 기른 야마사치로만 빚은 레드. 야마사치는 일본 산머루를 교배해 만든 홋카이도 품종으로, 2020년 국제 와인기구(OIV)에 일본 품종으로는 세 번째로 이름을 올렸다. 잔에서는 거의 검게 보이는 진한 색이 먼저 눈에 들어오고, 입에 넣으면 산머루에서 온 강한 산미가 확 치고 올라온다. 타닌보다 산미가 뼈대인 와인이라, 기름진 고기나 간장 양념 요리와 함께하면 그 산미가 오히려 반갑다.",
  },
  "pierre-zero-blanc-de-blancs": {
    abv: 0,
    notesKo:
      "프랑스 샤르도네 와인에서 알코올만 빼낸 무알코올 스파클링. 배·사과·시트러스 껍질 향은 와인 그대로인데, 알코올이 주는 무게와 온기가 빠져 입안이 훨씬 가볍다. 일반 스파클링보다 기포가 순하게 느껴지는지, 알코올 대신 산미가 맛의 중심을 잡는지 비교해 보면 재미있다. 아주 차게 해서 건배주로 쓰기 좋다.",
  },
  "two-hands-gnarly-dudes-shiraz": {
    abv: 13.8,
    notesKo:
      "바로사 밸리 쉬라즈를 오래 쓴 프랑스 오크통에서 숙성한 투핸즈의 대표 와인. 잔을 기울이면 가장자리까지 검붉은 진한 색이 먼저 보이고, 향에서는 블랙베리·자두 같은 검은 과실 위로 후추와 말린 허브가 올라온다. 새 오크가 아니라 나무 향이 과실을 덮지 않으니, 과실 뒤로 고기 같은 짭짤한 풍미가 어떻게 이어지는지 따라가 보자. 떫은맛은 촘촘하지만 거칠지 않다. 너무 따뜻하면 알코올이 도드라지니 16~18도 정도로 약간 서늘하게 마시는 게 좋다.",
  },
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
  // 앱에서 먼저 기록한 와인을 보강만 할 땐 생략한다. 앱 기록과 구매일·가격이 하나라도
  // 다르면 시드가 같은 시음을 한 건 더 만들어 버린다.
  tasting?: {
    drankOn?: string; // YYYY-MM-DD (아직 안 마셨으면 생략)
    purchasedOn?: string; // YYYY-MM-DD (픽업/구매일; 편의점 직접구매 등 모르면 생략)
    purchasePrice?: number; // 모르면 생략
    purchasePlace?: string; // 구매처 불명이면 생략
    memo?: string; // 시음 메모(bodyText). 외화로 산 건 원화로 환산해 purchasePrice 에 두고 원가는 여기 적는다.
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
    // 뱅 드 프랑스(지역 표시 없는 등급)라 보르도가 아니라 나라 단위로 둔다.
    regionSlug: "france",
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
  {
    regionSlug: "mosel",
    producer: {
      slug: "grans-fassian",
      nameKo: "그란 파시안",
      nameLocal: "Weingut Grans-Fassian",
    },
    wine: {
      slug: "grans-fassian-mineralschiefer-riesling",
      nameKo: "그란 파시안 미네랄시퍼 리슬링",
      nameLocal: "Grans-Fassian Mineralschiefer Riesling trocken",
      type: "white",
      classification: "Mosel QbA · VDP.Gutswein",
    },
    grapeSlugs: [{ slug: "리즐링", percent: 100 }],
    tasting: {
      drankOn: "2026-09-08",
      purchasedOn: "2026-09-08",
      purchasePrice: 41700,
      purchasePlace: "GS25",
    },
  },
  // 2026 가을 홋카이도 여행. 엔화는 여행 중 환전 환율(100엔≈861원)로 원화 환산했다.
  {
    regionSlug: "hokkaido",
    producer: {
      slug: "hokkaido-wine",
      nameKo: "홋카이도 와인",
      nameLocal: "Hokkaido Wine (北海道ワイン)",
    },
    wine: {
      slug: "hokkaido-wine-otaru-hatsushibori-rondo",
      nameKo: "오타루 하쓰시보리 론도",
      nameLocal: "Otaru Hatsushibori Rondo (おたる初しぼり ロンド)",
      type: "red",
    },
    grapeSlugs: [{ slug: "rondo", percent: 100 }],
    tasting: {
      drankOn: "2026-09-27",
      purchasedOn: "2026-09-27",
      purchasePrice: 14380,
      purchasePlace: "이온 맥스밸류 (삿포로)",
      memo: "휘발유 같은 향이 계속 남았다. 2025년 햇와인. 1,670엔.",
    },
  },
  {
    regionSlug: "spain",
    producer: { slug: "alsinac", nameKo: "알시낙", nameLocal: "Alsinac" },
    wine: {
      slug: "alsinac-cava-brut",
      nameKo: "알시낙 까바 브뤼",
      nameLocal: "Alsinac Cava Brut",
      type: "sparkling",
      classification: "Cava DO",
    },
    grapeSlugs: [],
    tasting: {
      drankOn: "2026-10-01",
      purchasedOn: "2026-10-01",
      purchasePlace: "단초 (JR타워 호텔 닛코 삿포로)",
      memo: "풍부한 탄산감, 중상 정도의 산미. 생일 저녁 코스와 함께.",
    },
  },
  {
    regionSlug: "랑그독-루시옹",
    producer: { slug: "pierre-chavin", nameKo: "피에르 샤뱅", nameLocal: "Pierre Chavin" },
    wine: {
      slug: "pierre-zero-blanc-de-blancs",
      nameKo: "피에르 제로 블랑 드 블랑",
      nameLocal: "Pierre Zéro Blanc de Blancs",
      type: "sparkling",
    },
    grapeSlugs: [{ slug: "샤르도네" }],
    tasting: {
      drankOn: "2026-10-01",
      purchasedOn: "2026-10-01",
      purchasePlace: "단초 (JR타워 호텔 닛코 삿포로)",
      memo: "상큼한 산미, 적은 탄산. 생일 저녁 코스와 함께.",
    },
  },
  {
    regionSlug: "hokkaido",
    producer: { slug: "osa-winery", nameKo: "오사 와이너리", nameLocal: "OSA Winery" },
    wine: {
      slug: "osa-winery-tabi",
      nameKo: "타비",
      nameLocal: "Tabi",
      type: "white",
    },
    grapeSlugs: [{ slug: "tabiji", percent: 100 }],
    tasting: {
      drankOn: "2026-10-01",
      purchasedOn: "2026-10-01",
      purchasePrice: 12050,
      purchasePlace: "단초 (JR타워 호텔 닛코 삿포로)",
      memo: "청포도 향에, 맛도 포도알을 먹는 듯한 특이한 맛. 글라스 1,400엔(영수증의 화이트와인 글라스로 추정).",
    },
  },
  {
    regionSlug: "tokachi",
    producer: {
      slug: "memuro-winery",
      nameKo: "메무로 와이너리",
      nameLocal: "Memuro Winery (めむろワイナリー)",
    },
    wine: {
      slug: "memuro-winery-yamasachi",
      nameKo: "야마사치",
      nameLocal: "Yamasachi (山幸)",
      type: "red",
    },
    grapeSlugs: [{ slug: "yamasachi", percent: 100 }],
    tasting: {
      drankOn: "2026-10-01",
      purchasedOn: "2026-10-01",
      purchasePrice: 8610,
      purchasePlace: "단초 (JR타워 호텔 닛코 삿포로)",
      memo: "검붉은색, 강렬한 산미, 독특한 풍미. 글라스 1,000엔(영수증의 레드와인 글라스로 추정).",
    },
  },
  {
    regionSlug: "yoichi",
    producer: { slug: "occigabi", nameKo: "오치가비 와이너리", nameLocal: "OcciGabi Winery" },
    wine: {
      slug: "occigabi-zweigelt",
      nameKo: "오치가비 츠바이겔트",
      nameLocal: "OcciGabi Zweigelt",
      type: "red",
    },
    grapeSlugs: [{ slug: "zweigelt", percent: 100 }],
    tasting: {
      drankOn: "2026-10-02",
      purchasedOn: "2026-10-02",
      purchasePrice: 6890,
      purchasePlace: "삿포로 오텀페스트",
      memo: "밝은 빨간색. 쓰루누마 론도보다 떫은 느낌이 상대적으로 강하다. 글라스 800엔.",
    },
  },
  {
    regionSlug: "sorachi",
    producer: {
      slug: "hokkaido-wine",
      nameKo: "홋카이도 와인",
      nameLocal: "Hokkaido Wine (北海道ワイン)",
    },
    wine: {
      slug: "hokkaido-wine-tsurunuma-rondo",
      nameKo: "쓰루누마 론도",
      nameLocal: "Tsurunuma Rondo (鶴沼 ロンド)",
      type: "red",
    },
    grapeSlugs: [{ slug: "rondo", percent: 100 }],
    tasting: {
      drankOn: "2026-10-02",
      purchasedOn: "2026-10-02",
      purchasePrice: 8610,
      purchasePlace: "삿포로 오텀페스트",
      memo: "상대적으로 어두운 붉은색. 지난번 마트에서 산 작년 햇와인 론도에서 나던 기름 냄새가 없고 무난한 와인 느낌. 포도 맛이나 떫은 느낌은 약한 편. 글라스 1,000엔.",
    },
  },
  // 10/1 오텀페스트 와인 부스의 '숙성 와인' 시음 세트(각 60ml 3종, 2,000엔). 가격은 3등분했다.
  {
    regionSlug: "yoichi",
    producer: {
      slug: "yoichi-winery",
      nameKo: "요이치 와이너리",
      nameLocal: "Yoichi Winery (余市ワイナリー)",
    },
    wine: {
      slug: "yoichi-winery-tarujuku-zweigeltrebe",
      nameKo: "오크 숙성 츠바이겔트레베",
      nameLocal: "Tarujuku Zweigeltrebe (樽熟ツヴァイゲルトレーベ)",
      type: "red",
    },
    grapeSlugs: [{ slug: "zweigelt", percent: 100 }],
    tasting: {
      drankOn: "2026-10-01",
      purchasedOn: "2026-10-01",
      purchasePrice: 5740,
      purchasePlace: "삿포로 오텀페스트",
      memo: "날카롭고 공격적인 느낌. 산미가 있고 알코올도 높게 느껴졌다. 숙성 와인 시음 세트(각 60ml 3종, 2,000엔)의 첫 잔.",
    },
  },
  {
    regionSlug: "hokkaido",
    producer: {
      slug: "otobe-winery",
      nameKo: "오토베 와이너리",
      nameLocal: "Otobe Winery (乙部ワイナリー)",
    },
    wine: {
      slug: "otobe-winery-yama-sauvignon-tarujukusei",
      nameKo: "야마 소비뇽 오크 숙성",
      nameLocal: "Yama Sauvignon Tarujukusei (ヤマソービニヨン 樽熟成)",
      type: "red",
    },
    grapeSlugs: [{ slug: "yama-sauvignon", percent: 100 }],
    tasting: {
      drankOn: "2026-10-01",
      purchasedOn: "2026-10-01",
      purchasePrice: 5740,
      purchasePlace: "삿포로 오텀페스트",
      memo: "산미가 있는데 부드럽고 조화로운 느낌. 숙성 와인 시음 세트(각 60ml 3종, 2,000엔)의 둘째 잔.",
    },
  },
  {
    regionSlug: "hokkaido",
    producer: {
      slug: "hakkenzan-winery",
      nameKo: "핫켄잔 와이너리",
      nameLocal: "Hakkenzan Winery (八剣山ワイナリー)",
    },
    wine: {
      slug: "hakkenzan-winery-kyoko",
      nameKo: "교코",
      nameLocal: "Kyōkō (峡紅)",
      type: "red",
    },
    // 메뉴판에 '아르모 누아르 주체'라고만 적혀 있어 비율은 비워 둔다.
    grapeSlugs: [{ slug: "armo-noir" }],
    tasting: {
      drankOn: "2026-10-01",
      purchasedOn: "2026-10-01",
      purchasePrice: 5740,
      purchasePlace: "삿포로 오텀페스트",
      memo: "셋 중 가장 밝은 색. 포도주스 같은 맛. 숙성 와인 시음 세트(각 60ml 3종, 2,000엔)의 셋째 잔.",
    },
  },
  {
    regionSlug: "barossa-valley",
    producer: { slug: "two-hands", nameKo: "투핸즈", nameLocal: "Two Hands Wines" },
    wine: {
      slug: "two-hands-gnarly-dudes-shiraz",
      nameKo: "투핸즈 낼리 듀즈 쉬라즈",
      nameLocal: "Two Hands Gnarly Dudes Shiraz",
      type: "red",
    },
    grapeSlugs: [{ slug: "쉬라즈", percent: 100 }],
    tasting: {
      drankOn: "2026-10-16",
      purchasedOn: "2026-10-15",
      purchasePrice: 44800,
      purchasePlace: "GS25 잠실스타점",
      memo: "2022 빈티지.",
    },
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

    // 앱(/wine/new)에서 먼저 만든 와인은 산지가 나라 단위이고, 생산자는 한국어 이름
    // slug 에 원어 이름이 없는 행으로 따로 생겨 있다. 아래 upsert 전에 시드 slug 로
    // 옮겨 두지 않으면 생산자가 둘로 갈라지고 산지는 나라에 머문다.
    const existing = await db.wine.findUnique({
      where: { slug: e.wine.slug },
      select: {
        id: true,
        type: true,
        abv: true,
        classification: true,
        regionId: true,
        producer: { select: { id: true, slug: true, nameLocal: true } },
      },
    });
    const appProducer =
      existing?.producer &&
      existing.producer.slug !== e.producer.slug &&
      existing.producer.nameLocal == null
        ? existing.producer
        : null;
    if (appProducer) {
      const taken = await db.producer.findUnique({
        where: { slug: e.producer.slug },
        select: { id: true },
      });
      if (!taken) {
        await db.producer.update({
          where: { id: appProducer.id },
          data: { slug: e.producer.slug, nameKo: e.producer.nameKo, regionId: region.id },
        });
        console.log(`~ 생산자 정리: ${appProducer.slug} → ${e.producer.slug}`);
      }
    }
    // 더 자세한 산지로만 옮긴다(지금 산지가 시드 산지의 상위일 때). 반대로 옮기면
    // 이미 세부 산지가 잡힌 와인이 나라 단위로 되돌아간다.
    let moveRegion = existing != null && existing.regionId !== region.id;
    if (moveRegion && existing?.regionId != null) {
      let cur = region.parentId;
      moveRegion = false;
      while (cur) {
        if (cur === existing.regionId) {
          moveRegion = true;
          break;
        }
        const p = await db.region.findUnique({ where: { id: cur }, select: { parentId: true } });
        cur = p?.parentId ?? null;
      }
    }

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
      // 단 abv·classification 은 앱에서도 넣을 수 있어, 시드가 비워 두면 있던 값을 둔다.
      update: {
        nameLocal: e.wine.nameLocal,
        abv: d.abv ?? existing?.abv ?? null,
        notesKo: d.notesKo ?? null,
        classification: e.wine.classification ?? existing?.classification ?? null,
        ...(existing?.type == null ? { type: e.wine.type } : {}),
        ...(appProducer ? { producerId: producer.id } : {}),
        ...(moveRegion ? { regionId: region.id } : {}),
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

    if (moveRegion) console.log(`~ 산지 정리: ${e.wine.nameLocal} → ${e.regionSlug}`);

    // 생산자가 이미 있던 시드 생산자로 합쳐졌으면, 앱이 만든 빈 생산자는 지운다.
    if (appProducer && appProducer.id !== producer.id) {
      const left = await db.wine.count({ where: { producerId: appProducer.id } });
      if (left === 0) await db.producer.delete({ where: { id: appProducer.id } });
      console.log(`~ 생산자 합침: ${appProducer.slug} → ${e.producer.slug}`);
    }

    if (!e.tasting) {
      console.log(`~ 보강: ${e.wine.nameLocal}`);
      continue;
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
      const fill: { purchasePlace?: string | null; drankOn?: Date | null; bodyText?: string } = {};
      const place = e.tasting.purchasePlace ?? null;
      if (dup.purchasePlace == null && place != null) fill.purchasePlace = place;
      if (dup.drankOn == null && drankOn != null) fill.drankOn = drankOn;
      if (dup.bodyText == null && e.tasting.memo != null) fill.bodyText = e.tasting.memo;
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
        bodyText: e.tasting.memo ?? null,
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
