// 건배말 폰트 만들기 — 쓰는 글자만 잘라낸 woff2 를 받아 레포에 넣는다.
//
// 왜 필요한가: 건배말은 그 나라 문자 그대로 쓴다(features/glass/toast.ts). 시스템
// 폰트에 기대면 윈도우에서 두부(□)가 뜰 수 있다 — 윈도우는 문자별 폰트를 "그 언어를
// 쓰는 사람에게만 나중에 까는" 선택 기능으로 돌려놨다. 태국 문자와 한자가 특히 그렇다.
//
// 왜 통째로 싣지 않나: 한자 폰트 하나가 수 MB다. 그런데 우리가 쓰는 글자는 다 합쳐
// 마흔 남짓이라, 구글 폰트의 `text=` 로 그 글자만 잘라 받으면 파일 하나가 1~2KB 다.
//
// 다시 만들어야 할 때: **건배말 문구를 고쳤을 때.** 안 만들면 새 글자가 빠진 채로
// 남아 그 글자만 두부가 된다 — `toast.test.ts` 가 매니페스트와 문구를 맞춰 보며 잡는다.
//
//   npx tsx scripts/build-toast-fonts.ts

import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { SCRIPT_FONTS, toastCharsByScript } from "../src/features/glass/toast";

const OUT_DIR = join(process.cwd(), "src", "app", "fonts", "toast");
const run = promisify(execFile);

/** 구글 폰트는 요청한 브라우저에 맞춰 형식을 바꿔 준다. woff2 를 받으려고 크롬인 척한다. */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** node 의 fetch 가 이 망에서 막히는 일이 있어 curl 로 받는다. */
async function get(url: string, binary: boolean): Promise<string | Uint8Array> {
  const args = ["-sSL", "--fail", "--max-time", "30", "-A", UA, url];
  const { stdout } = await run("curl", args, {
    encoding: binary ? "buffer" : "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return binary ? new Uint8Array(stdout as unknown as Buffer) : (stdout as string);
}

async function fetchSubset(family: string, text: string): Promise<Uint8Array> {
  const url =
    "https://fonts.googleapis.com/css2" +
    `?family=${encodeURIComponent(family)}:wght@400` +
    `&text=${encodeURIComponent(text)}`;
  const css = (await get(url, false)) as string;
  // 잘라낸 폰트는 주소가 `/l/font?kit=…` 꼴이라 확장자로는 못 찾는다. format 을 본다.
  const src = css.match(/src:\s*url\((https:[^)]+)\)\s*format\('woff2'\)/)?.[1];
  if (!src) throw new Error(`${family}: woff2 주소를 못 찾았다\n${css}`);
  return (await get(src, true)) as Uint8Array;
}

async function main() {
  const byScript = toastCharsByScript();
  await mkdir(OUT_DIR, { recursive: true });

  const manifest: Record<string, { family: string; chars: string; bytes: number }> = {};
  for (const [script, chars] of Object.entries(byScript)) {
    const family = SCRIPT_FONTS[script];
    if (!family) throw new Error(`${script}: SCRIPT_FONTS 에 폰트가 없다`);
    const bytes = await fetchSubset(family, chars);
    await writeFile(join(OUT_DIR, `${script}.woff2`), bytes);
    manifest[script] = { family, chars, bytes: bytes.length };
    console.log(`${script.padEnd(9)} ${family.padEnd(20)} ${chars}  ${bytes.length}B`);
  }

  await writeFile(join(OUT_DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const total = Object.values(manifest).reduce((s, m) => s + m.bytes, 0);
  console.log(`\n합계 ${Object.keys(manifest).length}개 ${total}B`);
}

main();
