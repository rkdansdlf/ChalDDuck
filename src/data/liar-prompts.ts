/**
 * 라이어 게임의 제시어.
 *
 * ## 왜 `catalog.ts` 에서 뺐는가
 *
 * 라이어 게임이 커지면서(참가자 선택 · 최종 추측 · 리매치) 거기가 금방 관리하기 어려워졌다.
 * 화면 고르기 · 마피아 인원 구성과 섞여 있어 하나를 고칠 때 다른 것을 같이 건드린다.
 * 그래서 **제시어만** 여기에 두고, `catalog.ts` 는 "무엇을 하는지"만 알게 한다.
 *
 * ## 왜 정적 데이터인가
 *
 * 실시간으로 만들지 않는다. 라이어 게임의 마지막은 **제시어를 맞히는 것**이고, 그것은
 * 문자열 비교로 판정해야 한다. 매번 다른 답을 주는 모델을 넣으면 정답 자체가 흔들린다.
 * 정적이면 1) 판정이 순수 비교로 끝나고 2) 사람이 검수할 수 있고 3) 설명이 가능한 단어인지
 * 미리 알 수 있다.
 *
 * ## 무엇을 넣고 뺐는가
 *
 * - **설명 가능한 것만.** 추측할 수 있는 단어는 한 문장으로 우회할 수 있어야 한다.
 *   추상 명사(예: 책임감)는 어떤 문장으로도 우회되지 않아 게임이 성립하지 않는다.
 * - **같은 단어를 두 번 넣지 않는다.** 두 번 넣으면 "설명하면 두 정답이 동시에 맞는다"가
 *   되어 판정이 뒤집힌다. `npm test` 가 같은 `word` 가 두 번 나오면 실패한다.
 * - **팀플·성격을 연상시키는 단어는 기본에서 뺐다.** 예전 `팀플과 성격` 주제의
 *   `무임승차` · `마감직전` 같은 말은, 친목의 자리를 실제 갈등으로 만든다.
 *   그런 단어는 **선택 팩으로 따로 두고 기본에는 넣지 않는다.**
 *
 * 11개 주제 · 276개. 수를 늘리기보다 설명 가능한지 지키는 편이 낫다.
 */
export type LiarPrompt = {
  /** DB에 넣지 않는다. 같은 단어를 두 번 쓰지 않게 하는 안정적인 이름일 뿐이다. */
  id: string;
  /** 주제. 한 판에 하나만 고르고 화면에 "주제 ○○"로 보여 준다. */
  category: string;
  /** 정답. */
  word: string;
  /**
   * 라이어가 얼마나 힘들어야 하는지.
   * - `easy`   두세 마디면 우회된다. 처음 하는 사람에게도 잡힌다.
   * - `normal` 한두 문장짜리 우회가 필요하다.
   * - `hard`   말꼬리를 살짝 바꿔 말해야 한다.
   *
   * 지금은 `normal` 이 가장 많다. 화면에서 난이도를 고르게 되면 이 값을 쓴다.
   */
  difficulty: "easy" | "normal" | "hard";
  /** 정답으로 인정할 또 쓴 표기. 오타 · 띄어쓰기 차이를 넓게 잡아 준다. */
  aliases?: string[];
};

const E = "easy" as const;
const N = "normal" as const;
const H = "hard" as const;

/**
 * 기본 팩. 화면과 테스트가 함께 쓰는 단 하나의 출처다.
 *
 * 주제를 늘릴 때는 **여기만** 고친다. 같은 `word` 를 두 번 쓰지 말 것 — 중복되면
 * "설명하면 여러 정답이 맞는다"가 되어 게임이 성립하지 않는다.
 */
