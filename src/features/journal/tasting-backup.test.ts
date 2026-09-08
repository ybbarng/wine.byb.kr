import { describe, expect, it } from "vitest";
import { serializeBackup, type TastingBackupInput, toBackupRows } from "./tasting-backup";

// 백업 파일은 "같은 데이터면 항상 같은 파일"이어야 한다. 아니면 내용이 안 바뀐 날에도
// diff 가 생겨 헛커밋이 쌓이고, 진짜 변경을 알아보기 어려워진다.

const note = (o: Partial<TastingBackupInput> & { id: string }): TastingBackupInput => ({
  wine: { slug: "muga-reserva" },
  vintageYear: null,
  drankOn: null,
  purchasedOn: null,
  purchasePrice: null,
  purchaseCurrency: "KRW",
  purchasePlace: null,
  rating: null,
  repurchase: null,
  value: null,
  colorHex: null,
  aromasConfirmed: null,
  flavorFelt: null,
  bodyText: null,
  foodPaired: null,
  photos: null,
  owner: "admin",
  isPublic: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...o,
});

describe("toBackupRows — 백업 줄 만들기", () => {
  it("와인을 id 가 아니라 slug 로 참조한다", () => {
    // id 는 DB를 다시 만들면 바뀌지만 slug 는 시드가 보장하는 안정된 키다.
    const [row] = toBackupRows([note({ id: "n1", wine: { slug: "pesquera-crianza" } })]);
    expect(row.wineSlug).toBe("pesquera-crianza");
    expect(row).not.toHaveProperty("wineId");
  });

  it("날짜는 YYYY-MM-DD 로 적는다", () => {
    const [row] = toBackupRows([note({ id: "n1", drankOn: new Date("2026-09-04T00:00:00.000Z") })]);
    expect(row.drankOn).toBe("2026-09-04");
  });

  it("마신 날 → 만든 시각 → id 순으로 정렬한다", () => {
    const rows = toBackupRows([
      note({ id: "c", drankOn: new Date("2026-03-01T00:00:00.000Z") }),
      note({ id: "a", drankOn: new Date("2026-01-01T00:00:00.000Z") }),
      note({ id: "b", drankOn: new Date("2026-02-01T00:00:00.000Z") }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("아직 안 마신 기록(마신 날 없음)은 뒤로 보낸다", () => {
    const rows = toBackupRows([
      note({ id: "unopened" }),
      note({ id: "drunk", drankOn: new Date("2026-01-01T00:00:00.000Z") }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["drunk", "unopened"]);
  });

  it("같은 날 마신 기록은 만든 시각·id 로 갈라 순서가 흔들리지 않는다", () => {
    const day = new Date("2026-05-05T00:00:00.000Z");
    const rows = toBackupRows([
      note({ id: "z", drankOn: day, createdAt: new Date("2026-05-05T10:00:00.000Z") }),
      note({ id: "a", drankOn: day, createdAt: new Date("2026-05-05T09:00:00.000Z") }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a", "z"]);
  });

  it("입력 순서가 달라도 결과 파일은 같다(헛커밋 방지)", () => {
    const a = note({ id: "a", drankOn: new Date("2026-01-01T00:00:00.000Z") });
    const b = note({ id: "b", drankOn: new Date("2026-02-01T00:00:00.000Z") });
    expect(serializeBackup(toBackupRows([a, b]))).toBe(serializeBackup(toBackupRows([b, a])));
  });

  it("내보낸 시각처럼 매번 바뀌는 값을 넣지 않는다", () => {
    const rows = toBackupRows([note({ id: "n1" })]);
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain("exportedAt");
    // 같은 입력이면 몇 번을 돌려도 완전히 같은 문자열이어야 한다.
    expect(serializeBackup(rows)).toBe(serializeBackup(toBackupRows([note({ id: "n1" })])));
  });
});

describe("serializeBackup — 파일 문자열", () => {
  it("보기 좋게 들여쓰고 줄바꿈으로 끝낸다", () => {
    const out = serializeBackup(toBackupRows([note({ id: "n1" })]));
    expect(out.endsWith("\n")).toBe(true);
    expect(out).toContain('\n  {\n    "id": "n1"');
  });
});
