// 동적 라우트의 slug 파라미터를 조회에 쓸 수 있는 형태로 정규화한다.
//
// 이 Next 버전은 non-ASCII 세그먼트를 디코딩하지 않고 넘긴다(예: "메를로" →
// "%EB%A9%94%EB%A5%BC%EB%A1%9C"). 그대로 DB slug와 비교하면 어긋나 404가 난다.
// ASCII slug는 이미 디코딩돼 오므로 decodeURIComponent가 무해한 no-op이다.
// 맥/URL 경로에서 섞여 들어올 수 있는 NFD도 NFC로 맞춰 DB(NFC)와 일치시킨다.
export function decodeSlug(raw: string): string {
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // 이미 디코딩됐거나 % 가 escape 가 아닌 경우 — 원본을 그대로 쓴다.
  }
  return decoded.normalize("NFC");
}
