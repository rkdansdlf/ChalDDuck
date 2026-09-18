const D = window.CD3;
const Icon = window.Icon;

/* ══════════════════════════════════════════════════════════
   1. 초대 링크 입장 — 로그인 없이, 이름만
   ══════════════════════════════════════════════════════════ */
function ScrInvite({ go }) {
  return (
    <Phone label="01 초대 링크 입장">
      <Status tone="y" />
      <Body tone="y" pad={20} style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, textAlign: "center", padding: "20px 0 8px" }}>
          <img src="assets/logo-mochi.png" alt="찰떡" style={{ width: 132, height: 132, objectFit: "contain", display: "block" }} />
          <div>
            <div style={{ font: "800 30px/1.2 var(--font-sans)", letterSpacing: "-.045em", color: "var(--ink-900)" }}>찰떡</div>
            <p style={{ font: "500 15px/1.6 var(--font-sans)", color: "var(--ink-600)", margin: "8px 0 0", wordBreak: "keep-all", textWrap: "pretty" }}>
              팀플을 시작하고, 함께 하고, 제출까지 준비하는 곳
            </p>
          </div>
        </div>
        <Panel s="cream" pad={18} r={20}>
          <div style={{ font: "600 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginBottom: 4 }}>초대받은 팀</div>
          <div style={{ font: "700 19px/1.35 var(--font-sans)", color: "var(--txt-strong)", letterSpacing: "-.02em", wordBreak: "keep-all" }}>{D.team.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <Chip icon="book-open">{D.team.course}</Chip>
            <Chip icon="users-round">{D.team.members}명</Chip>
            <Chip tone="y" icon="calendar-clock">{D.team.dday}</Chip>
          </div>
        </Panel>
      </Body>
      <Dock>
        <Btn full size="lg" icon="arrow-right" onClick={() => go("name")}>이름만 적고 들어가기</Btn>
        <div style={{ font: "400 13px/1.55 var(--font-sans)", color: "var(--txt-muted)", textAlign: "center", wordBreak: "keep-all" }}>
          가입이나 로그인 없이 바로 들어갑니다
        </div>
        <button type="button" onClick={() => go("teamCreate")} style={{
          background: "none", border: "none", cursor: "pointer", padding: "6px 0 0",
          font: "600 13px/1.4 var(--font-sans)", color: "var(--link)", textAlign: "center",
        }}>아직 팀이 없다면 — 새로 만들기</button>
      </Dock>
    </Phone>
  );
}

/* 2. 이름 입력 + 기기 기록 안내 */
function ScrName({ go, name, setName }) {
  const short = name.trim().length > 0 && name.trim().length < 2;
  const existing = D.roster.find((r) => !r.me && r.name === name.trim());
  const [confirming, setConfirming] = React.useState(false);
  const [notMe, setNotMe] = React.useState(false);
  const proceed = () => {
    if (existing && !notMe) { setConfirming(true); return; }
    go("mbti");
  };
  return (
    <Phone label="02 이름 입력">
      <Status />
      <Bar title="팀에 들어가기" sub="1 / 4단계" onBack={() => go("invite")} />
      <Body>
        <Progress step={1} total={4} style={{ marginBottom: 18 }} />
        <h1 style={{ font: "800 26px/1.3 var(--font-sans)", letterSpacing: "-.035em", color: "var(--txt-strong)", margin: "0 0 8px", wordBreak: "keep-all" }}>
          팀원들에게 보일 이름
        </h1>
        <p style={{ font: "400 15px/1.62 var(--font-sans)", color: "var(--txt)", margin: "0 0 20px", wordBreak: "keep-all", textWrap: "pretty" }}>
          실명이 아니어도 됩니다. 팀원이 누구인지 알아볼 수 있는 이름이면 충분합니다.
        </p>
        <Field label="이름" required error={short ? "두 글자 이상 적어 주세요." : null}>
          <Input value={name} onChange={(v) => { setName(v); setNotMe(false); }} placeholder="예: 김민준" error={short} />
        </Field>
        <Note tone="info" icon="key-round" title="초대 코드 + 이름으로 기록을 이어갑니다">
          같은 초대 코드({D.team.code})로 같은 이름을 다시 적으면 이전 기록에 자동으로 연결됩니다. 기기를 바꿔도 됩니다 — 별도 로그인은 필요 없습니다.
        </Note>
        {existing && !notMe ? (
          <Note tone="warn" icon="user-search" title="이미 쓰이고 있는 이름입니다" style={{ marginTop: 12 }}>
            "{existing.name}"님 기록이 이미 있습니다. 본인이 맞으면 이어서 들어가고, 아니면 다른 이름을 적어 주세요.
          </Note>
        ) : null}
        <Undecided>
          동명이인이 있을 때 구분하는 더 나은 방법(예: 학번 뒷자리)이 있는지는 팀이 확인해야 합니다. 지금은 이름만으로 구분합니다.
        </Undecided>
      </Body>
      <Dock>
        <Btn full size="lg" disabled={name.trim().length < 2} onClick={proceed} iconRight="arrow-right">다음</Btn>
      </Dock>
      <Sheet open={confirming} title="본인 확인" onClose={() => setConfirming(false)}>
        <p style={{ font: "400 14.5px/1.6 var(--font-sans)", color: "var(--txt)", margin: "0 0 16px", wordBreak: "keep-all", textWrap: "pretty" }}>
          <b>{existing ? existing.name : ""}</b>님이 맞으신가요? 맞으면 이전 기록(희망 역할·기여 기록 등)에 이어서 들어갑니다.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn full v="outline" onClick={() => { setConfirming(false); setNotMe(true); }}>아니요, 다른 사람이에요</Btn>
          <Btn full onClick={() => { setConfirming(false); go("mbti"); }}>네, 저예요</Btn>
        </div>
      </Sheet>
    </Phone>
  );
}

/* 3. MBTI 선택 그리드 + '내 MBTI를 몰라요 — 30초 컷' */
function ScrMbti({ go, mbti, setMbti }) {
  return (
    <Phone label="03 MBTI 선택">
      <Status />
      <Bar title="내 MBTI" sub="2 / 4단계" onBack={() => go("name")} />
      <Body dense>
        <Progress step={2} total={4} style={{ margin: "4px 0 18px" }} />
        <h1 style={{ font: "800 26px/1.3 var(--font-sans)", letterSpacing: "-.035em", color: "var(--txt-strong)", margin: "0 0 8px", wordBreak: "keep-all" }}>
          내 MBTI를 골라 주세요
        </h1>
        <p style={{ font: "400 15px/1.62 var(--font-sans)", color: "var(--txt)", margin: "0 0 16px", wordBreak: "keep-all", textWrap: "pretty" }}>
          찰떡 캐릭터를 받고, 팀원과 소통 방식을 맞추는 데 씁니다.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 7, marginBottom: 14 }}>
          {D.mbtiGrid.flat().map((t) => {
            const on = mbti === t;
            return (
              <button type="button" key={t} onClick={() => setMbti(t)} style={{
                minHeight: 52, borderRadius: 13, cursor: "pointer",
                font: (on ? "800" : "600") + " 14px/1 var(--font-mono)", letterSpacing: ".02em",
                color: on ? "var(--ink-900)" : "var(--txt)",
                ...(on ? { background: "var(--y-400)", border: "1.5px solid var(--y-600)" }
                       : { background: "var(--card)", border: "1px solid var(--line)" }),
              }}>{t}</button>
            );
          })}
        </div>
        <button type="button" onClick={() => go("quiz")} style={{
          width: "100%", minHeight: 56, borderRadius: 16, cursor: "pointer", textAlign: "left",
          background: "var(--c-100)", border: "1px solid transparent", padding: "12px 15px",
          display: "flex", alignItems: "center", gap: 11,
        }}>
          <span style={{ flex: "0 0 auto", color: "var(--c-700)", display: "inline-flex" }}><Icon name="wand-sparkles" size={19} /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", font: "700 15px/1.35 var(--font-sans)", color: "#8A3B29", wordBreak: "keep-all" }}>내 MBTI를 몰라요 — 30초 컷</span>
            <span style={{ display: "block", font: "500 13px/1.4 var(--font-sans)", color: "#A64B36", marginTop: 2 }}>팀플 상황 4문항으로 골라 보기</span>
          </span>
          <span style={{ flex: "0 0 auto", color: "var(--c-700)", display: "inline-flex" }}><Icon name="chevron-right" size={18} /></span>
        </button>
        <div style={{ marginTop: 14 }}>
          <Btn v="ghost" size="sm" onClick={() => go("role")} icon="skip-forward">MBTI 없이 계속하기</Btn>
        </div>
        <Note tone="info" icon="lock" style={{ marginTop: 10 }}>
          MBTI는 캐릭터 발급과 소통 방식 이해에만 씁니다. <b>역할 추천 계산에는 쓰지 않습니다.</b>
        </Note>
      </Body>
      <Dock>
        <Btn full size="lg" disabled={!mbti} onClick={() => go("char")} iconRight="arrow-right">
          {mbti ? mbti + " 로 계속" : "유형을 골라 주세요"}
        </Btn>
      </Dock>
    </Phone>
  );
}

