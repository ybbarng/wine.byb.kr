// API 라우트의 **연결**을 확인한다.
//
// 왜 필요한가: 순수 로직(스키마·정렬·검색 조립)은 각자 테스트가 있는데, 그걸 이어 붙이는
// 라우트만 아무도 안 봤다. 여기서 나는 사고는 조용하다 — 편집 저장이 손대지 않은 칸을
// null 로 지워 시음 기록이 사라진 적이 있고(buildTastingNoteUpdate 가 그 답), 새 라우트에
// verifyAdmin 을 빠뜨리면 아무 에러 없이 그냥 열린다.
//
// DB 와 mutations 는 가짜로 둔다. 여기서 볼 것은 "어떤 조건에서 무엇을 부르고 무엇을
// 돌려주는가"이지 Prisma 가 아니다. 비밀번호 검증 자체는 auth.test.ts·rate-limit.test.ts 가
// 본다 — 여기서는 라우트가 그 결과를 **그대로 돌려주는지**만 본다.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  tastingNote: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  wine: { findUnique: vi.fn(), findMany: vi.fn() },
  priceObservation: { create: vi.fn() },
  region: { findMany: vi.fn() },
  grape: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ db }));

const mutations = vi.hoisted(() => ({
  createWine: vi.fn(),
  updateWineColor: vi.fn(),
}));
vi.mock("@/features/wine/mutations", () => mutations);

/** 인증 성공/실패를 시험마다 갈아 끼운다. */
const auth = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/auth", async () => {
  const { NextResponse } = await import("next/server");
  return {
    verifyAdmin: () =>
      auth.ok
        ? { success: true }
        : {
            success: false,
            response: NextResponse.json(
              { error: "비밀번호가 올바르지 않습니다." },
              { status: 401 }
            ),
          },
  };
});

import { NextRequest } from "next/server";
import { POST as verifyAdminRoute } from "./admin/verify/route";
import { GET as search } from "./search/route";
import { DELETE as deleteNote, PATCH as patchNote } from "./tasting-notes/[id]/route";
import { POST as createNote } from "./tasting-notes/route";
import { POST as setColor } from "./wines/color/route";
import { POST as createWineRoute } from "./wines/route";

function req(path: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const noteCtx = { params: Promise.resolve({ id: "note-1" }) };

/** 최소한으로 스키마를 통과하는 시음 기록 본문. */
const validNote = { wineId: "wine-1", drankOn: "2026-09-07" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.ok = true;
  db.wine.findUnique.mockResolvedValue({ id: "wine-1" });
  db.tastingNote.findUnique.mockResolvedValue({ id: "note-1" });
  db.tastingNote.create.mockResolvedValue({ id: "note-1" });
  db.tastingNote.update.mockResolvedValue({ id: "note-1" });
  db.tastingNote.delete.mockResolvedValue({ id: "note-1" });
});

describe("편집 라우트는 인증 없이 통과시키지 않는다", () => {
  // 라우트를 새로 만들 때 verifyAdmin 을 빠뜨려도 아무 에러가 안 난다 — 그냥 열린다.
  const guarded: [string, () => Promise<Response>][] = [
    ["POST /api/tasting-notes", () => createNote(req("/api/tasting-notes", validNote))],
    ["PATCH /api/tasting-notes/[id]", () => patchNote(req("/api/x", validNote), noteCtx)],
    ["DELETE /api/tasting-notes/[id]", () => deleteNote(req("/api/x"), noteCtx)],
    ["POST /api/wines", () => createWineRoute(req("/api/wines", { nameKo: "테스트" }))],
    ["POST /api/wines/color", () => setColor(req("/api/wines/color", { slug: "a" }))],
    ["POST /api/admin/verify", () => verifyAdminRoute(req("/api/admin/verify", {}))],
  ];

  for (const [name, call] of guarded) {
    it(`${name} — 인증이 막으면 그 응답을 그대로 돌려준다`, async () => {
      auth.ok = false;
      const res = await call();
      expect(res.status).toBe(401);
    });
  }

  it("인증이 막히면 DB 도 mutations 도 건드리지 않는다", async () => {
    auth.ok = false;
    await createNote(req("/api/tasting-notes", validNote));
    await patchNote(req("/api/x", validNote), noteCtx);
    await deleteNote(req("/api/x"), noteCtx);
    await setColor(req("/api/wines/color", { slug: "a", colorHex: "#aabbcc" }));

    expect(db.tastingNote.create).not.toHaveBeenCalled();
    expect(db.tastingNote.update).not.toHaveBeenCalled();
    expect(db.tastingNote.delete).not.toHaveBeenCalled();
    expect(db.tastingNote.findUnique).not.toHaveBeenCalled();
    expect(mutations.updateWineColor).not.toHaveBeenCalled();
  });

  it("바꾸는 메서드를 내보내는 라우트는 전부 verifyAdmin 을 부른다", () => {
    // 위 목록은 손으로 적은 것이라, 라우트를 새로 만들면 아무도 안 잡는다. 파일을 훑어
    // "바꾸는 메서드가 있는데 verifyAdmin 이 없는" 라우트를 찾는다. 일부러 열어 둘
    // 라우트가 생기면 그때 여기서 한 번 멈추고 예외로 적는다(조용히 열리지 않게).
    const dir = join(process.cwd(), "src/app/api");
    const routes = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) =>
      f.endsWith("route.ts")
    );
    expect(routes.length).toBeGreaterThan(0);

    const unguarded = routes.filter((f) => {
      const src = readFileSync(join(dir, f), "utf8");
      const mutates = /export async function (POST|PATCH|PUT|DELETE)\b/.test(src);
      return mutates && !src.includes("verifyAdmin");
    });
    expect(unguarded, `인증 없이 바꾸는 라우트: ${unguarded.join(", ")}`).toEqual([]);
  });
});

