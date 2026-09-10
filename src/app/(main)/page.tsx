import WineShowcase from "@/components/WineShowcase";
import { getRotationWines } from "@/features/wine/db/queries";

export const dynamic = "force-dynamic";

// 홈: 상단 검색바 + 중앙 3D 와인잔. 가만히 두면 잔이 저 혼자 스월하고, 이따금
// 다른 와인으로 바뀐다(리듬은 features/glass/rotation.ts).
//
// 순환에 쓸 와인은 여기서 한 번에 다 내려보낸다 — 잔을 바꿀 때마다 요청하면 네트워크가
// 느릴 때 리듬이 끊긴다.
export default async function Home() {
  const wines = await getRotationWines();
  return <WineShowcase wines={wines} />;
}
