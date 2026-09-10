import type { WineInput } from "@/features/wine/wine-schema";
import { db } from "@/lib/db";

// 새 와인을 만든다. 국가·생산자는 이름으로 find-or-create,
// 품종은 원본 문자열(blendRaw)로만 보관한다(구조화는 시드/후속 편집에서).

function slugifyBase(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "wine";
}

/** 같은 슬러그가 있으면 -2, -3을 붙여 고유하게 만든다. */
async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const root = slugifyBase(base);
  let slug = root;
  let n = 2;
  while (await exists(slug)) {
    slug = `${root}-${n}`;
    n++;
  }
  return slug;
}

async function ensureCountryRegion(country: string): Promise<string> {
  const found = await db.region.findFirst({
    where: { nameKo: country, level: "country" },
    select: { id: true },
  });
  if (found) return found.id;
  const slug = await uniqueSlug(
    country,
    async (s) => (await db.region.findUnique({ where: { slug: s }, select: { id: true } })) != null
  );
  const created = await db.region.create({
    data: { slug, nameKo: country, country, level: "country" },
  });
  return created.id;
}

async function ensureProducer(name: string, regionId: string | null): Promise<string> {
  const found = await db.producer.findFirst({ where: { nameKo: name }, select: { id: true } });
  if (found) return found.id;
  const slug = await uniqueSlug(
    name,
    async (s) =>
      (await db.producer.findUnique({ where: { slug: s }, select: { id: true } })) != null
  );
  const created = await db.producer.create({ data: { slug, nameKo: name, regionId } });
  return created.id;
}

export async function createWine(input: WineInput): Promise<{ id: string }> {
  const regionId = input.country ? await ensureCountryRegion(input.country) : null;
  const producerId = input.producer ? await ensureProducer(input.producer, regionId) : null;
  const slug = await uniqueSlug(
    input.nameLocal ?? input.nameKo,
    async (s) => (await db.wine.findUnique({ where: { slug: s }, select: { id: true } })) != null
  );

  const wine = await db.wine.create({
    data: {
      slug,
      nameKo: input.nameKo,
      nameLocal: input.nameLocal ?? null,
      type: input.type ?? null,
      abv: input.abv ?? null,
      classification: input.classification ?? null,
      blendRaw: input.blendRaw ?? null,
      producerId,
      regionId,
    },
  });
  return { id: wine.id };
}

/** 컬러피커로 지정한 색(#rrggbb)을 와인에 저장한다. null 이면 지워 추정색으로 되돌린다. */
export async function updateWineColor(slug: string, colorHex: string | null) {
  await db.wine.update({ where: { slug }, data: { colorHex } });
}
