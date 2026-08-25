// 생산자 짧은 소개 + 공식 홈페이지. 실제 회사에 대한 사실이라 확실히 아는 곳만 담고,
// 애매한 곳은 비워 둔다(설립연도 등도 검증된 것만). 홈페이지는 공식 사이트를 확인해 적었다.
// region-info와 같은 패턴 — DB descriptionKo가 있으면 페이지가 그걸 우선한다.
// 지저분한 시드 이름(공백·대소문자·괄호)에 맞도록 공백을 지우고 소문자로 맞춰 매칭한다.

export interface ProducerDetail {
  desc: string;
  homepage?: string;
}

// 키는 한국어/원어 이름의 일부(정규화 후 includes 매칭). 앞쪽이 먼저 매칭된다.
const PRODUCER_INFO: Record<string, ProducerDetail> = {
  산마르짜노: {
    desc: "1962년 만두리아의 재배농 19명이 세운 뿔리아 협동조합. 프리미티보·네그로아마로에 집중해 진하고 부드러운 남부 레드를 만든다.",
    homepage: "https://sanmarzano.wine",
  },
  콘차이토로: {
    desc: "1883년 설립된 칠레 최대 와이너리. 카시예로 델 디아블로부터 돈 멜초르·알마비바까지, 130여 개국에 수출하는 라틴아메리카 대표 생산자.",
    homepage: "https://conchaytoro.com",
  },
  이기갈: {
    desc: "1946년 암퓌에 자리 잡은 론의 명가. 코트-로티를 세계에 알렸고 라 물린·라 랑돈·라 튀르크 단일 밭 와인으로 유명하다.",
    homepage: "https://www.guigal.com",
  },
  샤또딸보: {
    desc: "생줄리앙의 1855년 4등급 그랑 크뤼. 지롱드 강가 자갈 언덕의 단일 구획에서 나며, 생줄리앙 유일의 화이트 카이유 블랑으로도 알려져 있다.",
    homepage: "https://www.chateau-talbot.com",
  },
  비달플뢰리: {
    desc: "1781년 창업한 론 밸리에서 가장 오래된 와인 하우스. 코트-로티를 중심으로 여러 론 아펠라시옹을 아우르며, 지금은 기갈 가문이 소유한다.",
    homepage: "https://www.vidal-fleury.com",
  },
  폰타나프레다: {
    desc: "1858년 세랄룽가 달바에 세운 바롤로 명가. 이탈리아 왕 비토리오 에마누엘레 2세의 사냥터에서 출발했고, 피에몬테 최대 유기농 와이너리다.",
    homepage: "https://www.fontanafredda.it",
  },
  banfi: {
    desc: "1978년 마리아니 형제가 몬탈치노에 세운 토스카나 와이너리. 브루넬로 디 몬탈치노를 세계에 알린 '브루넬로의 건설자'로 불린다.",
    homepage: "https://www.banfi.it",
  },
  제라르베르트랑: {
    desc: "럭비 선수 출신이 이끄는 랑그독-루시옹의 대표 생산자. 남프랑스 전역의 여러 도멘을 바이오다이나믹으로 운영한다.",
    homepage: "https://www.gerard-bertrand.com",
  },
  뷰마넨: {
    desc: "1935년 시작한 칠레 콜차구아의 가족 와이너리. 프리필록세라 고목에서 나는 말벡과 카르미네르(엘 인시덴테)로 유명하다.",
    homepage: "https://viumanent.cl",
  },
  덕혼: {
    desc: "1976년 댄·마거릿 덕혼 부부가 세운 나파 밸리 와이너리. 메를로를 프리미엄 품종으로 끌어올린 곳으로, 우아한 메를로와 카베르네를 만든다.",
    homepage: "https://www.duckhorn.com",
  },
  패트리셔스: {
    desc: "2000년 케케시 가문이 세운 토카이의 현대적 와이너리. 중력식 양조로 드라이·늦수확·아수 와인을 만든다.",
    homepage: "https://patricius.hu",
  },
  스파이밸리: {
    desc: "말보로 와이하파이 밸리의 가족 와이너리. 인근 정보기지에서 이름을 따왔고, 소비뇽 블랑과 피노 누아로 이름났다.",
    homepage: "https://spyvalleywine.co.nz",
  },
  펄리셔: {
    desc: "1984년 마틴버로에 세운 뉴질랜드 대표 와이너리. 100% 자가 재배로 피노 누아와 샤르도네를 만들며 유기농으로 전환 중이다.",
    homepage: "https://www.palliser.co.nz",
  },
  화이트해븐: {
    desc: "1994년 말보로에 세운 가족 와이너리. 100% 말보로 포도로 만드는 소비뇽 블랑으로 널리 상을 받았다.",
    homepage: "https://whitehaven.co.nz",
  },
  알타비스타: {
    desc: "1998년 프랑스 가문이 멘도사에 세운 와이너리. 고지대 단일 밭 말벡에 집중해 프랑스 기술과 아르헨티나 떼루아를 결합한다.",
    homepage: "https://www.altavistawines.com",
  },
};

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 생산자 이름(한국어·원어)으로 큐레이션 소개를 찾는다. 없으면 null. */
export function producerInfo(
  nameKo: string | null | undefined,
  nameLocal?: string | null
): ProducerDetail | null {
  const hay = `${norm(nameKo ?? "")} ${norm(nameLocal ?? "")}`;
  for (const [key, detail] of Object.entries(PRODUCER_INFO)) {
    if (hay.includes(key)) return detail;
  }
  return null;
}
