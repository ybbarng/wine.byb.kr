// 시음 기록 백업 형식 — DB 행 ↔ 저장소에 커밋할 JSON.
// docs/backup.md 참고. 시음 기록은 앱으로만 들어가 서버 DB에만 있는, 다시 만들 수 없는
// 데이터라 git 에 사본을 둔다.
//
// 형식을 고를 때 지킨 것:
// - **와인은 id 가 아니라 slug 로 참조한다.** id(cuid)는 DB를 다시 만들면 바뀌지만
//   slug 는 시드가 보장하는 안정된 키다.
// - **시각을 새로 찍는 필드를 넣지 않는다.** "내보낸 시각" 같은 걸 넣으면 내용이 그대로여도
//   매번 diff 가 생겨 헛커밋이 쌓인다.
// - **정렬을 고정한다.** 같은 데이터면 항상 같은 파일이 나와야 한다(위와 같은 이유).
// - 날짜는 "YYYY-MM-DD"(UTC)로 적어 사람이 읽고 diff 를 알아볼 수 있게 한다.

/** 백업 JSON 한 줄. DB 열 이름을 그대로 쓰되 wineId 만 wineSlug 로 바꾼다. */
export interface TastingBackupRow {
  id: string;
  wineSlug: string;
  vintageYear: number | null;
  drankOn: string | null;
  purchasedOn: string | null;
  purchasePrice: number | null;
  purchaseCurrency: string;
  purchasePlace: string | null;
  rating: number | null;
  repurchase: string | null;
  value: string | null;
  colorHex: string | null;
  aromasConfirmed: string | null;
  flavorFelt: string | null;
  bodyText: string | null;
  foodPaired: string | null;
  photos: string | null;
  owner: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 덤프에 필요한 만큼만 받는다(프리즈마 타입에 묶이지 않게). */
export interface TastingBackupInput {
  id: string;
  wine: { slug: string };
  vintageYear: number | null;
  drankOn: Date | null;
  purchasedOn: Date | null;
  purchasePrice: number | null;
  purchaseCurrency: string;
  purchasePlace: string | null;
  rating: number | null;
  repurchase: string | null;
  value: string | null;
  colorHex: string | null;
  aromasConfirmed: string | null;
  flavorFelt: string | null;
  bodyText: string | null;
  foodPaired: string | null;
  photos: string | null;
  owner: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const dateOnly = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * DB 행들을 백업 JSON 줄로 바꾸고 **정렬을 고정한다**.
 * 마신 날 오름차순(없으면 뒤로) → 만든 시각 → id. 같은 데이터면 항상 같은 결과다.
 */
export function toBackupRows(notes: TastingBackupInput[]): TastingBackupRow[] {
  return notes
    .map(
      (n): TastingBackupRow => ({
        id: n.id,
        wineSlug: n.wine.slug,
        vintageYear: n.vintageYear,
        drankOn: dateOnly(n.drankOn),
        purchasedOn: dateOnly(n.purchasedOn),
        purchasePrice: n.purchasePrice,
        purchaseCurrency: n.purchaseCurrency,
        purchasePlace: n.purchasePlace,
        rating: n.rating,
        repurchase: n.repurchase,
        value: n.value,
        colorHex: n.colorHex,
        aromasConfirmed: n.aromasConfirmed,
        flavorFelt: n.flavorFelt,
        bodyText: n.bodyText,
        foodPaired: n.foodPaired,
        photos: n.photos,
        owner: n.owner,
        isPublic: n.isPublic,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })
    )
    .sort((a, b) => {
      // 마신 날이 없는 기록(아직 안 마신 것)은 뒤로 몰아 둔다.
      if (a.drankOn !== b.drankOn) {
        if (a.drankOn == null) return 1;
        if (b.drankOn == null) return -1;
        return a.drankOn < b.drankOn ? -1 : 1;
      }
      if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** 파일에 쓸 문자열. 끝에 줄바꿈을 둬 diff 가 깔끔하게 나오게 한다. */
export function serializeBackup(rows: TastingBackupRow[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`;
}