describe("POST /api/tasting-notes — 새 기록", () => {
  it("입력이 틀리면 400 이고 아무것도 만들지 않는다", async () => {
    const res = await createNote(req("/api/tasting-notes", { wineId: "wine-1", rating: 9 }));
    expect(res.status).toBe(400);
    expect(db.tastingNote.create).not.toHaveBeenCalled();
  });

  it("본문이 JSON 이 아니어도 500 이 아니라 400 으로 돌려준다", async () => {
    const bad = new NextRequest("http://localhost/api/tasting-notes", {
      method: "POST",
      body: "깨진 JSON",
    });
    expect((await createNote(bad)).status).toBe(400);
  });

  it("없는 와인이면 400 — 주인 없는 기록을 만들지 않는다", async () => {
    db.wine.findUnique.mockResolvedValue(null);
    const res = await createNote(req("/api/tasting-notes", validNote));
    expect(res.status).toBe(400);
    expect(db.tastingNote.create).not.toHaveBeenCalled();
  });

  it("만들고 201 과 id 를 준다", async () => {
    const res = await createNote(req("/api/tasting-notes", validNote));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "note-1" });
  });

  it("구매가가 있으면 시세 관측치도 한 건 남긴다", async () => {
    await createNote(
      req("/api/tasting-notes", {
        ...validNote,
        purchasedOn: "2026-09-05",
        purchasePrice: 41700,
        vintageYear: 2020,
      })
    );
    expect(db.priceObservation.create).toHaveBeenCalledWith({
      data: {
        wineId: "wine-1",
        vintageYear: 2020,
        price: 41700,
        source: "purchase",
        observedOn: new Date("2026-09-05T00:00:00.000Z"),
      },
    });
  });

  it("구매일이 없으면 시음일을 관측일로 쓴다", async () => {
    await createNote(req("/api/tasting-notes", { ...validNote, purchasePrice: 10000 }));
    expect(db.priceObservation.create.mock.calls[0][0].data.observedOn).toEqual(
      new Date("2026-09-07T00:00:00.000Z")
    );
  });

  it("구매가가 없으면 시세 관측치를 남기지 않는다 — 값 없는 관측이 시세를 흔든다", async () => {
    await createNote(req("/api/tasting-notes", validNote));
    expect(db.priceObservation.create).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/tasting-notes/[id] — 편집은 온 칸만 바꾼다", () => {
  it("없는 기록이면 404", async () => {
    db.tastingNote.findUnique.mockResolvedValue(null);
    const res = await patchNote(req("/api/x", validNote), noteCtx);
    expect(res.status).toBe(404);
    expect(db.tastingNote.update).not.toHaveBeenCalled();
  });

  it("보내지 않은 칸은 갱신 대상에 아예 없다 — 이게 데이터 유실을 막는다", async () => {
    // 예전에 여기서 기록이 사라졌다: 편집 저장이 모든 칸을 한 번에 써서, 화면에 없던
    // 칸까지 null 로 덮었다. update 에 넘기는 data 가 부분 갱신인지를 확인한다 —
    // 칸을 하나라도 더 얹으면(= 안 보낸 칸을 쓰면) 여기서 걸린다.
    await patchNote(req("/api/x", { wineId: "wine-1", rating: 4 }), noteCtx);

    const data = db.tastingNote.update.mock.calls[0][0].data;
    expect(data).toEqual({ wineId: "wine-1", rating: 4 });
    expect(Object.hasOwn(data, "bodyText")).toBe(false);
    expect(Object.hasOwn(data, "colorHex")).toBe(false);
  });

  it("칸을 빈 값으로 보내면 그때는 지운다 — 명시적으로 비운 것", async () => {
    await patchNote(req("/api/x", { wineId: "wine-1", bodyText: "" }), noteCtx);
    expect(db.tastingNote.update.mock.calls[0][0].data).toEqual({
      wineId: "wine-1",
      bodyText: null,
    });
  });

  it("와인을 바꾸는 요청이면 그 와인이 있는지 확인한다", async () => {
    db.wine.findUnique.mockResolvedValue(null);
    const res = await patchNote(req("/api/x", { wineId: "없는와인" }), noteCtx);
    expect(res.status).toBe(400);
    expect(db.tastingNote.update).not.toHaveBeenCalled();
  });

  it("가격을 고쳐도 시세 관측치는 새로 쌓지 않는다 — 시세는 별도 이력", async () => {
    await patchNote(req("/api/x", { wineId: "wine-1", purchasePrice: 50000 }), noteCtx);
    expect(db.priceObservation.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/tasting-notes/[id]", () => {
  it("이미 없는 기록을 지워도 성공으로 끝낸다(멱등)", async () => {
    db.tastingNote.delete.mockRejectedValue(new Error("없음"));
    const res = await deleteNote(req("/api/x"), noteCtx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("POST /api/wines/color — 지정색", () => {
  it("slug 가 없으면 400", async () => {
    expect((await setColor(req("/api/wines/color", { colorHex: "#aabbcc" }))).status).toBe(400);
    expect(mutations.updateWineColor).not.toHaveBeenCalled();
  });

  it("#rrggbb 가 아니면 400", async () => {
    expect((await setColor(req("/api/wines/color", { slug: "a", colorHex: "red" }))).status).toBe(
      400
    );
    expect((await setColor(req("/api/wines/color", { slug: "a", colorHex: "#abc" }))).status).toBe(
      400
    );
    expect(mutations.updateWineColor).not.toHaveBeenCalled();
  });

  it("색을 저장한다", async () => {
    await setColor(req("/api/wines/color", { slug: "chablis", colorHex: "#EEDD99" }));
    expect(mutations.updateWineColor).toHaveBeenCalledWith("chablis", "#EEDD99");
  });

  it("colorHex 를 안 주거나 null 로 주면 추정색으로 되돌린다", async () => {
    await setColor(req("/api/wines/color", { slug: "chablis", colorHex: null }));
    await setColor(req("/api/wines/color", { slug: "chablis" }));
    expect(mutations.updateWineColor).toHaveBeenNthCalledWith(1, "chablis", null);
    expect(mutations.updateWineColor).toHaveBeenNthCalledWith(2, "chablis", null);
  });
});

describe("POST /api/wines — 새 와인", () => {
  it("이름이 없으면 400", async () => {
    const res = await createWineRoute(req("/api/wines", { nameKo: "" }));
    expect(res.status).toBe(400);
    expect(mutations.createWine).not.toHaveBeenCalled();
  });

  it("만들면 201", async () => {
    mutations.createWine.mockResolvedValue({ id: "wine-9" });
    const res = await createWineRoute(req("/api/wines", { nameKo: "샤블리" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "wine-9" });
  });
});

describe("GET /api/search", () => {
  it("검색어가 비면 DB 를 조회하지 않는다", async () => {
    const res = await search(req("/api/search?q=%20%20"));
    expect(await res.json()).toEqual({ results: [] });
    expect(db.wine.findMany).not.toHaveBeenCalled();
  });

  it("산지·품종·와인을 함께 찾는다", async () => {
    db.region.findMany.mockResolvedValue([]);
    db.grape.findMany.mockResolvedValue([]);
    db.wine.findMany.mockResolvedValue([]);
    await search(req("/api/search?q=샤블리"));
    expect(db.region.findMany).toHaveBeenCalled();
    expect(db.grape.findMany).toHaveBeenCalled();
    expect(db.wine.findMany).toHaveBeenCalled();
  });
});
