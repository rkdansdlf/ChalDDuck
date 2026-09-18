const D = window.CD3;
const Icon = window.Icon;

const SCREENS = [
  { k: "invite", n: "01 초대 링크 입장", g: "온보딩" },
  { k: "teamCreate", n: "00 팀 만들기", g: "온보딩" },
  { k: "name", n: "02 이름 입력", g: "온보딩" },
  { k: "mbti", n: "03 MBTI 선택", g: "온보딩" },
  { k: "quiz", n: "04 30초 MBTI 판별", g: "온보딩" },
  { k: "char", n: "05 캐릭터 발급", g: "온보딩" },
  { k: "role", n: "06 희망 역할 · Veto", g: "역할 조율" },
  { k: "roster", n: "07 팀 역할 조율", g: "역할 조율" },
  { k: "mytime", n: "08 내 가능한 시간", g: "회의 시간" },
  { k: "slots", n: "09 회의 시간 추천", g: "회의 시간" },
  { k: "slotsEmpty", n: "10 전원 불가한 주", g: "회의 시간" },
  { k: "home", n: "11 홈", g: "탭 구조" },
  { k: "drive", n: "12 드라이브", g: "드라이브" },
  { k: "versions", n: "13 파일 버전 기록", g: "드라이브" },
  { k: "ai", n: "14 AI 도구", g: "AI 도구" },
  { k: "cushion", n: "15 쿠션 번역기", g: "AI 도구" },
  { k: "contribSelf", n: "16 기여도 · 본인 확인", g: "기여도" },
  { k: "contribTeam", n: "17 기여도 · 팀원 확인", g: "기여도" },
  { k: "contribPdf", n: "18 기여도 · 1장 PDF", g: "기여도" },
  { k: "chat", n: "19 팀플 단톡방", g: "단톡방" },
  { k: "clerk", n: "20 AI 서기 상세", g: "업무 관리" },
  { k: "tasks", n: "21 할 일 · 체크리스트", g: "업무 관리" },
  { k: "fileview", n: "22 파일 열람·복원", g: "드라이브" },
  { k: "contribFix", n: "23 기여 기록 추가·정정", g: "기여도" },
  { k: "poke", n: "24 익명 콕 찌르기", g: "팀 친목" },
  { k: "researcher", n: "25 AI 리서처", g: "AI 도구" },
  { k: "present2", n: "26 발표 지원", g: "AI 도구" },
  { k: "sentence", n: "27 상황별 문장 변환", g: "AI 도구" },
  { k: "iceBreak", n: "28 아이스브레이킹", g: "팀 친목" },
  { k: "menuRoulette", n: "29 친목 · 메뉴 룰렛", g: "팀 친목" },
  { k: "dmList", n: "30 1:1 DM 목록", g: "단톡방" },
  { k: "dm", n: "31 1:1 DM 대화", g: "단톡방" },
  { k: "chatHub", n: "32 채팅 (통합 목록)", g: "단톡방" },
  { k: "chatDesktop", n: "33 채팅 · PC 화면 예시", g: "흔림 대응" },
];

