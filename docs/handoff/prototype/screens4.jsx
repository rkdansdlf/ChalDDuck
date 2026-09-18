const D4 = window.CD3;

/* ══════════════════════════════════════════════════════════
   00. 팀 만들기 — 초대 링크를 받은 사람 화면만 있고, 처음 만드는 사람 화면이 없던 것을 보완.
   ══════════════════════════════════════════════════════════ */
function ScrTeamCreate({ go }) {
  const [teamName, setTeamName] = React.useState("");
  const [course, setCourse] = React.useState("");
  const [made, setMade] = React.useState(false);
  const code = "CD3-7F2Q";
  return (
    <Phone label="00 팀 만들기">
      <Status />
      <Bar title="새 팀 만들기" onBack={() => go("invite")} />
      <Body>
        {!made ? (
          <React.Fragment>
            <p style={{ font: "400 15px/1.62 var(--font-sans)", color: "var(--txt)", margin: "8px 0 18px", wordBreak: "keep-all", textWrap: "pretty" }}>
              팀 이름과 과목만 적으면 초대 코드가 만들어집니다. 팀원에게 코드나 링크를 공유하면 됩니다.
            </p>
            <Field label="팀 이름" required>
              <Input value={teamName} onChange={setTeamName} placeholder="예: 디지털콘텐츠기획 3조" />
            </Field>
            <Field label="과목">
              <Input value={course} onChange={setCourse} placeholder="예: 디지털콘텐츠기획" />
            </Field>
            <Btn full size="lg" disabled={!teamName.trim()} onClick={() => setMade(true)}>팀 만들기</Btn>
            <Undecided>
              최초 생성자가 팀장 권한을 갖는지, 팀 정보를 나중에 고칠 수 있는지가 기획안에 없어 다루지 않았습니다.
            </Undecided>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Panel s="yellow" pad={20} r={20} style={{ textAlign: "center", marginBottom: 18 }}>
              <div style={{ font: "600 13px/1.4 var(--font-sans)", color: "var(--y-700)", letterSpacing: ".04em", marginBottom: 10 }}>초대 코드</div>
              <div style={{ font: "800 28px/1.2 var(--font-mono)", color: "var(--ink-900)", letterSpacing: ".03em" }}>{code}</div>
              <div style={{ font: "500 13.5px/1.5 var(--font-sans)", color: "var(--y-700)", marginTop: 8, wordBreak: "keep-all" }}>{teamName || D4.team.name}{course ? " · " + course : ""}</div>
            </Panel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
              <Btn full icon="copy">코드 복사하기</Btn>
              <Btn full v="outline" icon="share-2">초대 링크 공유하기</Btn>
            </div>
            <Note tone="info" icon="lock">
              코드를 아는 사람만 입장할 수 있습니다. 팀원은 이 코드로 <b>01 초대 링크 입장</b> 화면에 들어옵니다.
            </Note>
            <Btn full size="lg" style={{ marginTop: 16 }} iconRight="arrow-right" onClick={() => go("name")}>이어서 내 정보 입력하기</Btn>
          </React.Fragment>
        )}
      </Body>
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   25. AI 리서처 — 자료와 출처를 함께 보여준다. 적합도 점수는 만들지 않는다.
   ══════════════════════════════════════════════════════════ */
function ScrResearcher({ go, tab, setTab }) {
  const [searched, setSearched] = React.useState(true);
  const demo = D4.researcherDemo;
  return (
    <Phone label="25 AI 리서처">
      <Status />
      <Bar title="AI 리서처" sub="출처와 함께 찾습니다" onBack={() => go("ai")} />
      <Body dense>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "0 14px", minHeight: 50, borderRadius: 14,
          border: "1.5px solid var(--line-strong)", background: "var(--card)", marginBottom: 16,
        }}>
          <Icon name="search" size={17} style={{ color: "var(--txt-faint)" }} />
          <span style={{ flex: 1, font: "400 14.5px/1 var(--font-sans)", color: "var(--txt-strong)" }}>{demo.query}</span>
        </div>
        {searched ? (
          <React.Fragment>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <SecTitle note="출처가 없는 결과는 보여주지 않습니다" style={{ margin: 0, flex: 1 }}>결과 {demo.results.length}건</SecTitle>
              <Chip tone="warn" icon="flask-conical">샘플 결과</Chip>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16, marginTop: 8 }}>
              {demo.results.map((r, i) => (
                <Panel key={i} s="card" pad={14} r={16}>
                  <div style={{ font: "700 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{r.title}</div>
                  <div style={{ font: "600 12.5px/1.4 var(--font-mono)", color: "var(--link)", marginTop: 4 }}>{r.source}</div>
                  <div style={{ font: "400 13.5px/1.55 var(--font-sans)", color: "var(--txt-muted)", marginTop: 6, wordBreak: "keep-all", textWrap: "pretty" }}>{r.snippet}</div>
                </Panel>
              ))}
            </div>
          </React.Fragment>
        ) : null}
        <Note tone="info" icon="shield" style={{ marginBottom: 12 }}>
          결과는 <b>찾아온 자료</b>일 뿐입니다. 어떤 자료를 쓸지, 어떻게 인용할지는 직접 판단해야 합니다.
        </Note>
        <Undecided>
          검색 결과의 최신성·신뢰도를 어떻게 걸러낼지, 원문 링크를 그대로 보여줄지가 기획안에 없어 다루지 않았습니다.
        </Undecided>
      </Body>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   26. 발표 지원 — 대본 표현만 다듬고, 예상 질문을 정리한다. 내용을 지어내지 않는다.
   ══════════════════════════════════════════════════════════ */
function ScrPresent({ go, tab, setTab }) {
  const demo = D4.presentDemo;
  return (
    <Phone label="26 발표 지원">
      <Status />
      <Bar title="발표 지원" sub="대본 다듬기 · 예상 질문" onBack={() => go("ai")} />
      <Body dense>
        <CompareCard inputLabel="원래 대본" input={demo.raw} resultLabel="다듬은 대본" result={demo.refined} />
        <Note tone="info" icon="equal" style={{ marginBottom: 16 }}>
          내용을 새로 만들지 않고, <b>말이 짧아지도록 표현만</b> 다듬습니다.
        </Note>
        <SecTitle note="발표 전에 미리 준비해 보세요">예상 질문 {demo.questions.length}개</SecTitle>
        <Rows>
          {demo.questions.map((q, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "13px 15px", minHeight: 48 }}>
              <span style={{ flex: "0 0 auto", color: "var(--txt-faint)" }}><Icon name="circle-help" size={16} /></span>
              <span style={{ font: "500 14px/1.55 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all", textWrap: "pretty" }}>{q}</span>
            </div>
          ))}
        </Rows>
        <Undecided>
          예상 질문을 자료 내용에서 뽑는지, 일반적인 질문 목록에서 고르는지가 기획안에 없어 다루지 않았습니다.
        </Undecided>
      </Body>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   27. 상황별 문장 변환 — 쿠션 번역기(말투 3종)와 분리된, 원안의 두 모드.
   ══════════════════════════════════════════════════════════ */
function ScrSentenceMode({ go, tab, setTab }) {
  const [mode, setMode] = React.useState(D4.sentenceModes[0].key);
  const cur = D4.sentenceModes.find((m) => m.key === mode);
  return (
    <Phone label="27 상황별 문장 변환">
      <Status />
      <Bar title="상황별 문장 변환" sub="쿠션 번역기와 다른 기능입니다" onBack={() => go("ai")} />
      <Body dense>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {D4.sentenceModes.map((m) => {
            const on = mode === m.key;
            return (
              <button type="button" key={m.key} onClick={() => setMode(m.key)} style={{
                flex: 1, minHeight: 56, borderRadius: 14, cursor: "pointer", padding: "10px 12px",
                background: on ? "var(--ink-700)" : "var(--card)", color: on ? "var(--on-action)" : "var(--txt-strong)",
                border: "1px solid " + (on ? "transparent" : "var(--line)"), textAlign: "left",
              }}>
                <div style={{ font: "700 13.5px/1.3 var(--font-sans)", wordBreak: "keep-all" }}>{m.name}</div>
                <div style={{ font: "500 11.5px/1.4 var(--font-sans)", opacity: .8, marginTop: 2, wordBreak: "keep-all" }}>{m.desc}</div>
              </button>
            );
          })}
        </div>
        <CompareCard inputLabel="입력" input={cur.demoIn} resultLabel="변환 결과" result={cur.demoOut} />
        <Undecided>
          이 두 모드가 쿠션 번역기와 같은 화면에 있어야 하는지, 별도 도구로 남는지가 기획안에 없어 별도 화면으로 두었습니다.
        </Undecided>
      </Body>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   28. 아이스브레이킹 — 사과게임(공유 링크형)을 먼저 연결.
   ══════════════════════════════════════════════════════════ */
function ScrIceBreak({ go, tab, setTab }) {
  const [picked, setPicked] = React.useState(null);
  const [made, setMade] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  return (
    <Phone label="28 아이스브레이킹">
      <Status />
      <Bar title="아이스브레이킹" sub="팀 분위기를 풀어보는 시간" />
      <Body dense>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {D4.iceGames.map((g) => {
            const on = picked === g.key;
            return (
              <button type="button" key={g.key} onClick={() => { setPicked(g.key); setMade(false); }} style={{
                width: "100%", boxSizing: "border-box", textAlign: "left", borderRadius: 16, cursor: "pointer",
                padding: "13px 15px", background: on ? "var(--y-100)" : "var(--card)",
                border: "1.5px solid " + (on ? "var(--y-500)" : "var(--line)"),
                display: "flex", alignItems: "center", gap: 12,
              }}>
                <span style={{ width: 38, height: 38, flex: "0 0 auto", borderRadius: 12, background: "var(--fill)", display: "grid", placeItems: "center", color: "var(--txt-muted)" }}><Icon name={g.icon} size={18} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", font: "700 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>{g.name}</span>
                  <span style={{ display: "block", font: "400 13px/1.5 var(--font-sans)", color: "var(--txt-muted)", marginTop: 2, wordBreak: "keep-all" }}>{g.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
        {picked === "apple" ? (
          made ? (
            <Panel s="yellow" pad={18} r={18} style={{ textAlign: "center" }}>
              <div style={{ font: "600 13px/1.4 var(--font-sans)", color: "var(--y-700)", marginBottom: 8 }}>공유 링크</div>
              <div style={{ font: "700 15px/1.4 var(--font-mono)", color: "var(--ink-900)" }}>chaldduck.app/apple/x92k</div>
              <Btn size="sm" style={{ marginTop: 12 }} icon="copy">링크 복사하기</Btn>
            </Panel>
          ) : (
            <Btn full size="lg" icon="link" onClick={() => setMade(true)}>사과게임 링크 만들기</Btn>
          )
        ) : picked ? (
          <div>
            <Note tone="warn" icon="hammer" style={{ marginBottom: 10 }}>
              {D4.iceGames.find((g) => g.key === picked).name}은 <b>실행 화면이 준비 중</b>입니다. 지금은 설명만 볼 수 있습니다.
            </Note>
            <Btn full v="outline" icon="info" onClick={() => setToast(D4.iceGames.find((g) => g.key === picked).desc)}>게임 설명 보기</Btn>
          </div>
        ) : null}
        <Undecided>
          세 게임 모두를 이번 범위에서 만들지, 어떤 순서로 우선할지가 기획안에 없어 사과게임만 먼저 연결했습니다.
        </Undecided>
      </Body>
      <Toast msg={toast} />
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   29. 친목 · 메뉴 룰렛 — 원안의 친목·보상 기능 중 우선 선정.
   ══════════════════════════════════════════════════════════ */
function ScrMenuRoulette({ go, tab, setTab }) {
  const [spinning, setSpinning] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const spin = () => {
    setSpinning(true);
    setResult(null);
    setTimeout(() => {
      setResult(D4.menuOptions[Math.floor(Math.random() * D4.menuOptions.length)]);
      setSpinning(false);
    }, 700);
  };
  return (
    <Phone label="29 친목 · 메뉴 룰렛">
      <Status />
      <Bar title="메뉴 룰렛" sub="밥약 메뉴 정하기" />
      <Body dense style={{ display: "flex", flexDirection: "column" }}>
        <p style={{ font: "400 14.5px/1.62 var(--font-sans)", color: "var(--txt)", margin: "4px 0 18px", wordBreak: "keep-all", textWrap: "pretty" }}>
          역할 조율에 쓰는 추첨 도구를 밥 메뉴 정하기에도 그대로 씁니다. 결과에 따라 순위를 매기지 않습니다.
        </p>
        <div style={{
          minHeight: 140, borderRadius: 20, background: "var(--y-100)", display: "flex", alignItems: "center",
          justifyContent: "center", marginBottom: 18,
        }}>
          {spinning ? (
            <Icon name="loader-circle" size={30} style={{ color: "var(--y-700)" }} />
          ) : result ? (
            <div style={{ font: "800 24px/1.3 var(--font-sans)", color: "var(--ink-900)" }}>{result}</div>
          ) : (
            <div style={{ font: "600 14px/1.4 var(--font-sans)", color: "var(--y-700)" }}>버튼을 눌러 정해요</div>
          )}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
          {D4.menuOptions.map((m) => <Chip key={m}>{m}</Chip>)}
        </div>
        <Btn full size="lg" icon="dices" onClick={spin} disabled={spinning}>돌리기</Btn>
        <Undecided>
          원안의 장소 태그·밥약 사진 인증·찰떡 지수·치장 아이템 중 메뉴 룰렛만 먼저 연결했습니다. 나머지 우선순위는 기획안에 없습니다.
        </Undecided>
      </Body>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

Object.assign(window, { ScrTeamCreate, ScrResearcher, ScrPresent, ScrSentenceMode, ScrIceBreak, ScrMenuRoulette });