/* 4. 30초 판별 — 기획안의 4문항 그대로 */
function ScrQuiz({ go, picks, setPick, result }) {
  const done = picks.filter(Boolean).length;
  return (
    <Phone label="04 30초 MBTI 판별">
      <Status />
      <Bar title="30초 컷" sub={done + " / 4문항"} onBack={() => go("mbti")} />
      <Body dense>
        <Progress step={done} total={4} style={{ margin: "4px 0 16px" }} />
        <p style={{ font: "400 14px/1.6 var(--font-sans)", color: "var(--txt-muted)", margin: "0 0 14px", wordBreak: "keep-all", textWrap: "pretty" }}>
          팀플 상황에서 더 가까운 쪽을 고르세요. 정답은 없고, 언제든 바꿀 수 있습니다.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {D.quiz.map((q, qi) => (
            <div key={q.axis}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 7 }}>
                <span style={{ font: "700 13px/1 var(--font-mono)", color: "var(--y-700)", letterSpacing: ".06em" }}>{q.axis}</span>
                <span style={{ font: "700 15px/1.35 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{q.label}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                {["a", "b"].map((k) => {
                  const on = picks[qi] === k;
                  return (
                    <button type="button" key={k} onClick={() => setPick(qi, k)} style={{
                      textAlign: "left", minHeight: 52, borderRadius: 14, cursor: "pointer", padding: "11px 14px",
                      display: "flex", alignItems: "center", gap: 11,
                      ...(on ? { background: "var(--y-100)", border: "1.5px solid var(--y-500)" }
                             : { background: "var(--card)", border: "1px solid var(--line)" }),
                    }}>
                      <span style={{
                        width: 21, height: 21, flex: "0 0 auto", borderRadius: 999, display: "grid", placeItems: "center",
                        background: on ? "var(--y-400)" : "transparent",
                        border: "1.5px solid " + (on ? "var(--y-600)" : "var(--line-strong)"), color: "var(--ink-900)",
                      }}>{on ? <Icon name="check" size={13} strokeWidth={3} /> : null}</span>
                      <span style={{ font: (on ? "600" : "400") + " 14.5px/1.5 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all", textWrap: "pretty" }}>{q[k]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <Undecided>
          이 4문항의 정확도나 검증 결과는 기획안에 없습니다. 결과 화면에서 <b>“정확한 진단”으로 표현하지 않았습니다.</b>
        </Undecided>
      </Body>
      <Dock>
        <Btn full size="lg" disabled={done < 4} onClick={() => go("char")} iconRight="arrow-right">
          {done < 4 ? "4문항을 모두 골라 주세요" : result + " 로 계속"}
        </Btn>
      </Dock>
    </Phone>
  );
}

/* 5. 캐릭터 발급 */
function ScrChar({ go, mbti, fromQuiz }) {
  return (
    <Phone label="05 캐릭터 발급">
      <Status tone="y" />
      <Body tone="y" pad={20}>
        <div style={{ textAlign: "center", padding: "22px 0 8px" }}>
          <div style={{ font: "600 13px/1.4 var(--font-sans)", color: "var(--y-700)", letterSpacing: ".06em", marginBottom: 14 }}>
            내 찰떡 캐릭터
          </div>
          <img src={"assets/characters/" + mbti + ".png"} alt={mbti + " 캐릭터"} style={{ width: 168, height: 168, objectFit: "contain", display: "block", margin: "0 auto", borderRadius: 24 }} />
          <div style={{ font: "800 25px/1.3 var(--font-sans)", letterSpacing: "-.035em", color: "var(--ink-900)", marginTop: 10, wordBreak: "keep-all" }}>내 캐릭터</div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "6px 13px", borderRadius: 999, background: "rgba(255,255,255,.7)" }}>
            <span style={{ font: "700 14px/1 var(--font-mono)", color: "var(--ink-800)", letterSpacing: ".04em" }}>{mbti}</span>
            {fromQuiz ? <span style={{ font: "500 13px/1 var(--font-sans)", color: "var(--ink-600)" }}>· 30초 컷 결과</span> : null}
          </div>
        </div>
        <Panel s="cream" pad={16} r={18} style={{ marginTop: 18 }}>
          <div style={{ font: "700 14px/1.4 var(--font-sans)", color: "var(--txt-strong)", marginBottom: 8 }}>16종 중 하나가 자동 배정됩니다</div>
          <p style={{ font: "400 14px/1.6 var(--font-sans)", color: "var(--txt)", margin: 0, wordBreak: "keep-all", textWrap: "pretty" }}>
            캐릭터는 팀원에게 나를 소개하는 표시입니다. 잘하는 일이나 맡을 역할을 뜻하지 않습니다.
          </p>
        </Panel>
        <Note tone="y" icon="check" style={{ marginTop: 12 }}>
          16종 캐릭터 이미지를 반영했습니다. 캐릭터별 고유 이름은 아직 제공되지 않아, 이름 대신 MBTI 유형명을 그대로 씁니다.
        </Note>
        {fromQuiz ? (
          <Note tone="y" icon="info" style={{ marginTop: 12 }}>
            30초 컷은 <b>간편 선택</b>입니다. 정식 검사 결과가 아니고, 언제든 직접 고쳐서 바꿀 수 있습니다.
          </Note>
        ) : null}
      </Body>
      <Dock>
        <Btn full size="lg" onClick={() => go("role")} iconRight="arrow-right">희망 역할 고르기</Btn>
        <Btn full v="ghost" onClick={() => go("mbti")}>유형 다시 고르기</Btn>
      </Dock>
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   6. 희망 역할 1순위 + Veto
   ══════════════════════════════════════════════════════════ */
function ScrRole({ go, want, setWant, veto, setVeto }) {
  const [mode, setMode] = React.useState("want");
  const picking = mode === "want" ? want : veto;
  const set = mode === "want" ? setWant : setVeto;
  return (
    <Phone label="06 희망 역할 · Veto">
      <Status />
      <Bar title="맡고 싶은 일" sub="4 / 4단계" onBack={() => go("char")} />
      <Body dense>
        <Progress step={4} total={4} style={{ margin: "4px 0 16px" }} />
        <h1 style={{ font: "800 24px/1.3 var(--font-sans)", letterSpacing: "-.035em", color: "var(--txt-strong)", margin: "0 0 8px", wordBreak: "keep-all" }}>
          같은 유형이어도 원하는 일은 다릅니다
        </h1>
        <p style={{ font: "400 15px/1.62 var(--font-sans)", color: "var(--txt)", margin: "0 0 16px", wordBreak: "keep-all", textWrap: "pretty" }}>
          1순위로 맡고 싶은 역할 하나와, 이번에는 피하고 싶은 역할 하나를 골라 주세요.
        </p>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, background: "var(--fill)", padding: 4, borderRadius: 13 }}>
          {[["want", "1순위 희망", want], ["veto", "피하고 싶음", veto]].map(([k, l, val]) => {
            const on = mode === k;
            return (
              <button type="button" key={k} onClick={() => setMode(k)} style={{
                flex: 1, minHeight: 44, borderRadius: 10, cursor: "pointer", border: "none",
                background: on ? "var(--card)" : "transparent", boxShadow: on ? "var(--sh-sm)" : "none",
                font: "700 13.5px/1.3 var(--font-sans)", color: on ? "var(--txt-strong)" : "var(--txt-muted)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}>
                {l}
                {val ? <span style={{ display: "inline-flex", color: k === "want" ? "var(--want)" : "var(--veto)" }}><Icon name="check" size={14} strokeWidth={3} /></span> : null}
              </button>
            );
          })}
        </div>
        <Rows>
          {D.roles.map((r) => {
            const isWant = want === r.key, isVeto = veto === r.key;
            const on = picking === r.key;
            const blocked = mode === "want" ? isVeto : isWant;
            return (
              <button type="button" key={r.key} disabled={blocked} onClick={() => set(on ? null : r.key)} style={{
                width: "100%", boxSizing: "border-box", textAlign: "left", background: on ? (mode === "want" ? "var(--ok-bg)" : "var(--err-bg)") : "transparent",
                border: "none", cursor: blocked ? "default" : "pointer", padding: "13px 15px", minHeight: 56,
                display: "flex", alignItems: "center", gap: 12, opacity: blocked ? .55 : 1,
              }}>
                <span style={{
                  width: 22, height: 22, flex: "0 0 auto", borderRadius: mode === "want" ? 999 : 7, display: "grid", placeItems: "center",
                  background: on ? (mode === "want" ? "var(--want)" : "var(--veto)") : "transparent",
                  border: "1.5px solid " + (on ? "transparent" : "var(--line-strong)"), color: "#fff",
                }}>{on ? <Icon name={mode === "want" ? "check" : "x"} size={13} strokeWidth={3} /> : null}</span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", font: "600 15px/1.4 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{r.name}</span>
                  <span style={{ display: "block", font: "400 13px/1.45 var(--font-sans)", color: "var(--txt-muted)", marginTop: 2, wordBreak: "keep-all" }}>{r.note}</span>
                </span>
                {isWant ? <Chip tone="want" icon="thumbs-up">희망</Chip> : null}
                {isVeto ? <Chip tone="veto" icon="hand">피함</Chip> : null}
              </button>
            );
          })}
        </Rows>
        <Note tone="info" icon="lock" style={{ marginTop: 12 }}>
          역할은 <b>희망·Veto·경험·가능한 시간</b>으로만 조율합니다. MBTI 유형은 배정 계산에 들어가지 않습니다.
        </Note>
      </Body>
      <Dock>
        <Btn full size="lg" disabled={!want} onClick={() => go("roster")} iconRight="arrow-right">
          {want ? "팀에 알리기" : "1순위 희망을 골라 주세요"}
        </Btn>
      </Dock>
    </Phone>
  );
}

/* 7. 팀 역할 조율 현황 — 상단: 역할별 현황 / 하단: 팀원별 선호 */
function ScrRoster({ go, want, veto, name, tab, setTab, onOpenDm }) {
  const [sheet, setSheet] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const [resolve, setResolve] = React.useState({});
  const [rejected, setRejected] = React.useState({});
  const roleName = (k) => (D.roles.find((r) => r.key === k) || {}).name || "미정";
  const roster = D.roster.map((m) => m.me ? { ...m, name: name || m.name, want, veto } : m);
  const counts = {};
  roster.forEach((m) => { if (m.want) counts[m.want] = (counts[m.want] || 0) + 1; });
  const clashAll = Object.entries(counts).filter(([, n]) => n > 1).map(([k]) => k);
  const clash = clashAll.filter((k) => !resolve[k]?.accepted);
  const runLottery = (key, tool) => {
    const excluded = rejected[key] || [];
    const full = roster.filter((m) => m.want === key);
    const pool = full.filter((m) => !excluded.includes(m.name));
    const cands = pool.length ? pool : full;
    const winner = cands[Math.floor(Math.random() * cands.length)];
    setResolve((r) => ({ ...r, [key]: { tool: tool.name, winner: winner.name, accepted: false } }));
    setSheet(null);
    setToast(tool.name + " 결과를 " + winner.name + "님에게 보냈습니다 — 수락 대기");
  };
  const accept = (key) => { setResolve((r) => ({ ...r, [key]: { ...r[key], accepted: true } })); setToast("확정되었습니다"); };
  const reject = (key) => {
    const cur = resolve[key];
    if (!cur) return;
    setRejected((r) => ({ ...r, [key]: [...(r[key] || []), cur.winner] }));
    setResolve((r) => { const c = { ...r }; delete c[key]; return c; });
    setToast(cur.winner + "님을 다음 추첨에서 제외합니다 — 다시 추첨해 주세요");
  };

  return (
    <Phone label="07 팀 역할 조율">
      <Status />
      <Bar title="역할 조율" sub={D.team.name} action="user-plus" />
      <Body dense>
        <SecTitle note="희망자 수와 조율 상태입니다">역할별 현황</SecTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {D.roles.map((r) => {
            const wanters = roster.filter((m) => m.want === r.key);
            const res = resolve[r.key];
            const isClash = wanters.length > 1;
            const statusLabel = wanters.length === 0 ? "미정" : res?.accepted ? "확정" : isClash ? "협의 중" : "확정 예정";
            const statusTone = wanters.length === 0 ? "n" : res?.accepted ? "ok" : isClash ? "warn" : "n";
            return (
              <Panel key={r.key} s={isClash && !res?.accepted ? "coral" : "card"} pad={14} r={16}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ font: "700 15px/1.4 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{r.name}</span>
                  <Chip tone={statusTone} icon={statusLabel === "확정" ? "check" : statusLabel === "협의 중" ? "circle-alert" : statusLabel === "미정" ? "circle-dashed" : "clock"}>{statusLabel}</Chip>
                </div>
                <div style={{ font: "500 13px/1.5 var(--font-sans)", color: "var(--txt-muted)", marginTop: 4, wordBreak: "keep-all" }}>
                  {wanters.length === 0 ? "아무도 1순위로 고르지 않았습니다" : "희망자 " + wanters.length + "명 · " + wanters.map((m) => m.name).join(" · ") + (isClash ? " · 제외 조건 적용" : "")}
                </div>
                {isClash ? (
                  !res ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                      <Btn size="sm" icon="messages-square" onClick={() => setToast("팀 채팅에 조율 안내를 올렸습니다")}>이야기해서 정하기</Btn>
                      <Btn size="sm" v="outline" icon="dices" onClick={() => setSheet(r.key)}>협의가 안 되면 추첨하기</Btn>
                    </div>
                  ) : !res.accepted ? (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                        <Chip tone="warn" icon="circle-dashed">{res.tool} 결과 · {res.winner}님에게 후보 확인 요청</Chip>
                        {(rejected[r.key] || []).map((n) => <Chip key={n} tone="err" icon="x">{n} 제외됨</Chip>)}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                        <Btn size="sm" icon="check" onClick={() => accept(r.key)}>{res.winner}님이 수락</Btn>
                        <Btn size="sm" v="ghost" icon="x" onClick={() => reject(r.key)}>{res.winner}님이 거절</Btn>
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}><Chip tone="ok" icon="check">확정 · {res.winner}</Chip></div>
                  )
                ) : null}
              </Panel>
            );
          })}
        </div>
        <Note tone="info" icon="list-ordered" style={{ marginBottom: 20 }}>
          조율 순서: <b>선호 확인 → 협의 → (필요하면) 추첨 → 당사자 수락 → 최종 확정</b>. 거절은 오류가 아니라 남은 후보끼리 다시 추첨하는 정상 절차입니다. 이 과정 어디에도 MBTI는 쓰이지 않습니다.
        </Note>

        <SecTitle note="각자 본인이 직접 고른 값입니다 · 아바타를 누르면 1:1 대화가 열립니다">팀원별 선호</SecTitle>
        <Rows>
          {roster.map((m) => (
            <div key={m.name} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "13px 15px", minHeight: 56 }}>
              <button type="button" onClick={() => !m.me && onOpenDm && onOpenDm(m.name)} disabled={m.me} aria-label={m.me ? undefined : m.name + "님과 대화하기"} style={{ background: "none", border: "none", padding: 0, cursor: m.me ? "default" : "pointer", flex: "0 0 auto" }}>
                <Avatar name={m.name} mbti={m.mbti} size={38} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ font: "700 15px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>{m.name}</span>
                  {m.me ? <span style={{ font: "600 13px/1.4 var(--font-sans)", color: "var(--y-700)" }}>나</span> : null}
                </div>
                {m.want ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                    <Chip tone="want" icon="thumbs-up">희망 · {roleName(m.want)}</Chip>
                    {m.veto ? <Chip tone="veto" icon="hand">피함 · {roleName(m.veto)}</Chip> : null}
                  </div>
                ) : (
                  <div style={{ marginTop: 6 }}><Chip icon="circle-dashed">아직 고르지 않음</Chip></div>
                )}
              </div>
            </div>
          ))}
        </Rows>
      </Body>
      <Sheet open={!!sheet} title="추첨 방식 고르기" onClose={() => setSheet(null)}>
        <p style={{ font: "400 14.5px/1.6 var(--font-sans)", color: "var(--txt)", margin: "0 0 14px", wordBreak: "keep-all", textWrap: "pretty" }}>
          결과는 <b>바로 확정되지 않습니다.</b> 배정된 사람이 수락해야 최종 확정됩니다. Veto로 고른 사람은 추첨 대상에서 뺍니다.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
          {D.randomTools.map((t) => (
            <button type="button" key={t.key} onClick={() => runLottery(sheet, t)} style={{
              minHeight: 84, borderRadius: 16, cursor: "pointer", background: "var(--card)",
              border: "1px solid var(--line)", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 7, color: "var(--txt-strong)",
            }}>
              <Icon name={t.icon} size={24} />
              <span style={{ font: "700 14px/1 var(--font-sans)" }}>{t.name}</span>
            </button>
          ))}
        </div>
      </Sheet>
      <Toast msg={toast} />
      <TabBar value={tab} onChange={setTab} pending={{ team: clash.length || undefined }} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   8. 내 가능한 시간 입력 — 수업·아르바이트·시험
   ══════════════════════════════════════════════════════════ */
function ScrMyTime({ go, tab, setTab }) {
  const [kind, setKind] = React.useState("class");
  const [blocks, setBlocks] = React.useState(D.myBlocks);
  const [view, setView] = React.useState("grid");
  const [pickDay, setPickDay] = React.useState(0);
  const [pickStart, setPickStart] = React.useState(1);
  const [pickLen, setPickLen] = React.useState(2);
  const has = (di, hi) => blocks.find((b) => b[0] === di && hi >= b[1] && hi < b[1] + b[2]);
  const toggle = (di, hi) => {
    const f = has(di, hi);
    if (f) setBlocks(blocks.filter((b) => b !== f));
    else setBlocks([...blocks, [di, hi, 1, kind]]);
  };
  const addListBlock = () => setBlocks([...blocks, [pickDay, pickStart, pickLen, kind]]);
  const removeBlock = (b) => setBlocks(blocks.filter((x) => x !== b));
  const kindOf = (k) => D.blockKinds.find((b) => b.key === k) || D.blockKinds[0];
  const filled = blocks.reduce((s, b) => s + b[2], 0);

  return (
    <Phone label="08 내 가능한 시간">
      <Status />
      <Bar title="내 시간표" sub="안 되는 시간만 표시" action="check" />
      <Body dense>
        <p style={{ font: "400 14.5px/1.6 var(--font-sans)", color: "var(--txt)", margin: "0 0 12px", wordBreak: "keep-all", textWrap: "pretty" }}>
          <b>안 되는 시간</b>을 표시해 주세요. 표시하지 않은 시간은 가능한 시간으로 봅니다.
        </p>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["grid", "주간 격자", "layout-grid"], ["list", "목록으로 담기", "list"]].map(([k, l, ic]) => {
            const on = view === k;
            return (
              <button type="button" key={k} onClick={() => setView(k)} style={{
                flex: 1, minHeight: 40, borderRadius: 12, cursor: "pointer", display: "inline-flex",
                alignItems: "center", justifyContent: "center", gap: 6, font: "700 13px/1 var(--font-sans)",
                background: on ? "var(--ink-700)" : "var(--card)", color: on ? "var(--on-action)" : "var(--txt)",
                border: "1px solid " + (on ? "transparent" : "var(--line)"),
              }}><Icon name={ic} size={14} />{l}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto" }} data-scrollrow="1">
          {D.blockKinds.map((b) => {
            const on = kind === b.key;
            return (
              <button type="button" key={b.key} onClick={() => setKind(b.key)} style={{
                minHeight: 44, flex: "0 0 auto", padding: "0 13px", borderRadius: 12, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
                font: "700 13.5px/1 var(--font-sans)",
                ...(on ? { background: "var(--ink-700)", color: "var(--on-action)", border: "1px solid transparent" }
                       : { background: "var(--card)", color: "var(--txt)", border: "1px solid var(--line)" }),
              }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: on ? "var(--y-400)" : b.color }} />{b.name}
              </button>
            );
          })}
        </div>
        {view === "grid" ? (
          <Panel s="card" pad={12} r={16} style={{ marginBottom: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "26px repeat(5,minmax(0,1fr))", gap: 3 }}>
              <span />
              {D.days.map((d) => (
                <span key={d} style={{ font: "700 13px/1 var(--font-sans)", color: "var(--txt-muted)", textAlign: "center", paddingBottom: 6 }}>{d}</span>
              ))}
              {D.hours.map((h, hi) => (
                <React.Fragment key={h}>
                  <span style={{ font: "500 11.5px/1 var(--font-mono)", color: "var(--txt-faint)", textAlign: "right", paddingRight: 4, paddingTop: 9 }}>{h}</span>
                  {D.days.map((d, di) => {
                    const b = has(di, hi);
                    return (
                      <button type="button" key={d + h} onClick={() => toggle(di, hi)} aria-label={d + " " + h + "시"} style={{
                        height: 30, borderRadius: 6, cursor: "pointer", border: "none", padding: 0,
                        background: b ? kindOf(b[3]).color : "var(--cr-100)",
                      }} />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </Panel>
        ) : (
          <React.Fragment>
            <Panel s="card" pad={14} r={16} style={{ marginBottom: 12 }}>
              <div style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginBottom: 8 }}>요일 선택</div>
              <div style={{ display: "flex", gap: 5, marginBottom: 12 }}>
                {D.days.map((d, di) => (
                  <button type="button" key={d} onClick={() => setPickDay(di)} style={{
                    flex: 1, minHeight: 40, borderRadius: 10, cursor: "pointer", font: "700 13px/1 var(--font-sans)",
                    background: pickDay === di ? "var(--y-400)" : "var(--fill)", color: pickDay === di ? "var(--ink-900)" : "var(--txt)",
                    border: "none",
                  }}>{d}</button>
                ))}
              </div>
              <div style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginBottom: 8 }}>시작 시간</div>
              <div style={{ display: "flex", gap: 5, marginBottom: 12, overflowX: "auto" }} data-scrollrow="1">
                {D.hours.map((h, hi) => (
                  <button type="button" key={h} onClick={() => setPickStart(hi)} style={{
                    minHeight: 40, flex: "0 0 auto", padding: "0 12px", borderRadius: 10, cursor: "pointer",
                    font: "700 13px/1 var(--font-mono)",
                    background: pickStart === hi ? "var(--y-400)" : "var(--fill)", color: pickStart === hi ? "var(--ink-900)" : "var(--txt)",
                    border: "none",
                  }}>{h}시</button>
                ))}
              </div>
              <div style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginBottom: 8 }}>길이</div>
              <div style={{ display: "flex", gap: 5 }}>
                {[1, 2, 3, 4].map((n) => (
                  <button type="button" key={n} onClick={() => setPickLen(n)} style={{
                    minHeight: 40, flex: 1, borderRadius: 10, cursor: "pointer", font: "700 13px/1 var(--font-sans)",
                    background: pickLen === n ? "var(--y-400)" : "var(--fill)", color: pickLen === n ? "var(--ink-900)" : "var(--txt)",
                    border: "none",
                  }}>{n}시간</button>
                ))}
              </div>
            </Panel>
            <Btn full icon="plus" onClick={addListBlock} style={{ marginBottom: 14 }}>
              {D.days[pickDay]} {D.hours[pickStart]}시부터 {pickLen}시간 추가
            </Btn>
            <SecTitle note="눌러서 지울 수 있습니다">등록한 불가 시간 {blocks.length}건</SecTitle>
            <Rows>
              {blocks.map((b, i) => (
                <button type="button" key={i} onClick={() => removeBlock(b)} style={{
                  width: "100%", boxSizing: "border-box", textAlign: "left", background: "none", border: "none",
                  cursor: "pointer", padding: "12px 15px", minHeight: 48, display: "flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: kindOf(b[3]).color, flex: "0 0 auto" }} />
                  <span style={{ flex: 1, minWidth: 0, font: "600 14px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>
                    {D.days[b[0]]} {D.hours[b[1]]}시~{Number(D.hours[b[1]]) + b[2]}시 · {kindOf(b[3]).name}
                  </span>
                  <Icon name="x" size={15} style={{ color: "var(--txt-faint)" }} />
                </button>
              ))}
            </Rows>
          </React.Fragment>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12, marginBottom: 12 }}>
          {D.blockKinds.map((b) => (
            <span key={b.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "600 13px/1.4 var(--font-sans)", color: "var(--txt-muted)" }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: b.color }} />{b.name}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, font: "600 13px/1.4 var(--font-sans)", color: "var(--txt-muted)" }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--cr-100)", border: "1px solid var(--line)" }} />가능
          </span>
        </div>
        <Note tone="info" icon="users-round">
          팀원에게는 <b>가능 / 불가</b>만 보입니다. 수업명, 근무지, 시험 과목은 공유되지 않습니다.
        </Note>
        <Undecided>
          주간 격자의 30px 칸은 최소 탭 영역 44px의 유일한 예외입니다. 손이 작거나 확대 설정을 쓰는 사람은 <b>목록으로 담기</b>로 같은 작업을 44px 이상 버튼으로 할 수 있습니다.
        </Undecided>
      </Body>
      <Dock above={76}>
        <Btn full size="lg" onClick={() => go("slots")} iconRight="arrow-right">{filled}칸 저장하고 회의 시간 보기</Btn>
      </Dock>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* 9. 회의 시간 추천 */
function ScrSlots({ go, tab, setTab, empty }) {
  const [picked, setPicked] = React.useState(null);
  const [stage, setStage] = React.useState(null); // null | "proposed" | "confirmed" | "objected"
  const [carried, setCarried] = React.useState(false);
  const [toast, setToast] = React.useState(null);
  const list = empty ? D.noSlotAlt : D.slots;
  const propose = () => { setStage("proposed"); setToast("팀원 3명에게 확인 요청을 보냈습니다"); };
  return (
    <Phone label={empty ? "10 전원 가능 시간 없음" : "09 회의 시간 추천"}>
      <Status />
      <Bar title="회의 시간" sub={D.team.name} onBack={() => go("mytime")} action="settings-2" />
      <Body dense>
        <Panel s="fill" pad={14} r={16} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Chip tone="ok" icon="check">4명 시간표 제출</Chip>
            <Chip tone={empty ? "warn" : "ok"} icon={empty ? "user-minus" : "check"}>{empty ? "3명 참석 가능" : "4명 참석 가능"}</Chip>
          </div>
        </Panel>

        {carried ? (
          <Panel s="yellow" pad={18} r={18} style={{ textAlign: "center" }}>
            <div style={{ display: "inline-flex", width: 44, height: 44, borderRadius: 999, background: "rgba(255,255,255,.75)", color: "var(--y-700)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Icon name="calendar-arrow-up" size={20} />
            </div>
            <div style={{ font: "800 16px/1.4 var(--font-sans)", color: "var(--ink-900)" }}>다음 주로 이월했습니다</div>
            <div style={{ font: "500 13px/1.5 var(--font-sans)", color: "var(--y-700)", marginTop: 4 }}>이번 주 회의는 열리지 않습니다</div>
          </Panel>
        ) : stage === "confirmed" ? (
          <Panel s="yellow" pad={18} r={18} style={{ textAlign: "center" }}>
            <div style={{ display: "inline-flex", width: 44, height: 44, borderRadius: 999, background: "rgba(255,255,255,.75)", color: "var(--y-700)", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
              <Icon name="calendar-check" size={20} />
            </div>
            <div style={{ font: "800 16px/1.4 var(--font-sans)", color: "var(--ink-900)" }}>{list[picked].day} {list[picked].time} · 60분으로 확정</div>
            <div style={{ font: "500 13px/1.5 var(--font-sans)", color: "var(--y-700)", marginTop: 4 }}>응답 마감까지 반대가 없어 동의로 자동 확정됐습니다</div>
          </Panel>
        ) : stage === "proposed" ? (
          <React.Fragment>
            <Panel s="card" pad={16} r={18} style={{ marginBottom: 12 }}>
              <div style={{ font: "800 18px/1.35 var(--font-sans)", color: "var(--txt-strong)" }}>{list[picked].day} {list[picked].time}</div>
              <div style={{ font: "600 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginTop: 3 }}>60분 · 제안 대기 중 · 응답 마감 9/18 15:00</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                <Chip tone="ok" icon="check">동의 2명</Chip>
                <Chip tone="warn" icon="circle-dashed">미응답 2명</Chip>
                <Chip icon="x">반대 0명</Chip>
              </div>
            </Panel>
            <Note tone="warn" icon="clock" title="응답 마감까지 반대가 없으면 자동 확정됩니다">
              특정 한 사람이 확정하지 않습니다 — 누구나 반대하면 확정되지 않습니다.
            </Note>
            <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
              <Btn size="sm" icon="check" onClick={() => setStage("confirmed")}>동의하기 (마감 시뮬레이션)</Btn>
              <Btn size="sm" v="outline" icon="x" onClick={() => { setStage(null); setToast("반대가 있어 확정되지 않았습니다"); }}>참석 어려움 알리기</Btn>
            </div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            {empty ? (
              <React.Fragment>
                <Note tone="warn" icon="calendar-x" title="이번 주에 전원 가능한 시간이 없습니다" style={{ marginBottom: 12 }}>
                  시험 기간과 아르바이트가 겹쳐 4명 모두 되는 시간을 찾지 못했습니다.
                </Note>
                <Note tone="info" icon="list-ordered" style={{ marginBottom: 12 }}>
                  정책: 전원 가능한 시간이 없으면 <b>최다 인원이 가능한 시간</b>을 후보로 보이고, 빠진 사람에게는
                  회의 전 <b>비대면으로 의견을 남길 기회</b>를 요청합니다. 다음 주로 넘기는 것은 팀이 버튼으로 직접 정합니다.
                </Note>
                <SecTitle style={{ marginTop: 4 }} note="빠진 사람과 사유를 함께 표시합니다">3명 가능한 시간</SecTitle>
              </React.Fragment>
            ) : (
              <SecTitle note="모두의 수업·아르바이트·시험 기간을 뺀 결과입니다">모두 가능한 시간</SecTitle>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {list.map((s, i) => {
                const on = picked === i;
                const all = s.ok === s.of;
                return (
                  <button type="button" key={s.day + s.time} onClick={() => setPicked(i)} style={{
                    width: "100%", boxSizing: "border-box", textAlign: "left", borderRadius: 18, cursor: "pointer",
                    padding: "14px 16px", display: "flex", alignItems: "center", gap: 13,
                    ...(on ? { background: "var(--y-100)", border: "1.5px solid var(--y-500)" }
                           : { background: "var(--card)", border: "1px solid var(--line)" }),
                  }}>
                    <span style={{
                      width: 44, height: 44, flex: "0 0 auto", borderRadius: 13, display: "grid", placeItems: "center",
                      background: on ? "var(--y-400)" : "var(--fill)",
                    }}>
                      <span style={{ font: "800 17px/1 var(--font-sans)", color: "var(--ink-900)" }}>{s.day}</span>
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", font: "700 16px/1.35 var(--font-mono)", color: "var(--txt-strong)" }}>{s.time}</span>
                      <span style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 5 }}>
                        <Chip tone={all ? "ok" : "warn"} icon={all ? "check" : "user-minus"}>{s.ok} / {s.of}명 가능</Chip>
                        {s.why ? <Chip icon="info">{s.why}</Chip> : null}
                      </span>
                    </span>
                    {on ? <span style={{ display: "inline-flex", color: "var(--y-700)", flex: "0 0 auto" }}><Icon name="circle-check" size={21} /></span> : null}
                  </button>
                );
              })}
            </div>

            <Note tone="info" icon="list-ordered" style={{ marginTop: 14 }}>
              정책(P0 확정안): 기본 회의 길이는 <b>1시간</b>. 후보 중 하나를 제안하면 <b>24시간 동안 반대가 없으면 자동 확정</b>되고, 반대가 있으면 확정되지 않습니다. 특정 한 사람이 단독으로 확정하지 않습니다.
            </Note>

            <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 7 }}>
              {empty ? <Btn v="outline" size="sm" icon="user-round" onClick={() => setToast("빠진 팀원에게 비대면 의견 요청을 보냈습니다")}>비대면 참여 요청 보내기</Btn> : null}
              {empty ? <Btn v="ghost" size="sm" icon="arrow-right" onClick={() => setCarried(true)}>다음 주로 이월 확정하기</Btn> : null}
              <Btn v="ghost" size="sm" icon="calendar-search" onClick={() => go(empty ? "slots" : "slotsEmpty")}>
                {empty ? "이번 주 후보 다시 보기" : "전원 불가한 주는 어떻게 보이나요"}
              </Btn>
            </div>
          </React.Fragment>
        )}
      </Body>
      {!carried && stage !== "confirmed" && stage !== "proposed" ? (
        <Dock above={76}>
          <Btn full size="lg" disabled={picked === null} onClick={propose} icon="calendar-check">
            {picked === null ? "시간을 골라 주세요" : list[picked].day + " " + list[picked].time + " 로 제안"}
          </Btn>
        </Dock>
      ) : null}
      <Toast msg={toast} />
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   11. 홈 — 프로젝트·마감 → 내 확인이 필요한 일 → 가까운 회의 → 최근 자료·업무 → AI 도구 바로가기
   ══════════════════════════════════════════════════════════ */
function ScrHome({ go, name, tab, setTab }) {
  const needsMe = [
    { k: "roster", icon: "hand", tone: "c-100", fg: "c-700", title: "발표 역할 제안 확인", note: "자료조사 · 2명 겹침" },
    { k: "slots", icon: "calendar-clock", tone: "y-200", fg: "y-700", title: "목요일 회의 제안에 응답", note: "제안 대기 중 · 응답 마감 9/18 15:00" },
  ];
  return (
    <Phone label="11 홈">
      <Status />
      <Bar tone="y" title={D.team.name} sub={D.team.dday} action="bell" />
      <Body dense>
        <SecTitle note={needsMe.length + "건이 처리를 기다리고 있습니다"}>내 확인이 필요한 일</SecTitle>
        <Rows style={{ marginBottom: 18 }}>
          {needsMe.map((n) => (
            <button type="button" key={n.k} onClick={() => go(n.k)} style={{ width: "100%", boxSizing: "border-box", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "14px 15px", minHeight: 56, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 38, height: 38, flex: "0 0 auto", borderRadius: 12, background: "var(--" + n.tone + ")", display: "grid", placeItems: "center", color: "var(--" + n.fg + ")" }}><Icon name={n.icon} size={19} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "600 15px/1.4 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{n.title}</span>
                <span style={{ display: "block", font: "500 13px/1.45 var(--font-sans)", color: "var(--txt-muted)", marginTop: 2, wordBreak: "keep-all" }}>{n.note}</span>
              </span>
              <Icon name="chevron-right" size={17} />
            </button>
          ))}
        </Rows>

        <SecTitle note="응답이 확정되면 여기 표시가 바뀝니다">가까운 일정</SecTitle>
        <Panel s="fill" pad={14} r={16} style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", color: "var(--txt-muted)" }}><Icon name="calendar-clock" size={17} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "700 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>목요일 15:00~16:00</span>
              <span style={{ display: "block", font: "500 12.5px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginTop: 2 }}>제안 대기 중 · 동의 2명 / 미응답 2명</span>
            </span>
          </div>
        </Panel>

        <SecTitle note="드라이브에서 방금 바뀐 것">최근 자료·업무</SecTitle>
        <Rows style={{ marginBottom: 18 }}>
          <button type="button" onClick={() => go("versions")} style={{ width: "100%", boxSizing: "border-box", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "13px 15px", minHeight: 52, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 34, height: 34, flex: "0 0 auto", borderRadius: 11, background: "var(--fill)", display: "grid", placeItems: "center", color: "var(--txt-muted)" }}><Icon name="file-check-2" size={17} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "600 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>발표자료 v4</span>
              <span style={{ display: "block", font: "500 13px/1.45 var(--font-sans)", color: "var(--txt-muted)", marginTop: 2 }}>어제 수정 · 이서연</span>
            </span>
            <Icon name="chevron-right" size={16} />
          </button>
          <button type="button" onClick={() => go("tasks")} style={{ width: "100%", boxSizing: "border-box", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "13px 15px", minHeight: 52, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 34, height: 34, flex: "0 0 auto", borderRadius: 11, background: "var(--fill)", display: "grid", placeItems: "center", color: "var(--txt-muted)" }}><Icon name="list-checks" size={17} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "600 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>할 일 · 체크리스트</span>
              <span style={{ display: "block", font: "500 13px/1.45 var(--font-sans)", color: "var(--txt-muted)", marginTop: 2 }}>3건 남음</span>
            </span>
            <Icon name="chevron-right" size={16} />
          </button>
        </Rows>

        <SecTitle note="채팅·일정·팀 탭에는 없는 자리">AI 도구 바로가기</SecTitle>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {D.aiTools.slice(0, 4).map((t) => (
            <button type="button" key={t.key} onClick={() => go("ai")} style={{
              flex: "1 1 100px", minHeight: 68, borderRadius: 16, cursor: "pointer",
              background: "var(--card)", border: "1px solid var(--line)", padding: "10px 12px",
              display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6,
            }}>
              <Icon name={t.icon} size={17} style={{ color: "var(--info)" }} />
              <span style={{ font: "700 12.5px/1.3 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{t.name}</span>
            </button>
          ))}
        </div>
      </Body>
      <TabBar value={tab} onChange={setTab} pending={{ team: needsMe.length }} />
    </Phone>
  );
}

Object.assign(window, { ScrInvite, ScrName, ScrMbti, ScrQuiz, ScrChar, ScrRole, ScrRoster, ScrMyTime, ScrSlots, ScrHome });
