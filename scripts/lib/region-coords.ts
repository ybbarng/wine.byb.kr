import { koreanKey } from "./normalize";

// 국가 단위 대략 좌표. 지도 fly-to 목표점으로 쓴다(대표 와인 산지 근처).
// 세부 지역 좌표는 나중에 보강한다.
interface Coord {
  lat: number;
  lng: number;
}

const COUNTRY_COORDS: Record<string, Coord> = {
  이탈리아: { lat: 43.0, lng: 11.5 }, // 토스카나 근처
  프랑스: { lat: 46.6, lng: 2.6 },
  칠레: { lat: -34.6, lng: -70.9 }, // 센트럴 밸리
  아르헨티나: { lat: -33.0, lng: -68.8 }, // 멘도사
  미국: { lat: 38.3, lng: -122.3 }, // 캘리포니아 나파·소노마
  뉴질랜드: { lat: -41.5, lng: 173.9 }, // 말보로
  독일: { lat: 49.9, lng: 7.0 }, // 모젤
  헝가리: { lat: 48.1, lng: 21.4 }, // 토카이
  남아프리카공화국: { lat: -33.9, lng: 18.9 }, // 스텔렌보스
  호주: { lat: -36.9, lng: 140.5 }, // 패더웨이·림스톤코스트
};

const BY_KEY = new Map(Object.entries(COUNTRY_COORDS).map(([k, v]) => [koreanKey(k), v]));

export function countryCoord(country: string): Coord | null {
  return BY_KEY.get(koreanKey(country)) ?? null;
}