function App() {
  const [scr, setScr] = React.useState("invite");
  const [tab, setTab] = React.useState("home");
  const [name, setName] = React.useState("");
  const [mbti, setMbti] = React.useState(null);
  const [picks, setPicks] = React.useState([null, null, null, null]);
  const [want, setWant] = React.useState(null);
  const [veto, setVeto] = React.useState(null);
  const [all, setAll] = React.useState(typeof window !== "undefined" && !!window.__CD3_PRINT__);
  const [versions, setVersions] = React.useState(D.versions);
  const [selVer, setSelVer] = React.useState(null);
  const [myContrib, setMyContrib] = React.useState(D.myContrib);
  const [teamCheck, setTeamCheck] = React.useState(D.teamCheck);
  const [fix, setFix] = React.useState(null);
  const [dmTarget, setDmTarget] = React.useState(null);
  const [review, setReview] = React.useState(typeof window !== "undefined" && !!window.__CD3_REVIEW__);

  const quizResult = ["E", "I"][0] && picks.every(Boolean)
    ? ["EI", "SN", "TF", "JP"].map((ax, i) => ax[picks[i] === "a" ? 0 : 1]).join("")
    : null;
  const effMbti = mbti || quizResult;
  const fromQuiz = !mbti && !!quizResult;

  const setPick = (i, v) => setPicks(picks.map((p, j) => (j === i ? v : p)));
  const go = (k) => {
    if (k === "quiz") { setMbti(null); }
    setScr(k);
    if (k === "roster") setTab("team");
    else if (k === "mytime" || k === "slots" || k === "slotsEmpty") setTab("cal");
    else if (k === "drive" || k === "versions") setTab("drive");
    else if (k === "ai" || k === "cushion" || k === "researcher" || k === "present2" || k === "sentence" || k === "clerk") setTab(null);
    else if (k === "contribSelf" || k === "contribTeam" || k === "contribPdf") setTab("team");
    else if (k === "chat" || k === "chatHub" || k === "dmList" || k === "dm") setTab("chat");
    else if (k === "tasks") setTab("home");
    else if (k === "fileview") setTab("drive");
    else if (k === "contribFix" || k === "poke") setTab("team");
    else if (k === "iceBreak" || k === "menuRoulette") setTab("team");
    else if (k === "home") setTab("home");
  };

  const onTab = (t) => {
    setTab(t);
    if (t === "home") setScr("home");
    else if (t === "cal") setScr("mytime");
    else if (t === "team") setScr("roster");
    else if (t === "drive") setScr("drive");
    else if (t === "chat") setScr("chatHub");
  };

  const render = (k) => {
    switch (k) {
      case "invite": return <ScrInvite go={go} />;
      case "teamCreate": return <ScrTeamCreate go={go} />;
      case "name": return <ScrName go={go} name={name} setName={setName} />;
      case "mbti": return <ScrMbti go={go} mbti={mbti} setMbti={setMbti} />;
      case "quiz": return <ScrQuiz go={go} picks={picks} setPick={setPick} result={quizResult} />;
      case "char": return <ScrChar go={go} mbti={effMbti || "INFJ"} fromQuiz={fromQuiz} />;
      case "role": return <ScrRole go={go} want={want} setWant={setWant} veto={veto} setVeto={setVeto} />;
      case "roster": return <ScrRoster go={go} want={want || "research"} veto={veto} name={name} tab={tab} setTab={onTab} onOpenDm={(n) => { setDmTarget(n); go("dm"); }} />;
      case "mytime": return <ScrMyTime go={go} tab={tab} setTab={onTab} />;
      case "slots": return <ScrSlots go={go} tab={tab} setTab={onTab} />;
      case "slotsEmpty": return <ScrSlots go={go} tab={tab} setTab={onTab} empty />;
      case "home": return <ScrHome go={go} name={name} tab={tab} setTab={onTab} />;
      case "drive": return <ScrDrive go={go} tab={tab} setTab={onTab} />;
      case "versions": return <ScrVersions go={go} tab={tab} setTab={onTab} versions={versions} onOpen={(v) => { setSelVer(v); go("fileview"); }} />;
      case "ai": return <ScrAi go={go} tab={tab} setTab={onTab} />;
      case "cushion": return <ScrCushion go={go} tab={tab} setTab={onTab} />;
      case "contribSelf": return <ScrContribSelf go={go} tab={tab} setTab={onTab} myContrib={myContrib} onAdd={(kind) => { setFix({ mode: "add", kind }); go("contribFix"); }} />;
      case "contribTeam": return <ScrContribTeam go={go} tab={tab} setTab={onTab} teamCheck={teamCheck} onResolve={(t) => { setFix({ mode: "resolve", target: t }); go("contribFix"); }} />;
      case "contribPdf": return <ScrContribPdf go={go} tab={tab} setTab={onTab} />;
      case "chat": return <ScrChat go={go} tab={tab} setTab={onTab} />;
      case "clerk": return <ScrClerk go={go} tab={tab} setTab={onTab} />;
      case "tasks": return <ScrTasks go={go} tab={tab} setTab={onTab} />;
      case "fileview": return <ScrFileView go={go} tab={tab} setTab={onTab} versions={versions} setVersions={setVersions} selVer={selVer} />;
      case "contribFix": return <ScrContribFix go={go} tab={tab} setTab={onTab} fix={fix} myContrib={myContrib} setMyContrib={setMyContrib} teamCheck={teamCheck} setTeamCheck={setTeamCheck} />;
      case "poke": return <ScrPoke go={go} tab={tab} setTab={onTab} />;
      case "researcher": return <ScrResearcher go={go} tab={tab} setTab={onTab} />;
      case "present2": return <ScrPresent go={go} tab={tab} setTab={onTab} />;
      case "sentence": return <ScrSentenceMode go={go} tab={tab} setTab={onTab} />;
      case "iceBreak": return <ScrIceBreak go={go} tab={tab} setTab={onTab} />;
      case "menuRoulette": return <ScrMenuRoulette go={go} tab={tab} setTab={onTab} />;
      case "dmList": return <ScrDmList go={go} tab={tab} setTab={onTab} onOpenDm={(n) => { setDmTarget(n); go("dm"); }} />;
      case "dm": return <ScrDm go={go} tab={tab} setTab={onTab} target={dmTarget} />;
      case "chatHub": return <ScrChatHub go={go} tab={tab} setTab={onTab} onOpenDm={(n) => { setDmTarget(n); go("dm"); }} />;
      case "chatDesktop": return <ScrChatDesktop />;
      default: return null;
    }
  };

  const groups = [...new Set(SCREENS.map((s) => s.g))];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "var(--y-100)", borderBottom: "1px solid var(--y-300)", padding: "22px 0 20px" }}>
        <div style={{ maxWidth: 1300, margin: "0 auto", padding: "0 clamp(16px,4vw,40px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 12 }}>
            <img src="assets/logo-mochi.png" alt="찰떡" style={{ width: 48, height: 48, objectFit: "contain", display: "block" }} />
            <div>
              <div style={{ font: "800 21px/1.2 var(--font-sans)", letterSpacing: "-.035em", color: "var(--ink-900)" }}>찰떡</div>
              <div style={{ font: "600 12.5px/1.4 var(--font-sans)", color: "var(--y-700)", letterSpacing: ".04em", marginTop: 2 }}>프론트 설계 v3 · 새 로고 팔레트</div>
            </div>
          </div>
          <p style={{ font: "400 15.5px/1.65 var(--font-sans)", color: "var(--ink-600)", maxWidth: "62ch", margin: 0, wordBreak: "keep-all", textWrap: "pretty" }}>
            보완 기획안에 적힌 <b>초대 링크 입장 · 30초 MBTI · 캐릭터 발급 · 희망 역할과 Veto · 공강 반영 회의 시간 · 드라이브 · AI 도구 · 기여도 리포트</b>를 화면 {SCREENS.length}개로 옮겼습니다.
            기획안에 규칙이 없는 지점은 임의로 정하지 않고 <b style={{ color: "var(--ink-800)" }}>점선 박스</b>로 표시했습니다.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 16 }}>
            {[["크림 배경 · 잉크 행동 · 노랑 강조", "적용"], ["탭 5개 (홈·채팅·일정·드라이브·팀)", "적용"], ["제품 원칙 6개 유지", "적용"], ["역할 추천에 MBTI 미사용", "적용"], ["기여도 — 점수·순위 없음", "적용"], ["로고 벡터", "미제공"]].map(([k, v]) => (
              <span key={k} style={{
                font: "600 12.5px/1.4 var(--font-sans)", padding: "6px 11px", borderRadius: 999,
                background: v === "적용" ? "rgba(255,255,255,.75)" : "transparent",
                border: "1px solid " + (v === "적용" ? "transparent" : "var(--y-500)"),
                color: v === "적용" ? "var(--ink-700)" : "var(--y-700)",
              }}>{k} · <b style={{ fontWeight: 800 }}>{v}</b></span>
            ))}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "22px clamp(16px,4vw,40px) 60px", width: "100%", boxSizing: "border-box", flex: 1 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 20 }} data-print-hide="1">
          <button type="button" onClick={() => setAll(!all)} style={{
            minHeight: 42, padding: "0 15px", borderRadius: 12, cursor: "pointer",
            font: "700 13.5px/1 var(--font-sans)",
            background: all ? "var(--ink-700)" : "var(--card)", color: all ? "var(--on-action)" : "var(--txt)",
            border: "1px solid " + (all ? "transparent" : "var(--line-strong)"),
            display: "inline-flex", alignItems: "center", gap: 7,
          }}>
            <Icon name={all ? "square-dashed-mouse-pointer" : "layout-grid"} size={16} />
            {all ? "클릭 데모로 돌아가기" : "화면 " + SCREENS.length + "개 한눈에 보기"}
          </button>
          <button type="button" onClick={() => { toggleReviewMode(); setReview(!review); }} style={{
            minHeight: 42, padding: "0 15px", borderRadius: 12, cursor: "pointer",
            font: "700 13.5px/1 var(--font-sans)",
            background: review ? "var(--info)" : "var(--card)", color: review ? "#fff" : "var(--txt)",
            border: "1px solid " + (review ? "transparent" : "var(--line-strong)"),
            display: "inline-flex", alignItems: "center", gap: 7,
          }}>
            <Icon name={review ? "eye" : "eye-off"} size={16} />
            {review ? "검토 메모 표시 중" : "검토 메모 숨김"}
          </button>
          {!all ? (
            <>
              <span style={{ width: 8 }} />
              {groups.map((g) => (
                <span key={g} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ font: "700 11.5px/1 var(--font-sans)", color: "var(--txt-faint)", letterSpacing: ".05em" }}>{g}</span>
                  {SCREENS.filter((s) => s.g === g).map((s) => {
                    const on = scr === s.k;
                    return (
                      <button type="button" key={s.k} onClick={() => go(s.k)} style={{
                        minHeight: 34, padding: "0 10px", borderRadius: 9, cursor: "pointer",
                        font: "700 12px/1 var(--font-mono)",
                        background: on ? "var(--y-400)" : "var(--card)", color: "var(--ink-900)",
                        border: "1px solid " + (on ? "transparent" : "var(--line)"),
                      }}>{s.n.slice(0, 2)}</button>
                    );
                  })}
                </span>
              ))}
            </>
          ) : null}
        </div>

        {all ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(390px,390px))", gap: 28, justifyContent: "start" }}>
            {SCREENS.map((s) => (
              <div key={s.k} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ font: "700 11.5px/1 var(--font-mono)", letterSpacing: ".05em", padding: "5px 8px", borderRadius: 7, background: "var(--ink-700)", color: "var(--on-action)" }}>{s.n.slice(0, 2)}</span>
                  <span style={{ font: "700 14.5px/1.3 var(--font-sans)", color: "var(--txt-strong)", letterSpacing: "-.012em" }}>{s.n.slice(3)}</span>
                  <span style={{ font: "600 11.5px/1 var(--font-sans)", color: "var(--txt-faint)", marginLeft: "auto" }}>{s.g}</span>
                </div>
                {render(s.k)}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 34, alignItems: "flex-start", flexWrap: "wrap" }}>
            {render(scr)}
            <div style={{ flex: "1 1 320px", minWidth: 300, maxWidth: 520 }}>
              <SpecPanel scr={scr} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const SPEC = {
  invite: { purpose: "초대 링크로 들어온 사람이 어느 팀인지 확인하고 바로 입장하기",
    keep: "에브리타임·카카오톡에 공유하는 초대 링크 또는 QR, 가입 없는 입장",
    design: "첫 화면은 로고와 팀 정보만. 채운 버튼은 하나이고, ‘로그인’ 같은 다른 경로를 만들지 않았습니다.",
    open: "‘10초 온보딩’은 기획안의 목표 표현입니다. 실제 측정값이 아니므로 화면에 초 수를 적지 않았습니다." },
  name: { purpose: "팀원에게 보일 이름을 정하고, 기록이 어디에 남는지 알기",
    keep: "로그인 없는 참여",
    design: "로그인이 없다는 사실을 장점처럼 쓰지 않고, 기록이 이 기기에 묶인다는 한계를 같은 화면에서 밝혔습니다.",
    open: "재입장 시 같은 사람임을 확인하는 방법과 기기 변경 시 기록 이전이 기획안에 없어, 복구 수단을 만들지 않았습니다." },
  mbti: { purpose: "MBTI를 고르거나, 모르면 30초 컷으로 넘어가거나, 건너뛰기",
    keep: "16종 그리드, 그리드 아래 ‘내 MBTI를 몰라요 — 30초 컷’ 링크",
    design: "‘MBTI 없이 계속하기’를 같은 화면에 두어 선택 정보임을 형태로 보여줍니다. 30초 컷은 링크가 아니라 44px 이상 카드로 키웠습니다.",
    open: "MBTI에 따라 쿠션 번역기 모드를 자동 적용하는지가 기획안에 없어, 이 화면에서 약속하지 않았습니다." },
  quiz: { purpose: "팀플 상황 4문항으로 유형을 골라 보기",
    keep: "E/I·S/N·T/F·J/P 네 문항과 문서에 적힌 선택지 문장 그대로",
    design: "네 문항을 한 화면에 세로로 두어 앞뒤 문항을 비교하며 고칠 수 있게 했습니다. 좋음·나쁨 색을 쓰지 않았습니다.",
    open: "정확도·검증 결과가 없어 ‘진단’이 아니라 ‘간편 선택’으로만 적었습니다." },
  char: { purpose: "배정된 캐릭터를 확인하고 다음으로 넘어가기",
    keep: "MBTI 선택 시 16종 캐릭터 중 하나 자동 배정",
    design: "16종 캐릭터 이미지를 유형별로 매칭해 이 화면과 팀원 목록(07·17)에 그대로 반영했습니다. 캐릭터 고유 이름은 기획안에 없어 지어내지 않고 MBTI 유형명으로 적었습니다.",
    open: "캐릭터 고유 이름은 여전히 없습니다. MBTI를 입력하지 않은 사람(예: 최유나)은 캐릭터가 배정되지 않아 이름 모노그램(점선 원)으로 표시합니다." },
  role: { purpose: "1순위 희망 역할과 피하고 싶은 역할을 각각 하나 고르기",
    keep: "희망 1순위 + Veto 1개, “같은 MBTI이지만 각자의 선호도가 다르다”는 기획 의도",
    design: "희망은 원형 체크, Veto는 사각 체크로 형태를 다르게 했습니다. 이미 반대쪽에 고른 역할은 비활성으로 잠급니다.",
    open: "Veto를 여러 개 고를 수 있는지, 2·3순위를 받는지가 기획안에 없어 각각 하나로 고정했습니다." },
  roster: { purpose: "팀 전체의 희망·Veto를 보고 겹치는 역할을 조율하기",
    keep: "룰렛·주사위·제비뽑기·사다리타기, 각자 고른 희망과 Veto",
    design: "정책 확정: 선호 확인 → 협의 → (필요하면) 추첨 → 당사자 수락 → 최종 확정. 추첨 결과도 자동 배정하지 않고 당사자가 수락해야 확정됩니다.",
    open: "수락을 거절하면 재추첨 범위(전원 재추첨 vs 남은 후보끼리)는 아직 정하지 않았습니다." },
  mytime: { purpose: "내가 안 되는 시간을 칠해 공동 회의 후보의 입력을 만들기",
    keep: "시험 기간·아르바이트 시간·공강 시간 반영",
    design: "‘가능한 시간’이 아니라 ‘안 되는 시간’을 칠하게 했습니다 — 빈 칸이 훨씬 많아 손이 덜 갑니다. 사유는 세 종류로만 구분합니다.",
    open: "입력 단위(30분·1시간), 주 단위 반복, 학기 시간표 불러오기가 기획안에 없어 1시간 칸 수동 입력으로 두었습니다." },
  slots: { purpose: "모두 가능한 시간을 확인하고 하나를 제안하기",
    keep: "모두가 가능한 회의 시간 자동 추천",
    design: "적합도 점수나 순위를 만들지 않았습니다. ‘몇 명 가능 / 누가 왜 안 되는지’만 사실로 적습니다. 확정은 사람이 누릅니다.",
    open: "회의 길이, 최소 참석 인원, 확정 권한이 기획안에 없습니다." },
  slotsEmpty: { purpose: "전원 가능한 시간이 없는 주를 막다른 화면으로 만들지 않기",
    keep: "—", design: "정책 확정: 최다 인원 가능 시간을 후보로 보이고, 빠진 사람에게 비대면 의견 요청을 보냅니다. 다음 주 이월은 팀이 버튼으로 직접 고릅니다.",
    open: "비대면 의견을 회의 결과에 어떻게 반영해 기록할지는 아직 정하지 않았습니다." },
  home: { purpose: "지금 무엇을 해야 하는지 알고 5개 탭으로 들어가기",
    keep: "탭 5개 구성 (홈·채팅·일정·드라이브·팀)",
    design: "AI 도구는 전용 탭을 없애고 홈 하단 바로가기로만 들어가도록 정리했습니다. 홈 순서는 확인 필요한 일 → 가까운 일정 → 최신 자료 → AI 바로가기 순입니다.",
    open: "아이스브레이킹·메뉴 룰렛은 홈에서 바로 연결하지 않고 내비게이션으로만 접근하게 두었습니다." },

  drive: { purpose: "맡은 역할대로 결과물을 제출하고 팀 파일을 한곳에서 찾기",
    keep: "역할별 제출함(자료조사·PPT 템플릿·발표 대본), 파일 버전 기록",
    design: "제출함을 역할 이름으로 부르고 담당자·개수·마감을 칩으로 함께 적었습니다. 빈 제출함을 오류처럼 보이게 하지 않고 ‘아직 없음’으로만 표시합니다.",
    open: "용량 한도, 파일 형식 제한, 마감 후 업로드 허용 여부가 기획안에 없습니다." },
  versions: { purpose: "누가 언제 무엇을 바꿨는지 확인하고 이전 버전을 되살리기",
    keep: "파일 버전 기록",
    design: "덮어쓰기 불안을 없애는 것이 이 화면의 목적이라 ‘지워지지 않는다’를 명시했습니다. 버전 번호를 모노로 고정폭 처리해 목록에서 눈으로 좇기 쉽게 했습니다.",
    open: "버전 되돌리기(롤백) 권한이 올린 사람에게만 있는지가 정해지지 않았습니다." },
  ai: { purpose: "필요한 AI 도구를 고르고, 무엇이 아직 준비 중인지 알기",
    keep: "쿠션 번역기 · AI 서기 · AI 리서처 · 발표 지원",
    design: "준비되지 않은 도구를 숨기지 않고 ‘준비 중’으로 눌리지 않게 뒀습니다. AI가 대신 결정하지 않는다는 원칙을 목록 아래에 한 번 적습니다.",
    open: "사용량 한도, 대화 보관 기간, 수업 정책상 허용 범위가 기획안에 없습니다." },
  cushion: { purpose: "하고 싶은 말을 관계가 상하지 않는 말투로 바꿔 보내기",
    keep: "쿠션 번역기",
    design: "원문과 바꾼 말을 위아래로 나란히 둡니다. ‘요구 내용은 그대로, 말투만’을 화면에서 약속하고 원문으로 보내는 선택도 같이 뒀습니다.",
    open: "말투 종류의 개수·이름이 기획안에 없어 세 가지로 두었습니다. MBTI 기반 자동 말투도 미정입니다." },
  contribSelf: { purpose: "앱이 모은 내 기록을 확인하고 빠진 작업을 직접 보태기",
    keep: "담당 업무 · 결과물 제작·수정 · 회의 참여 · 협업 지원 · 마감 이행, 공동·오프라인 작업 추가",
    design: "앱이 수집한 것과 내가 추가한 것을 칩으로 구분합니다. 내가 추가한 항목은 자동 확정되지 않고 ‘확인 대기’로 남습니다.",
    open: "회의 참여를 무엇으로 판정하는지(입장·발언·시간)가 기획안에 없어 회수만 적었습니다." },
  contribTeam: { purpose: "서로의 기록을 확인하고, 사실과 다르면 정정하기",
    keep: "팀원 확인·정정 단계, 미확인·의견 차이 별도 표시",
    design: "의견이 다른 항목을 한쪽 말로 덮지 않고 양쪽을 남깁니다. ‘공동 작업으로 나누기’를 정정 수단으로 제공합니다.",
    open: "끝까지 안 좁혀진 의견 차이의 최종 기재 방식이 정해지지 않았습니다." },
  contribPdf: { purpose: "확인된 기록만 담은 1장 리포트를 만들기",
    keep: "1장 PDF 생성, 종합 점수·순위 제외, MBTI·사주·채팅량·친목 미반영",
    design: "사람마다 ‘합의한 역할 + 확인된 기록 수’만 적습니다. 숫자를 크게 키우지 않고 미확인·의견 차이를 같은 줄에 병기해 비교표로 읽히지 않게 했습니다.",
    open: "교수 제출본과 내부용을 나눌지, 제출 전 전원 동의를 받을지가 정해지지 않았습니다." },
  chat: { purpose: "팀 전체가 모여 실시간으로 이야기하기",
    keep: "쿠션 번역기의 ‘이대로 보내기’로 다듬은 말을 실제로 보내는 자리",
    design: "쿠션 번역기로 다듬은 메시지는 표시(칩)를 남겨 원문을 숨기지 않습니다. 리액션은 이모지 대신 Lucide 아이콘만 씁니다.",
    open: "채널을 여러 개 두는지, 1:1 DM·삭제가 되는지가 기획안에 없어 팀 전체 단일 채팅방으로만 구성했습니다." },
  clerk: { purpose: "회의 내용에서 할 일 후보를 뽑고, 확인한 것만 업무로 반영하기",
    keep: "‘회의 내용을 할 일 카드로 정리한다’는 AI 서기 소개 문구",
    design: "입력 → 요약·후보 → 반영 3단계로 나눠, 담당자·기한을 사람이 확인해야 다음 단계로 넘어가게 했습니다. 후보는 포함·제외를 직접 고를 수 있습니다.",
    open: "회의 내용을 텍스트로 붙여넣는 방식 외에 녹음 인식 여부는 기획안에 없어 다루지 않았습니다." },
  tasks: { purpose: "팀 업무·개인 학습·점검을 한 목록에서 만들고 상태를 바꾸기",
    keep: "AI 서기가 만든 할 일 카드, 기여 기록의 담당 업무 예시",
    design: "세 가지 종류(팀 업무·개인 학습·점검)를 칩으로 구분하고, 상태 아이콘을 누르면 할 일 → 진행 중 → 완료로 순서대로 바뀝니다. 종합 진행률(%)은 만들지 않았습니다.",
    open: "담당자 지정을 당사자가 수락해야 확정되는지, 마감을 놓쳤을 때의 처리 방식이 기획안에 없습니다." },
  fileview: { purpose: "이전 버전 내용을 보고, 필요하면 지금 버전으로 되살리기",
    keep: "버전 목록, 이전 버전 다운로드 아이콘",
    design: "복원은 덮어쓰지 않고 새 버전을 맨 위에 추가하는 방식으로만 만들었습니다 — ‘올린 파일은 지워지지 않는다’는 원칙을 복원에도 그대로 적용했습니다. 되돌리기 전에는 항상 확인 시트를 띄웁니다.",
    open: "복원 권한이 올린 사람에게만 있는지, 실제 파일 내용을 미리 보는 뷰어는 기획안에 없어 다루지 않았습니다." },
  contribFix: { purpose: "빠진 기록을 근거와 함께 넣고, 의견이 다른 기록에 응답하기",
    keep: "공동·오프라인 작업 추가, 정정할 권리, 의견 차이 표시",
    design: "추가와 정정 응답을 한 화면 안에서 상황별로 나눠, 추가한 기록은 근거를 붙여야 다음으로 넘어가게 했습니다. 정정 응답은 동의와 공동 작업 나누기 중 하나를 직접 고릅니다.",
    open: "근거 파일의 형식·용량 제한과, 정정에도 합의가 안 되면 어떻게 되는지는 기획안에 없습니다." },
  poke: { purpose: "담당자에게 부담을 주지 않고 마감을 슬쩍 알리기",
    keep: "기여 기록의 ‘마감 알림’ 예시",
    design: "보낸 사람을 밝히지 않아 다그치는 느낌을 줄였습니다. 누구나 볼 수 있는 공개 알림이 아니라 받는 사람에게만 조용히 뜹니다. 업무당 하루 한 번으로 제한해 반복 찌르기를 막았습니다.",
    open: "익명이 악용될 때(과도한 찌르기 등) 대응 방법이 기획안에 없어 다루지 않았습니다." },
  teamCreate: { purpose: "처음 팀을 만드는 사람이 초대 코드를 만들고 공유하기",
    keep: "초대 링크·QR로 입장한다는 기획안의 전제",
    design: "초대 링크 입장 화면만 있고 링크를 만드는 화면이 없어 새로 추가했습니다. 팀 이름만 적으면 코드가 생기고, 이어서 본인 정보 입력으로 자연스럽게 넘어갑니다.",
    open: "최초 생성자의 팀장 권한, 팀 정보 수정 가능 여부가 기획안에 없어 다루지 않았습니다." },
  researcher: { purpose: "자료를 출처와 함께 찾고, 직접 판단해서 쓰기",
    keep: "메뉴의 ‘AI 리서처’ 소개 문구",
    design: "결과마다 출처를 나란히 붙여 근거 없는 문장을 만들지 않았습니다. 적합도 점수나 추천 순위는 만들지 않습니다.",
    open: "검색 결과의 최신성·신뢰도를 어떻게 걸러낼지가 기획안에 없어 다루지 않았습니다." },
  present2: { purpose: "발표 대본을 짧게 다듬고, 예상 질문을 미리 준비하기",
    keep: "메뉴의 ‘발표 지원’ 소개 문구",
    design: "원문과 다듬은 문장을 나란히 두어 내용이 바뀌지 않았음을 보였습니다. 예상 질문은 목록으로만 두고 답을 대신 만들지 않습니다.",
    open: "예상 질문을 자료 내용에서 뽑는지, 일반적인 목록에서 고르는지가 기획안에 없어 다루지 않았습니다." },
  sentence: { purpose: "핵심 요약, 교수님께 보낼 질문 메일 등 상황에 맞게 문장을 바꾸기",
    keep: "원안의 ‘핵심 요약 모드’ · ‘교수님 질문 메일 모드’",
    design: "쿠션 번역기(말투 3종)와 겹치지 않도록 별도 화면으로 뒀습니다. 모드마다 입력·결과를 나란히 보여줘 무엇이 바뀌는지 확인할 수 있습니다.",
    open: "이 기능이 쿠션 번역기와 한 화면에 있어야 하는지가 기획안에 없어 별도 화면으로 두었습니다." },
  iceBreak: { purpose: "팀 분위기를 푸는 미니게임 중 하나를 시작하기",
    keep: "원안의 사과게임·라이어 게임·갈틱폰",
    design: "세 게임 모두를 만들지 않고, 공유 링크만으로 되는 사과게임을 먼저 연결했습니다. 나머지는 고를 수는 있지만 아직 실행 화면이 없다고 정직하게 표시합니다.",
    open: "세 게임의 우선순위와 나머지 실행 화면 제작 여부가 기획안에 없어 다루지 않았습니다." },
  menuRoulette: { purpose: "역할 조율용 추첨 도구를 밥 메뉴 정하기에도 재사용하기",
    keep: "원안의 친목·보상 기능 중 하나",
    design: "07번 화면의 추첨 도구를 그대로 재사용해 새 UI를 만들지 않았습니다. 결과에 순위나 점수를 붙이지 않습니다.",
    open: "장소 태그·밥약 인증·찰떡 지수·치장 아이템의 우선순위가 기획안에 없어 메뉴 룰렛만 먼저 연결했습니다." },
  dmList: { purpose: "팀원 각각과 나눈 1:1 대화를 한곳에서 확인하기",
    keep: "단톡방과 별도로 1:1 대화가 필요하다는 전제(기획안에 화면은 없음)",
    design: "단톡방(19)에는 없던 화면입니다. 07번 화면에서 팀원 아바타를 눌러야 열리게 해, 아무 때나 새 DM을 만들 수 있는 목록이 아니라 이미 시작된 대화만 모으는 자리로 뒀습니다.",
    open: "DM을 먼저 개설하는 진입점을 이 목록 화면에도 둘지, 안 읽은 개수를 팀 탭 배지에 합산할지가 기획안에 없어 다루지 않았습니다." },
  dm: { purpose: "한 팀원과만 조용히 이야기하기",
    keep: "단톡방의 쿠션 번역기·리액션 방식",
    design: "단톡방과 같은 말풍선 형태를 그대로 쓰되, 상대가 한 명뿐이라 이름표를 다시 붙이지 않았습니다. 이 대화는 둘만 본다는 점을 화면에 한 번 적었습니다.",
    open: "DM에서도 쿠션 번역기를 거칠 수 있는지, 메시지 삭제·차단이 되는지가 기획안에 없어 다루지 않았습니다." },
  chatHub: { purpose: "팀 대화와 1:1 대화를 한곳에서 확인하고 들어가기",
    keep: "단톡방(19)과 1:1 DM(30·31)이 이미 만들어져 있다는 전제",
    design: "하단 탭에서 'AI 도구' 탭을 없애고 '채팅' 탭을 넣은 설계 변경에 따라 새로 만든 진입 화면입니다. 팀 대화 / 개인 대화 필터로 나눠, 탭을 누르면 바로 여기로 옵니다.",
    open: "필터를 기억해 다음에 열 때도 유지할지, 안 읽은 개수를 어떻게 합산할지가 기획안에 없어 다루지 않았습니다." },
  chatDesktop: { purpose: "1024px 이상 큰 화면에서 채팅이 단순 확대가 아니라 3분할 구조로 보이는 예시를 만들기",
    keep: "설계 제안의 'PC 채팅은 대화 목록 / 메시지 / 선택한 자료·정보로 배치' 목표",
    design: "모바일은 32·19·31번을 한 화면씩 순서대로 넘겨 볼 수 있고, 1024px 이상에서는 같은 정보가 목록·대화·정보 3분할 구조로 배치된다는 것을 보여줍니다. 실제 앱은 한 파일로 바뀌지 않지만, 큰 화면 레이아웃 방향을 예시로 남깁니다.",
    open: "600px·1024px 경계에서 실제 폭이 줄어들 때 전환되는 애니메이션·중간 상태는 실제 구현 단계에서 확인해야 합니다." },
};

