// 나라별 지리 데이터 — 지도가 국가를 가득 채우도록 하는 경계(bbox)와
// 그 나라의 주요 와인 산지 핀. 좌표는 대략값이며 후속 보강 대상.

export interface RegionPin {
  name: string;
  lat: number;
  lng: number;
}

export interface CountryGeo {
  /** [서, 남, 동, 북] 경계. fitBounds로 이 범위가 지도를 채운다. */
  bbox: [number, number, number, number];
  regions: RegionPin[];
}

const COUNTRY_GEO: Record<string, CountryGeo> = {
  프랑스: {
    bbox: [-5.2, 42.3, 8.3, 51.1],
    regions: [
      { name: "보르도", lat: 44.84, lng: -0.58 },
      { name: "부르고뉴", lat: 47.05, lng: 4.83 },
      { name: "샹파뉴", lat: 49.05, lng: 4.05 },
      { name: "루아르", lat: 47.4, lng: 0.5 },
      { name: "론", lat: 44.9, lng: 4.83 },
      { name: "알자스", lat: 48.2, lng: 7.4 },
      { name: "프로방스", lat: 43.5, lng: 6.0 },
      { name: "랑그독", lat: 43.4, lng: 3.2 },
    ],
  },
  이탈리아: {
    bbox: [6.6, 36.6, 18.6, 47.1],
    regions: [
      { name: "토스카나", lat: 43.4, lng: 11.3 },
      { name: "피에몬테", lat: 44.7, lng: 8.0 },
      { name: "베네토", lat: 45.5, lng: 11.5 },
      { name: "뿔리아", lat: 40.8, lng: 17.1 },
      { name: "시칠리아", lat: 37.5, lng: 14.0 },
    ],
  },
  미국: {
    // 미국 와인 산지는 전부 서부(캘리포니아·오리건)라 대륙 전체 대신 서부 해안으로
    // 좁혀 산지 경계가 또렷이 보이게 한다.
    bbox: [-125, 33, -116, 46.5],
    regions: [
      { name: "나파 밸리", lat: 38.5, lng: -122.3 },
      { name: "소노마", lat: 38.5, lng: -122.9 },
      { name: "몬테레이", lat: 36.2, lng: -121.3 },
      { name: "파소 로블스", lat: 35.6, lng: -120.7 },
      { name: "윌래밋 밸리", lat: 45.2, lng: -123.1 },
    ],
  },
  칠레: {
    bbox: [-75.7, -46.0, -66.4, -17.5],
    regions: [
      { name: "마이포 밸리", lat: -33.7, lng: -70.8 },
      { name: "콜차구아 밸리", lat: -34.6, lng: -71.2 },
      { name: "카차포알 밸리", lat: -34.2, lng: -70.7 },
      { name: "카사블랑카 밸리", lat: -33.3, lng: -71.4 },
    ],
  },
  아르헨티나: {
    bbox: [-73.6, -52.0, -53.6, -21.8],
    regions: [
      { name: "멘도사", lat: -33.0, lng: -68.8 },
      { name: "살타", lat: -25.4, lng: -65.9 },
      { name: "파타고니아", lat: -39.0, lng: -67.7 },
    ],
  },
  뉴질랜드: {
    bbox: [166.4, -47.3, 178.6, -34.4],
    regions: [
      { name: "말보로", lat: -41.5, lng: 173.9 },
      { name: "센트럴 오타고", lat: -45.0, lng: 169.2 },
      { name: "혹스 베이", lat: -39.6, lng: 176.8 },
      { name: "마틴버로", lat: -41.2, lng: 175.5 },
    ],
  },
  독일: {
    bbox: [5.9, 47.3, 15.0, 55.1],
    regions: [
      { name: "모젤", lat: 49.9, lng: 7.0 },
      { name: "라인가우", lat: 50.0, lng: 8.0 },
      { name: "팔츠", lat: 49.3, lng: 8.2 },
    ],
  },
  헝가리: {
    bbox: [16.1, 45.7, 22.9, 48.6],
    regions: [
      { name: "토카이", lat: 48.1, lng: 21.4 },
      { name: "에게르", lat: 47.9, lng: 20.4 },
    ],
  },
  남아프리카공화국: {
    bbox: [16.4, -35.0, 33.0, -22.1],
    regions: [
      { name: "스텔렌보스", lat: -33.9, lng: 18.9 },
      { name: "팔", lat: -33.7, lng: 19.0 },
      { name: "콘스탄시아", lat: -34.0, lng: 18.4 },
    ],
  },
  호주: {
    bbox: [113.0, -39.2, 154.0, -20.0],
    regions: [
      { name: "바로사 밸리", lat: -34.5, lng: 138.9 },
      { name: "쿠나와라", lat: -37.3, lng: 140.8 },
      { name: "야라 밸리", lat: -37.7, lng: 145.5 },
      { name: "마가렛 리버", lat: -33.9, lng: 115.1 },
      { name: "패더웨이", lat: -36.6, lng: 140.5 },
    ],
  },
};

export function countryGeo(country: string | null | undefined): CountryGeo | null {
  if (!country) return null;
  return COUNTRY_GEO[country] ?? null;
}

/** 전세계 탐험 지도용 — 와인 생산국 전체를 이름·지리와 함께 돌려준다. */
export function allCountries(): { country: string; geo: CountryGeo }[] {
  return Object.entries(COUNTRY_GEO).map(([country, geo]) => ({ country, geo }));
}