export const LIAR_PROMPTS: LiarPrompt[] = [
  /* 음식 — 28 */
  { id: "tteokbokki", category: "음식", word: "떡볶이", difficulty: E, aliases: ["떡보끼", "떡복기"] },
  { id: "kimchijjigae", category: "음식", word: "김치찌개", difficulty: E },
  { id: "maratang", category: "음식", word: "마라탕", difficulty: E },
  { id: "chopsue", category: "음식", word: "초밥", difficulty: E },
  { id: "samgyeopsal", category: "음식", word: "삼겹살", difficulty: E },
  { id: "jajangmyeon", category: "음식", word: "짜장면", difficulty: E },
  { id: "bibimbap", category: "음식", word: "비빔밥", difficulty: E },
  { id: "chicken", category: "음식", word: "치킨", difficulty: E },
  { id: "ramyeon", category: "음식", word: "라면", difficulty: E, aliases: ["라면사리"] },
  { id: "pasta", category: "음식", word: "파스타", difficulty: E },
  { id: "bulgogi", category: "음식", word: "불고기", difficulty: E },
  { id: "galbijjim", category: "음식", word: "갈비찜", difficulty: N },
  { id: "sundubu", category: "음식", word: "순두부", difficulty: N },
  { id: "doenjangjjigae", category: "음식", word: "된장찌개", difficulty: N },
  { id: "kimchi", category: "음식", word: "김치", difficulty: E },
  { id: "namul", category: "음식", word: "나물", difficulty: N },
  { id: "gyeolmari", category: "음식", word: "계란말이", difficulty: E },
  { id: "gimbap", category: "음식", word: "김밥", difficulty: E },
  { id: "deopbap", category: "음식", word: "덮밥", difficulty: N },
  { id: "udon", category: "음식", word: "우동", difficulty: E },
  { id: "mandu", category: "음식", word: "만두", difficulty: E },
  { id: "tangsuyuk", category: "음식", word: "탕수육", difficulty: N },
  { id: "haemulpajeon", category: "음식", word: "해물파전", difficulty: N },
  { id: "sogalbi", category: "음식", word: "소갈비", difficulty: N },
  { id: "dalkgalbi", category: "음식", word: "닭갈비", difficulty: N },
  { id: "sundae", category: "음식", word: "순대", difficulty: N },
  { id: "eomuk", category: "음식", word: "어묵", difficulty: H },
  { id: "bokkeumbap", category: "음식", word: "볶음밥", difficulty: N },

  /* 음료 — 24 */
  { id: "americano", category: "음료", word: "아메리카노", difficulty: E, aliases: ["아아"] },
  { id: "cappuccino", category: "음료", word: "카푸치노", difficulty: N },
  { id: "latte", category: "음료", word: "라떼", difficulty: E },
  { id: "mocha", category: "음료", word: "모카", difficulty: N },
  { id: "espresso", category: "음료", word: "에스프레소", difficulty: N },
  { id: "matcha", category: "음료", word: "말차라떼", difficulty: N, aliases: ["그린라떼", "말차"] },
  { id: "oreoshake", category: "음료", word: "오레오셰이크", difficulty: N, aliases: ["오레오"] },
  { id: "taromilk", category: "음료", word: "타로밀크티", difficulty: N, aliases: ["타로"] },
  { id: "bubbletea", category: "음료", word: "버블티", difficulty: E, aliases: ["펄스"] },
  { id: "milktea", category: "음료", word: "밀크티", difficulty: E },
  { id: "lemonttea", category: "음료", word: "레몬티", difficulty: E },
  { id: "strawberrymilk", category: "음료", word: "딸기우유", difficulty: N },
  { id: "bananamilk", category: "음료", word: "바나나우유", difficulty: N },
  { id: "coke", category: "음료", word: "코카콜라", difficulty: E },
  { id: "sprite", category: "음료", word: "사이다", difficulty: E },
  { id: "pocarisw", category: "음료", word: "포카리 스웗트", difficulty: E, aliases: ["포카리"] },
  { id: "redbull", category: "음료", word: "레드불", difficulty: E },
  { id: "brownricetea", category: "음료", word: "현미차", difficulty: N },
  { id: "yujatea", category: "음료", word: "유자차", difficulty: N },
  { id: "ginsengtea", category: "음료", word: "인삼차", difficulty: N },
  { id: "hotchoco", category: "음료", word: "핫초코", difficulty: E },
  { id: "yogurt", category: "음료", word: "요거트", difficulty: E, aliases: ["요구르트"] },
  { id: "sikhye", category: "음료", word: "식혜", difficulty: H },
  { id: "zerocoke", category: "음료", word: "제로콜라", difficulty: N },

  /* 캠퍼스 — 24 */
  { id: "library", category: "캠퍼스", word: "도서관", difficulty: E },
  { id: "canteen", category: "캠퍼스", word: "학생식당", difficulty: E },
  { id: "classroom", category: "캠퍼스", word: "강의실", difficulty: E },
  { id: "clubroom", category: "캠퍼스", word: "동아리방", difficulty: N },
  { id: "dormitory", category: "캠퍼스", word: "기숙사", difficulty: E },
  { id: "playground", category: "캠퍼스", word: "운동장", difficulty: E },
  { id: "conveniencestore", category: "캠퍼스", word: "편의점", difficulty: E },
  { id: "laboratory", category: "캠퍼스", word: "실험실", difficulty: N },
  { id: "parkinglot", category: "캠퍼스", word: "주차장", difficulty: E },
  { id: "maingate", category: "캠퍼스", word: "정문", difficulty: E },
  { id: "credit", category: "캠퍼스", word: "학점", difficulty: H },
  { id: "janggi", category: "캠퍼스", word: "장기", difficulty: N, aliases: ["바둑"] },
  { id: "studyroom", category: "캠퍼스", word: "독서실", difficulty: N },
  { id: "auditorium", category: "캠퍼스", word: "강당", difficulty: E },
  { id: "bicycle", category: "캠퍼스", word: "자전거", difficulty: E, aliases: ["자전거 대여소"] },
  { id: "shuttlebus", category: "캠퍼스", word: "셔틀버스", difficulty: N, aliases: ["셔틀"] },
  { id: "studentcard", category: "캠퍼스", word: "학생증", difficulty: E },
  { id: "gathering", category: "캠퍼스", word: "과사", difficulty: N },
  { id: "midterm", category: "캠퍼스", word: "중간고사", difficulty: E, aliases: ["고사"] },
  { id: "presentationprep", category: "캠퍼스", word: "발표준비", difficulty: N },
  { id: "scholarship", category: "캠퍼스", word: "장학금", difficulty: N },
  { id: "major", category: "캠퍼스", word: "전공과", difficulty: N },
  { id: "selfstudy", category: "캠퍼스", word: "야간자율학습", difficulty: H, aliases: ["야자"] },
  { id: "textbook", category: "캠퍼스", word: "교과서", difficulty: N },

  /* 동물 — 30 */
  { id: "cat", category: "동물", word: "고양이", difficulty: E },
  { id: "dog", category: "동물", word: "강아지", difficulty: E },
  { id: "penguin", category: "동물", word: "펭귄", difficulty: E },
  { id: "giraffe", category: "동물", word: "기린", difficulty: E },
  { id: "panda", category: "동물", word: "판다", difficulty: E },
  { id: "elephant", category: "동물", word: "코끼리", difficulty: E },
  { id: "hamster", category: "동물", word: "햄스터", difficulty: E },
  { id: "dolphin", category: "동물", word: "돌고래", difficulty: E },
  { id: "turtle", category: "동물", word: "거북이", difficulty: E },
  { id: "lion", category: "동물", word: "사자", difficulty: E },
  { id: "tiger", category: "동물", word: "호랑이", difficulty: E },
  { id: "rabbit", category: "동물", word: "토끼", difficulty: E },
  { id: "squirrel", category: "동물", word: "다람쥐", difficulty: N },
  { id: "hedgehog", category: "동물", word: "고슴도치", difficulty: N },
  { id: "sloth", category: "동물", word: "슬로트", difficulty: N, aliases: ["느림보"] },
  { id: "otter", category: "동물", word: "수달", difficulty: N },
  { id: "seal", category: "동물", word: "물개", difficulty: N },
  { id: "walrus", category: "동물", word: "바다사자", difficulty: H },
  { id: "duck", category: "동물", word: "오리", difficulty: E },
  { id: "crow", category: "동물", word: "까마귀", difficulty: N },
  { id: "owl", category: "동물", word: "부엉이", difficulty: N },
  { id: "frog", category: "동물", word: "개구리", difficulty: E },
  { id: "lizard", category: "동물", word: "도마뱀", difficulty: N },
  { id: "snake", category: "동물", word: "뱀", difficulty: E },
  { id: "bat", category: "동물", word: "박쥐", difficulty: N },
  { id: "spider", category: "동물", word: "거미", difficulty: N },
  { id: "ant", category: "동물", word: "개미", difficulty: N },
  { id: "bee", category: "동물", word: "꿀벌", difficulty: N },
  { id: "butterfly", category: "동물", word: "나비", difficulty: E },
  { id: "whale", category: "동물", word: "고래", difficulty: N },

  /* 직업 — 24 */
  { id: "firefighter", category: "직업", word: "소방관", difficulty: E },
  { id: "chef", category: "직업", word: "요리사", difficulty: E },
  { id: "doctor", category: "직업", word: "의사", difficulty: E },
  { id: "teacher", category: "직업", word: "선생님", difficulty: E },
  { id: "youtuber", category: "직업", word: "유튜버", difficulty: E },
  { id: "policeofficer", category: "직업", word: "경찰", difficulty: E },
  { id: "journalist", category: "직업", word: "기자", difficulty: N },
  { id: "barista", category: "직업", word: "바리스타", difficulty: N },
  { id: "pilot", category: "직업", word: "파일럿", difficulty: N },
  { id: "designer", category: "직업", word: "디자이너", difficulty: E },
  { id: "developer", category: "직업", word: "개발자", difficulty: E },
  { id: "architect", category: "직업", word: "건축가", difficulty: N },
  { id: "lawyer", category: "직업", word: "변호사", difficulty: N },
  { id: "accountant", category: "직업", word: "회계사", difficulty: N },
  { id: "nurse", category: "직업", word: "간호사", difficulty: E },
  { id: "vet", category: "직업", word: "수의사", difficulty: N },
  { id: "librarian", category: "직업", word: "사서", difficulty: N },
  { id: "actor", category: "직업", word: "배우", difficulty: E },
  { id: "singer", category: "직업", word: "가수", difficulty: E },
  { id: "soldier", category: "직업", word: "군인", difficulty: N },
  { id: "courier", category: "직업", word: "배달부", difficulty: E },
  { id: "farmer", category: "직업", word: "농부", difficulty: N },
  { id: "professor", category: "직업", word: "교수", difficulty: N },
  { id: "electrician", category: "직업", word: "전기기사", difficulty: N },

  /* 장소 — 24 */
  { id: "amusementpark", category: "장소", word: "놀이공원", difficulty: E },
  { id: "cinema", category: "장소", word: "영화관", difficulty: E },
  { id: "sea", category: "장소", word: "바다", difficulty: E },
  { id: "airport", category: "장소", word: "공항", difficulty: E },
  { id: "bathhouse", category: "장소", word: "찜질방", difficulty: N },
  { id: "karaoke", category: "장소", word: "노래방", difficulty: E },
  { id: "hospital", category: "장소", word: "병원", difficulty: E },
  { id: "campground", category: "장소", word: "캠핑장", difficulty: N },
  { id: "pcroom", category: "장소", word: "PC방", difficulty: E },
  { id: "subwaystation", category: "장소", word: "지하철역", difficulty: E },
  { id: "bakery", category: "장소", word: "제과점", difficulty: N, aliases: ["빵집"] },
  { id: "laundry", category: "장소", word: "세탁소", difficulty: N },
  { id: "arcade", category: "장소", word: "오락실", difficulty: N },
  { id: "cafe", category: "장소", word: "카페", difficulty: E },
  { id: "restaurant", category: "장소", word: "식당", difficulty: E },
  { id: "bank", category: "장소", word: "은행", difficulty: E },
  { id: "bookstore", category: "장소", word: "서점", difficulty: N },
  { id: "gym", category: "장소", word: "헬스장", difficulty: E },
  { id: "swimmingpool", category: "장소", word: "수영장", difficulty: E },
  { id: "postoffice", category: "장소", word: "우체국", difficulty: N },
  { id: "barbershop", category: "장소", word: "이발소", difficulty: E },
  { id: "trail", category: "장소", word: "등산로", difficulty: N },
  { id: "market", category: "장소", word: "시장", difficulty: E },

  /* 물건 — 30 */
  { id: "umbrella", category: "물건", word: "우산", difficulty: E },
  { id: "laptop", category: "물건", word: "노트북", difficulty: E },
  { id: "toothbrush", category: "물건", word: "칫솔", difficulty: E },
  { id: "earphone", category: "물건", word: "이어폰", difficulty: E },
  { id: "mirror", category: "물건", word: "거울", difficulty: E },
  { id: "wallet", category: "물건", word: "지갑", difficulty: E },
  { id: "fridge", category: "물건", word: "냉장고", difficulty: E },
  { id: "glasses", category: "물건", word: "안경", difficulty: E },
  { id: "tumbler", category: "물건", word: "텀블러", difficulty: E },
  { id: "powerbank", category: "물건", word: "보조배터리", difficulty: N },
  { id: "key", category: "물건", word: "열쇠", difficulty: N, aliases: ["현관열쇠"] },
  { id: "mask", category: "물건", word: "마스크", difficulty: E },
  { id: "pen", category: "물건", word: "볼펜", difficulty: E, aliases: ["펜"] },
  { id: "notebook", category: "물건", word: "공책", difficulty: E },
  { id: "stapler", category: "물건", word: "호일꽂이", difficulty: H },
  { id: "tape", category: "물건", word: "테이프", difficulty: N },
  { id: "scissors", category: "물건", word: "가위", difficulty: E },
  { id: "charger", category: "물건", word: "충전기", difficulty: N, aliases: ["충전선"] },
  { id: "headphone", category: "물건", word: "헤드폰", difficulty: N },
  { id: "gamepad", category: "물건", word: "게임패드", difficulty: N },
  { id: "stand", category: "물건", word: "스탠드", difficulty: N },
  { id: "cup", category: "물건", word: "컵", difficulty: E },
  { id: "socks", category: "물건", word: "양말", difficulty: N },
  { id: "vacuumflask", category: "물건", word: "보온병", difficulty: H, aliases: ["보온보"] },
  { id: "batterycell", category: "물건", word: "건전지", difficulty: N },
  { id: "mouse", category: "물건", word: "마우스", difficulty: E },
  { id: "monitor", category: "물건", word: "모니터", difficulty: N },
  { id: "bill", category: "물건", word: "지폐", difficulty: N },
  { id: "backpack", category: "물건", word: "백팩", difficulty: E },

  /* 취미 — 24 */
  { id: "movies", category: "취미", word: "영화감상", difficulty: E },
  { id: "videogame", category: "취미", word: "게임", difficulty: E },
  { id: "reading", category: "취미", word: "독서", difficulty: E },
  { id: "hiking", category: "취미", word: "등산", difficulty: E },
  { id: "cooking", category: "취미", word: "요리", difficulty: E },
  { id: "baking", category: "취미", word: "베이킹", difficulty: N },
  { id: "photography", category: "취미", word: "사진찍기", difficulty: E },
  { id: "drawing", category: "취미", word: "그림그리기", difficulty: N, aliases: ["그림"] },
  { id: "guitar", category: "취미", word: "기타", difficulty: E },
  { id: "piano", category: "취미", word: "피아노", difficulty: E },
  { id: "running", category: "취미", word: "달리기", difficulty: E, aliases: ["러닝"] },
  { id: "boardgame", category: "취미", word: "보드게임", difficulty: N },
  { id: "badminton", category: "취미", word: "배드민턴", difficulty: E },
  { id: "golf", category: "취미", word: "골프", difficulty: E },
  { id: "tennis", category: "취미", word: "테니스", difficulty: E },
  { id: "climbing", category: "취미", word: "등벽", difficulty: H, aliases: ["클라이밍"] },
  { id: "fishing", category: "취미", word: "낚시", difficulty: N },
  { id: "camping", category: "취미", word: "캠핑", difficulty: E },
  { id: "gardening", category: "취미", word: "식물키우기", difficulty: N },
  { id: "puzzle", category: "취미", word: "퍼즐", difficulty: N },
  { id: "knitting", category: "취미", word: "뜨개질", difficulty: H, aliases: ["뜨개"] },
  { id: "calligraphy", category: "취미", word: "서예", difficulty: N },
  { id: "volunteering", category: "취미", word: "봉사활동", difficulty: N },
  { id: "stargazing", category: "취미", word: "별관찰", difficulty: H, aliases: ["천체관찰"] },

  /* 스포츠 — 24 */
  { id: "soccer", category: "스포츠", word: "축구", difficulty: E },
  { id: "baseball", category: "스포츠", word: "야구", difficulty: E },
  { id: "basketball", category: "스포츠", word: "농구", difficulty: E },
  { id: "volleyball", category: "스포츠", word: "배구", difficulty: E },
  { id: "refugegame", category: "스포츠", word: "피난실", difficulty: H },
  { id: "marathon", category: "스포츠", word: "마라톤", difficulty: N },
  { id: "gymnastics", category: "스포츠", word: "체조", difficulty: N },
  { id: "judo", category: "스포츠", word: "유도", difficulty: N },
  { id: "taekwondo", category: "스포츠", word: "태권도", difficulty: E },
  { id: "archery", category: "스포츠", word: "양궁", difficulty: N },
  { id: "fencing", category: "스포츠", word: "펜싱", difficulty: H },
  { id: "tabledtennis", category: "스포츠", word: "탁구", difficulty: E },
  { id: "skateboard", category: "스포츠", word: "스케이트보드", difficulty: N },
  { id: "surfing", category: "스포츠", word: "서핑", difficulty: N },
  { id: "skiing", category: "스포츠", word: "스키", difficulty: N },
  { id: "boxing", category: "스포츠", word: "복싱", difficulty: N },
  { id: "crossfit", category: "스포츠", word: "크로스핏", difficulty: N },
  { id: "yoga", category: "스포츠", word: "요가", difficulty: E },
  { id: "pilates", category: "스포츠", word: "필라테스", difficulty: N },
  { id: "trekking", category: "스포츠", word: "트레킹", difficulty: N },
  { id: "paragliding", category: "스포츠", word: "패러글라이딩", difficulty: H },
  { id: "referee", category: "스포츠", word: "심판", difficulty: H },
  { id: "goalkeeper", category: "스포츠", word: "골키퍼", difficulty: H },
  { id: "jogging", category: "스포츠", word: "조깅", difficulty: N },

  /* 여행 — 20 */
  { id: "airplane", category: "여행", word: "비행기", difficulty: E },
  { id: "train", category: "여행", word: "기차", difficulty: E },
  { id: "coach", category: "여행", word: "버스", difficulty: E },
  { id: "hotel", category: "여행", word: "호텔", difficulty: E },
  { id: "guesthouse", category: "여행", word: "게스트하우스", difficulty: N, aliases: ["에어비앤비"] },
  { id: "souvenir", category: "여행", word: "기념품", difficulty: N },
  { id: "sightseeing", category: "여행", word: "관광지", difficulty: E },
  { id: "tent", category: "여행", word: "텐트", difficulty: N },
  { id: "backpacking", category: "여행", word: "배낭여행", difficulty: N, aliases: ["백패킹"] },
  { id: "checkin", category: "여행", word: "체크인", difficulty: N },
  { id: "carryon", category: "여행", word: "캐리어", difficulty: N },
  { id: "jetlag", category: "여행", word: "시차", difficulty: H },
  { id: "landmark", category: "여행", word: "랜드마크", difficulty: N },
  { id: "festival", category: "여행", word: "축제", difficulty: N },
  { id: "travelphoto", category: "여행", word: "여행사진", difficulty: N },
  { id: "summit", category: "여행", word: "정상", difficulty: N, aliases: ["봉우리"] },
  { id: "passport", category: "여행", word: "여권", difficulty: N },
  { id: "inflightmeal", category: "여행", word: "기내식", difficulty: H },
  { id: "itinerary", category: "여행", word: "여행 일정", difficulty: N },
  { id: "tourguide", category: "여행", word: "관광 가이드", difficulty: N },

  /* 일상 — 24 */
  { id: "alarm", category: "일상", word: "알람", difficulty: E },
  { id: "commute", category: "일상", word: "출근", difficulty: E },
  { id: "overtime", category: "일상", word: "야근", difficulty: N },
  { id: "laundryday", category: "일상", word: "빨래", difficulty: E },
  { id: "dishes", category: "일상", word: "설거지", difficulty: E },
  { id: "cleaning", category: "일상", word: "청소", difficulty: E },
  { id: "sleep", category: "일상", word: "잠", difficulty: E, aliases: ["수면"] },
  { id: "shower", category: "일상", word: "샤워", difficulty: E },
  { id: "washface", category: "일상", word: "세수", difficulty: N },
  { id: "busstop", category: "일상", word: "정류장", difficulty: N },
  { id: "transitcard", category: "일상", word: "교통카드", difficulty: N, aliases: ["클립카드"] },
  { id: "notification", category: "일상", word: "알림", difficulty: E },
  { id: "battery", category: "일상", word: "배터리", difficulty: E },
  { id: "password", category: "일상", word: "비밀번호", difficulty: N },
  { id: "delivery", category: "일상", word: "배달", difficulty: E },
  { id: "grocery", category: "일상", word: "장보기", difficulty: N },
  { id: "shoes", category: "일상", word: "신발", difficulty: E },
  { id: "coat", category: "일상", word: "코트", difficulty: E },
  { id: "sobriety", category: "일상", word: "금주", difficulty: N, aliases: ["금연"] },
  { id: "sneakers", category: "일상", word: "운동화", difficulty: N },
  { id: "stationery", category: "일상", word: "필기구", difficulty: N },
  { id: "moving", category: "일상", word: "이사", difficulty: E },
  { id: "pet", category: "일상", word: "반려동물", difficulty: H, aliases: ["키우는 동물"] },
];

/** 화면이 주제 칩을 뽑아낼 때 쓴다. 등장 순서 그대로, 중복 없이. */
export const LIAR_PROMPT_CATEGORIES: string[] = [...new Set(LIAR_PROMPTS.map((p) => p.category))];