function SpecPanel({ scr }) {
  const s = SPEC[scr];
  if (!s) return null;
  const rows = [["화면 목적", s.purpose, "target"], ["기획안에서 가져온 것", s.keep, "file-text"], ["시각 설계 결정", s.design, "pen-tool"], ["아직 정해지지 않은 것", s.open, "circle-dashed"]];
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 20, padding: "18px 20px", position: "sticky", top: 20 }}>
      <div style={{ font: "800 17px/1.35 var(--font-sans)", color: "var(--txt-strong)", letterSpacing: "-.025em", marginBottom: 14, wordBreak: "keep-all" }}>
        {(SCREENS.find((x) => x.k === scr) || {}).n}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map(([k, v, ic]) => (
          <div key={k}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ display: "inline-flex", color: k === "아직 정해지지 않은 것" ? "var(--warn)" : "var(--txt-faint)" }}><Icon name={ic} size={14} /></span>
              <span style={{ font: "700 11.5px/1.4 var(--font-sans)", letterSpacing: ".05em", color: k === "아직 정해지지 않은 것" ? "var(--warn)" : "var(--txt-faint)" }}>{k}</span>
            </div>
            <div style={{ font: "400 14.5px/1.65 var(--font-sans)", color: "var(--txt)", wordBreak: "keep-all", textWrap: "pretty" }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { SCREENS, SpecPanel });

/* mount 게이트 — 이 파일은 컴파일러가 _ds_bundle.js 에도 넣기 때문에,
   v3 페이지의 #root[data-mount="cd3"] 가 있을 때만 마운트한다. */
(function mount() {
  const el = document.querySelector('#root[data-mount="cd3"]');
  if (!el) return;
  if (!window.CD3 || !window.ScrInvite || !window.ScrDrive || !window.Phone || !window.Icon) return setTimeout(mount, 30);
  if (!el.__r) el.__r = ReactDOM.createRoot(el);
  el.__r.render(<App />);
})();
