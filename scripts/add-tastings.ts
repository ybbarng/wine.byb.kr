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
];

// 없으면 만들 품종. GRAPE_ABSORB(wine-glass.ts) 색은 nameKo 로 찾으니 nameKo 를 맞춘다.
const GRAPES: { slug: string; nameKo: string; nameLocal: string; color: string }[] = [
  { slug: "susumaniello", nameKo: "수수마니엘로", nameLocal: "Susumaniello", color: "red" },
  { slug: "tempranillo", nameKo: "템프라니요", nameLocal: "Tempranillo", color: "red" },
  { slug: "chenin-blanc", nameKo: "슈냉 블랑", nameLocal: "Chenin Blanc", color: "white" },
  { slug: "nebbiolo", nameKo: "네비올로", nameLocal: "Nebbiolo", color: "red" },
];

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
    drankOn: string; // YYYY-MM-DD (그 주 금요일)
    purchasedOn: string; // YYYY-MM-DD (픽업/구매일)
    purchasePrice: number;
    purchasePlace: string;
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
      purchasePlace: "GS25",
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
    grapeSlugs: [],
    tasting: {
      drankOn: "2025-09-12",
      purchasedOn: "2025-09-11",
      purchasePrice: 10160,
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      drankOn: "2026-02-06",
      purchasedOn: "2026-02-05",
      purchasePrice: 94200,
      purchasePlace: "GS25",
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
      drankOn: "2026-02-27",
      purchasedOn: "2026-02-27",
      purchasePrice: 47200,
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
    },
  },
  {
    regionSlug: "bourgogne",
    producer: {
      slug: "domaine-vincent-fournier",
      nameKo: "도멘 뱅상 푸르니에",
      nameLocal: "Domaine Vincent Fournier",
    },
    wine: {
      slug: "domaine-vincent-fournier-bourgogne-chardonnay",
      nameKo: "도멘 뱅상 푸르니에 부르고뉴 샤르도네",
      nameLocal: "Domaine Vincent Fournier Bourgogne Chardonnay",
      type: "white",
      classification: "Bourgogne AOC",
    },
    grapeSlugs: [{ slug: "샤르도네", percent: 100 }],
    tasting: {
      drankOn: "2026-08-14",
      purchasedOn: "2026-08-13",
      purchasePrice: 29920,
      purchasePlace: "GS25",
    },
  },
  {
    regionSlug: "anjou",
    producer: {
      slug: "domaine-des-ardillers",
      nameKo: "도멘 데 아르디에",
      nameLocal: "Domaine des Ardillers",
    },
    wine: {
      slug: "domaine-des-ardillers-anjou-blanc",
      nameKo: "도멘 데 아르디에 앙주 블랑 레 쁘띠 갸르",
      nameLocal: "Domaine des Ardillers Anjou Blanc Les Petites Gardes",
      type: "white",
      classification: "Anjou AOC",
    },
    grapeSlugs: [{ slug: "chenin-blanc", percent: 100 }],
    tasting: {
      drankOn: "2026-08-21",
      purchasedOn: "2026-08-18",
      purchasePrice: 27000,
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      purchasePlace: "GS25",
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
      drankOn: "2026-09-04",
      purchasedOn: "2026-08-31",
      purchasePrice: 32720,
      purchasePlace: "GS25",
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

  // 2) 기록.
  for (const e of ENTRIES) {
    const region = await db.region.findUnique({ where: { slug: e.regionSlug } });
    if (!region) throw new Error(`산지 없음: ${e.regionSlug}`);

    const producer = await db.producer.upsert({
      where: { slug: e.producer.slug },
      update: {},
      create: {
        slug: e.producer.slug,
        nameKo: e.producer.nameKo,
        nameLocal: e.producer.nameLocal,
        regionId: region.id,
      },
    });

    const wine = await db.wine.upsert({
      where: { slug: e.wine.slug },
      update: {},
      create: {
        slug: e.wine.slug,
        nameKo: e.wine.nameKo,
        nameLocal: e.wine.nameLocal,
        type: e.wine.type,
        classification: e.wine.classification,
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

    const drankOn = new Date(`${e.tasting.drankOn}T00:00:00.000Z`);
    const dup = await db.tastingNote.findFirst({
      where: { wineId: wine.id, drankOn, purchasePrice: e.tasting.purchasePrice },
    });
    if (dup) {
      console.log(`= 이미 있음: ${e.wine.nameLocal} (${e.tasting.drankOn})`);
      continue;
    }
    await db.tastingNote.create({
      data: {
        wineId: wine.id,
        drankOn,
        purchasedOn: new Date(`${e.tasting.purchasedOn}T00:00:00.000Z`),
        purchasePrice: e.tasting.purchasePrice,
        purchasePlace: e.tasting.purchasePlace,
      },
    });
    console.log(
      `+ 추가: ${e.wine.nameLocal} — 마신날 ${e.tasting.drankOn}, ${e.tasting.purchasePrice}원`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
