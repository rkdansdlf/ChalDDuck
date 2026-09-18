const D2 = window.CD3;
const Icon = window.Icon;

/* ══════════════════════════════════════════════════════════
   12. 드라이브 — 역할별 제출함
   ══════════════════════════════════════════════════════════ */
function ScrDrive({ go, tab, setTab }) {
  const roleName = (k) => (D2.roles.find((r) => r.key === k) || {}).name || k;
  return (
    <Phone label="12 드라이브">
      <Status />
      <Bar title="드라이브" sub={D2.team.name} action="upload" />
      <Body dense>
        <SecTitle note="맡은 역할대로 칸이 나뉘어 있습니다">역할별 제출함</SecTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 18 }}>
          {D2.boxes.map((b) => {
            const empty = b.state === "empty";
            return (
              <button type="button" key={b.role} onClick={() => go("versions")} style={{
                width: "100%", boxSizing: "border-box", textAlign: "left", borderRadius: 18, cursor: "pointer",
                background: "var(--card)", border: "1px solid var(--line)", padding: "14px 15px",
                display: "flex", alignItems: "center", gap: 12, minHeight: 56,
              }}>
                <span style={{
                  width: 40, height: 40, flex: "0 0 auto", borderRadius: 13, display: "grid", placeItems: "center",
                  background: empty ? "var(--fill)" : "var(--y-200)", color: empty ? "var(--txt-faint)" : "var(--y-700)",
                }}><Icon name={empty ? "folder" : "folder-open"} size={19} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", font: "700 15px/1.4 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{b.name}</span>
                  <span style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                    <Chip icon="user-round">{b.owner}</Chip>
                    {empty ? <StatusBadge status="none">아직 없음</StatusBadge> : <Chip tone="ok" icon="file">{b.files}개</Chip>}
                    <Chip tone="warn" icon="calendar-clock">{b.due} 마감</Chip>
                    {b.late ? <StatusBadge status="late" /> : null}
                  </span>
                </span>
                <Icon name="chevron-right" size={17} />
              </button>
            );
          })}
        </div>
        <Note tone="info" icon="history" title="올린 파일은 지워지지 않습니다">
          같은 이름으로 다시 올리면 새 버전이 쌓입니다. 이전 버전은 언제든 다시 내려받을 수 있어, 덮어쓰기로 작업이 사라지지 않습니다.
        </Note>
        <Note tone="info" icon="database" title="드라이브 이용 제한 (P0 확정안)" style={{ marginTop: 10 }}>
          팀당 저장 용량 <b>{D2.driveLimits.usedGB}GB / {D2.driveLimits.capGB}GB</b> 사용 중. 허용 파일 형식은 {D2.driveLimits.types.join("·")}입니다. 마감 후에도 제출함은 잠그지 않고, 마감을 지난 파일에는 "마감 후 제출" 라벨이 자동으로 붙습니다.
        </Note>
      </Body>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* 13. 버전 기록 */
function ScrVersions({ go, tab, setTab, versions, onOpen }) {
  const [toast, setToast] = React.useState(null);
  const list = versions || D2.versions;
  const latest = list.find((f) => f.latest) || list[0];
  return (
    <Phone label="13 파일 버전 기록">
      <Status />
      <Bar title="발표 자료.pptx" sub="PPT 템플릿 제출함" onBack={() => go("drive")} action="download" />
      <Body dense>
        <Panel s="yellow" pad={14} r={16} style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <span style={{ width: 38, height: 38, flex: "0 0 auto", borderRadius: 12, background: "rgba(255,255,255,.75)", display: "grid", placeItems: "center", color: "var(--y-700)" }}>
              <Icon name="file-check-2" size={19} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", font: "700 15px/1.35 var(--font-sans)", color: "var(--ink-900)" }}>최신 버전은 {latest.v}</span>
              <span style={{ display: "block", font: "500 13px/1.4 var(--font-sans)", color: "var(--y-700)", marginTop: 2 }}>{latest.who} · {latest.when}</span>
            </span>
          </div>
        </Panel>
        <SecTitle note="누가 언제 무엇을 바꿨는지 남습니다">버전 {list.length}개</SecTitle>
        <Rows>
          {list.map((f) => (
            <div key={f.v} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "13px 15px", minHeight: 56 }}>
              <span style={{
                minWidth: 38, height: 26, flex: "0 0 auto", marginTop: 2, borderRadius: 8, display: "grid", placeItems: "center",
                background: f.latest ? "var(--ink-700)" : "var(--fill)", color: f.latest ? "var(--on-action)" : "var(--txt-muted)",
                font: "700 13px/1 var(--font-mono)",
              }}>{f.v}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "500 14.5px/1.5 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all", textWrap: "pretty" }}>{f.note}</span>
                <span style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
                  <span style={{ font: "500 13px/1.45 var(--font-sans)", color: "var(--txt-muted)" }}>{f.who} · {f.when} · {f.size}</span>
                  {f.latest ? <StatusBadge status="done">최신 버전</StatusBadge> : null}
                </span>
              </span>
              <button type="button" onClick={() => onOpen && onOpen(f.v)} aria-label={f.v + " 열기"} style={{
                width: 44, height: 44, flex: "0 0 auto", display: "grid", placeItems: "center", background: "none",
                border: "none", cursor: "pointer", color: "var(--txt-muted)", borderRadius: 12,
              }}><Icon name="eye" size={17} /></button>
              <button type="button" onClick={() => setToast(f.v + " 를 내려받습니다")} aria-label={f.v + " 내려받기"} style={{
                width: 44, height: 44, flex: "0 0 auto", display: "grid", placeItems: "center", background: "none",
                border: "none", cursor: "pointer", color: "var(--txt-muted)", borderRadius: 12,
              }}><Icon name="download" size={17} /></button>
            </div>
          ))}
        </Rows>
        <Note tone="info" icon="clipboard-list" style={{ marginTop: 14 }}>
          이 기록은 <b>기여도 리포트의 근거</b>로도 쓰입니다. 본인 확인을 거친 항목만 리포트에 올라갑니다.
        </Note>
      </Body>
      <Toast msg={toast} />
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   14. AI 도구 허브
   ══════════════════════════════════════════════════════════ */
function ScrAi({ go, tab, setTab }) {
  const [toast, setToast] = React.useState(null);
  return (
    <Phone label="14 AI 도구">
      <Status />
      <Bar title="AI 도구" sub="팀플에 필요한 만큼만" />
      <Body dense>
        <div style={{ display: "flex", flexDirection: "column", gap: 9, marginBottom: 16 }}>
          {D2.aiTools.map((t) => (
            <button type="button" key={t.key} disabled={!t.ready} onClick={() => {
              if (t.key === "cushion") go("cushion");
              else if (t.key === "clerk") go("clerk");
              else if (t.key === "research") go("researcher");
              else if (t.key === "present") go("present2");
              else if (t.key === "sentence") go("sentence");
            }} style={{
              width: "100%", boxSizing: "border-box", textAlign: "left", borderRadius: 18,
              cursor: t.ready ? "pointer" : "default", padding: "14px 15px", minHeight: 56,
              background: t.ready ? "var(--card)" : "var(--fill)",
              border: "1px solid " + (t.ready ? "var(--line)" : "transparent"),
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{
                width: 40, height: 40, flex: "0 0 auto", borderRadius: 13, display: "grid", placeItems: "center",
                background: t.ready ? "var(--c-100)" : "transparent", color: t.ready ? "var(--c-700)" : "var(--txt-faint)",
              }}><Icon name={t.icon} size={19} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", font: "700 15px/1.4 var(--font-sans)", color: t.ready ? "var(--txt-strong)" : "var(--txt-muted)", wordBreak: "keep-all" }}>{t.name}</span>
                <span style={{ display: "block", font: "400 13.5px/1.5 var(--font-sans)", color: "var(--txt-muted)", marginTop: 3, wordBreak: "keep-all", textWrap: "pretty" }}>{t.note}</span>
              </span>
              {t.ready ? <Icon name="chevron-right" size={17} /> : <Chip icon="circle-dashed">준비 중</Chip>}
            </button>
          ))}
        </div>
        <Note tone="info" icon="shield" title="AI가 대신 결정하지 않습니다">
          도구는 <b>초안만</b> 만듭니다. 팀에 보낼지, 어떻게 고칠지는 사람이 정합니다. 보내기 전 항상 원문과 나란히 보여줍니다.
        </Note>
        <Note tone="info" icon="database" title="AI 이용·보관 정책 (P0 확정안)" style={{ marginTop: 10 }}>
          대화 내용은 <b>{D2.aiPolicy.retentionDays}일</b> 보관 후 자동 삭제됩니다. 학생 팀플 규모를 기준으로 사용량 한도는 두지 않습니다.
          <div style={{ marginTop: 10 }}><Btn size="sm" v="outline" icon="download" onClick={() => setToast("AI 사용 내역을 파일로 내려받습니다")}>AI 사용 내역 내려받기</Btn></div>
        </Note>
      </Body>
      <Toast msg={toast} />
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* 15. 쿠션 번역기 — 요구 내용은 그대로, 말투만 */
function ScrCushion({ go, tab, setTab }) {
  const [tone, setTone] = React.useState("soft");
  const [toast, setToast] = React.useState(null);
  const demo = D2.cushionDemo;
  const out = (demo.tones.find((t) => t.key === tone) || demo.tones[0]).out;
  return (
    <Phone label="15 쿠션 번역기">
      <Status />
      <Bar title="쿠션 번역기" sub="말투만 바꿉니다" onBack={() => go("ai")} />
      <Body dense>
        <div style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginBottom: 6 }}>하고 싶은 말</div>
        <Panel s="fill" pad={14} r={16} style={{ marginBottom: 14 }}>
          <div style={{ font: "400 15px/1.6 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all", textWrap: "pretty" }}>{demo.raw}</div>
        </Panel>
        <div style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginBottom: 7 }}>말투 고르기</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }} data-scrollrow="1">
          {demo.tones.map((t) => {
            const on = tone === t.key;
            return (
              <button type="button" key={t.key} onClick={() => setTone(t.key)} style={{
                minHeight: 44, flex: "0 0 auto", padding: "0 14px", borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap",
                font: "700 13.5px/1 var(--font-sans)",
                ...(on ? { background: "var(--ink-700)", color: "var(--on-action)", border: "1px solid transparent" }
                       : { background: "var(--card)", color: "var(--txt)", border: "1px solid var(--line)" }),
              }}>{t.name}</button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)" }}>바꾼 말</span>
          <Chip tone="y" icon="sparkles">AI 초안</Chip>
        </div>
        <Panel s="coral" pad={14} r={16} style={{ marginBottom: 12 }}>
          <div style={{ font: "400 15px/1.65 var(--font-sans)", color: "#8A3B29", wordBreak: "keep-all", textWrap: "pretty" }}>{out}</div>
        </Panel>
        <Note tone="info" icon="equal" style={{ marginBottom: 12 }}>
          요구하는 내용(마감·필요한 것)은 그대로 둡니다. <b>말투만</b> 바뀝니다. 부탁을 없애거나 마감을 늦춰 적지 않습니다.
        </Note>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
          <Btn size="sm" icon="send" onClick={() => go("chat")}>이대로 보내기</Btn>
          <Btn size="sm" v="outline" icon="pencil" onClick={() => setToast("직접 고칠 수 있습니다")}>고쳐서 보내기</Btn>
          <Btn size="sm" v="ghost" onClick={() => setToast("원문으로 보냈습니다")}>원문으로 보내기</Btn>
        </div>
        <Undecided>
          말투 종류의 개수와 이름이 기획안에 없어 세 가지로 두었습니다. MBTI에 따라 기본 말투를 자동 적용할지도 정해지지 않았습니다.
        </Undecided>
      </Body>
      <Toast msg={toast} />
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   16. 기여도 리포트 — 2단계: 본인 확인 · 누락 보완
   ══════════════════════════════════════════════════════════ */
const STEPS = [["auto", "자동 수집"], ["self", "본인 확인"], ["team", "팀원 확인"], ["pdf", "1장 PDF"]];

function StepRail({ at }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 16 }}>
      {STEPS.map(([k, l], i) => {
        const done = i < at, on = i === at;
        return (
          <React.Fragment key={k}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 9,
              background: on ? "var(--ink-700)" : done ? "var(--y-200)" : "var(--fill)",
              color: on ? "var(--on-action)" : done ? "#7A5E12" : "var(--txt-faint)",
              font: "700 13px/1.35 var(--font-sans)", whiteSpace: "nowrap", flex: "0 0 auto",
            }}>
              {done ? <Icon name="check" size={12} strokeWidth={3} /> : null}{l}
            </span>
            {i < STEPS.length - 1 ? <span style={{ flex: 1, height: 1, background: "var(--line)", minWidth: 4 }} /> : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function ContribRow({ c, onConfirm }) {
  const kind = D2.contribKinds.find((k) => k.key === c.kind) || D2.contribKinds[0];
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "13px 15px", minHeight: 56 }}>
      <span style={{
        width: 34, height: 34, flex: "0 0 auto", marginTop: 1, borderRadius: 11, display: "grid", placeItems: "center",
        background: "var(--fill)", color: "var(--txt-muted)",
      }}><Icon name={kind.icon} size={17} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "500 14.5px/1.5 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all", textWrap: "pretty" }}>{c.title}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "3px 7px", marginTop: 5 }}>
          <span style={{ font: "600 13px/1.4 var(--font-sans)", color: "var(--txt-muted)" }}>{kind.name}</span>
          <span style={{ font: "500 13px/1.4 var(--font-sans)", color: "var(--txt-faint)" }}>{c.when}</span>
        </div>
        <div style={{ font: "400 13px/1.5 var(--font-sans)", color: "var(--txt-muted)", marginTop: 4, wordBreak: "keep-all" }}>{c.detail}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
          <Chip icon={c.src === "auto" ? "wand-sparkles" : "user-round"}>{c.src === "auto" ? "앱이 수집" : "내가 추가"}</Chip>
          {c.state === "ok" ? <Chip tone="ok" icon="check">확인함</Chip> : <Chip tone="warn" icon="circle-dashed">확인 대기</Chip>}
        </div>
      </div>
    </div>
  );
}

function ScrContribSelf({ go, tab, setTab, myContrib, onAdd }) {
  const [sheet, setSheet] = React.useState(false);
  const list = myContrib || D2.myContrib;
  const pending = list.filter((c) => c.state !== "ok").length;
  return (
    <Phone label="16 기여도 · 본인 확인">
      <Status />
      <Bar title="내 기여 기록" sub="2 / 4단계 · 본인 확인" />
      <Body dense>
        <StepRail at={1} />
        <Note tone="info" icon="scale" title="점수나 순위를 만들지 않습니다" style={{ marginBottom: 14 }}>
          합의한 역할과 <b>실제 수행 내역</b>만 모읍니다. MBTI, 채팅량, 친목은 기여도에 넣지 않습니다.
        </Note>
        <SecTitle note="빠진 항목이 있으면 직접 추가할 수 있습니다">앱이 모은 기록 {list.length}건</SecTitle>
        <Rows style={{ marginBottom: 12 }}>
          {list.map((c, i) => <ContribRow key={i} c={c} />)}
        </Rows>
        <Btn v="outline" full icon="plus" onClick={() => setSheet(true)} style={{ marginBottom: 14 }}>공동·오프라인 작업 추가</Btn>
        {pending ? (
          <Note tone="warn" icon="circle-dashed" title={"확인 대기 " + pending + "건"}>
            내가 추가한 항목은 팀원이 확인하기 전까지 <b>대기</b>로 남습니다. 임의로 확정하지 않습니다.
          </Note>
        ) : null}
        <Undecided>
          회의 참여를 무엇으로 판정하는지(입장 여부·발언 여부·시간)가 기획안에 없습니다. 지금은 회수만 적고 기준을 적지 않았습니다.
        </Undecided>
      </Body>
      <Sheet open={sheet} title="빠진 작업 추가" onClose={() => setSheet(false)}>
        <p style={{ font: "400 14.5px/1.6 var(--font-sans)", color: "var(--txt)", margin: "0 0 14px", wordBreak: "keep-all", textWrap: "pretty" }}>
          앱 밖에서 한 일도 기록에 넣을 수 있습니다. 추가한 항목은 팀원 확인을 거칩니다.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {D2.contribKinds.map((k) => (
            <button type="button" key={k.key} onClick={() => { setSheet(false); onAdd && onAdd(k.key); }} style={{
              width: "100%", boxSizing: "border-box", textAlign: "left", minHeight: 52, borderRadius: 14, cursor: "pointer",
              background: "var(--card)", border: "1px solid var(--line)", padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 11,
            }}>
              <span style={{ flex: "0 0 auto", color: "var(--txt-muted)", display: "inline-flex" }}><Icon name={k.icon} size={18} /></span>
              <span style={{ flex: 1, minWidth: 0, font: "600 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>{k.name}</span>
              <Icon name="chevron-right" size={16} />
            </button>
          ))}
        </div>
      </Sheet>
      <Dock above={76}>
        <Btn full size="lg" onClick={() => go("contribTeam")} iconRight="arrow-right">팀원 확인으로 넘기기</Btn>
      </Dock>
      <TabBar value={tab} onChange={setTab} pending={{ team: pending || undefined }} />
    </Phone>
  );
}

/* 17. 3단계: 팀원 확인 · 정정 — 미확인과 의견 차이를 별도 표시 */
function ScrContribTeam({ go, tab, setTab, teamCheck, onResolve }) {
  const [toast, setToast] = React.useState(null);
  const list = teamCheck || D2.teamCheck;
  const ok = list.filter((t) => t.state === "ok").length;
  const disputed = list.filter((t) => t.state === "disputed");
  return (
    <Phone label="17 기여도 · 팀원 확인">
      <Status />
      <Bar title="팀원 확인" sub="3 / 4단계 · 정정 가능" onBack={() => go("contribSelf")} />
      <Body dense>
        <StepRail at={2} />
        <Panel s="fill" pad={14} r={16} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-flex", color: "var(--txt-muted)" }}><Icon name="list-checks" size={17} /></span>
            <span style={{ flex: 1, minWidth: 0, font: "600 13.5px/1.5 var(--font-sans)", color: "var(--txt)", wordBreak: "keep-all" }}>
              {list.length}건 중 {ok}건 확인 완료
            </span>
            {disputed.length ? <Chip tone="err" icon="circle-alert">의견 차이 {disputed.length}</Chip> : null}
          </div>
        </Panel>
        <SecTitle note="확인되지 않은 항목은 리포트에서 따로 표시됩니다">팀 기록</SecTitle>
        <Rows style={{ marginBottom: 14 }}>
          {list.map((t, i) => (
            <div key={i} style={{ padding: "13px 15px", minHeight: 56 }}>
              <div style={{ display: "flex", gap: 11, alignItems: "flex-start" }}>
                <Avatar name={t.who} mbti={(D2.roster.find((r) => r.name === t.who) || {}).mbti} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "500 14.5px/1.5 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all", textWrap: "pretty" }}>{t.title}</div>
                  <div style={{ font: "600 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginTop: 4 }}>{t.who}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                    {t.state === "ok" ? <Chip tone="ok" icon="check">{t.by}</Chip> : null}
                    {t.state === "pending" ? <Chip tone="warn" icon="circle-dashed">{t.by}</Chip> : null}
                    {t.state === "disputed" ? <Chip tone="err" icon="circle-alert">{t.by}</Chip> : null}
                  </div>
                  {t.dispute ? (
                    <div style={{ marginTop: 9, padding: "10px 12px", borderRadius: 12, background: "var(--err-bg)" }}>
                      <div style={{ font: "700 13px/1.4 var(--font-sans)", color: "#8A3B31", marginBottom: 3 }}>적힌 의견</div>
                      <div style={{ font: "400 13.5px/1.55 var(--font-sans)", color: "#8A3B31", wordBreak: "keep-all", textWrap: "pretty" }}>{t.dispute}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
                        <Btn size="sm" v="outline" icon="messages-square" onClick={() => go("dmList")}>1:1 DM</Btn>
                        <Btn size="sm" v="ghost" icon="split" onClick={() => onResolve && onResolve(t)}>공동 작업으로 나누기</Btn>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </Rows>
        <Note tone="info" icon="pen-line" title="정정할 권리가 있습니다">
          자기 기록이 사실과 다르면 고쳐 달라고 적을 수 있습니다. 의견이 다른 항목은 <b>한쪽 말로 덮지 않고</b> 둘 다 남깁니다.
        </Note>
        <Undecided>
          의견 차이가 끝까지 안 좁혀졌을 때 최종 기재 방식이 기획안에 없습니다. 지금은 양쪽 의견을 함께 남기는 안입니다.
        </Undecided>
      </Body>
      <Dock above={76}>
        <Btn full size="lg" onClick={() => go("contribPdf")} iconRight="arrow-right">리포트 미리 보기</Btn>
      </Dock>
      <Toast msg={toast} />
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* 18. 4단계: 1장 PDF — 종합 점수와 순위 없음 */
function ScrContribPdf({ go, tab, setTab }) {
  const [toast, setToast] = React.useState(null);
  const rows = [
    { who: "김민준", role: "자료조사", items: 4, pending: 1 },
    { who: "이서연", role: "PPT 제작", items: 5, pending: 0 },
    { who: "박지호", role: "일정 관리", items: 4, pending: 0 },
    { who: "최유나", role: "발표 대본", items: 2, pending: 0, disputed: 1 },
  ];
  return (
    <Phone label="18 기여도 · 1장 PDF">
      <Status />
      <Bar title="리포트 미리 보기" sub="4 / 4단계" onBack={() => go("contribTeam")} action="share-2" />
      <Body dense>
        <StepRail at={3} />
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 16px", marginBottom: 14 }}>
          <div style={{ paddingBottom: 12, borderBottom: "1.5px solid var(--ink-900)", marginBottom: 12 }}>
            <div style={{ font: "800 17px/1.3 var(--font-sans)", letterSpacing: "-.025em", color: "var(--ink-900)", wordBreak: "keep-all" }}>
              팀 기여 기록
            </div>
            <div style={{ font: "500 13px/1.45 var(--font-sans)", color: "var(--txt-muted)", marginTop: 3 }}>
              {D2.team.name} · {D2.team.course} · 2026.09.16
            </div>
          </div>
          {rows.map((r) => (
            <div key={r.who} style={{ paddingBottom: 11, marginBottom: 11, borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <span style={{ font: "700 14px/1.4 var(--font-sans)", color: "var(--ink-900)" }}>{r.who}</span>
                <span style={{ font: "500 13px/1.4 var(--font-sans)", color: "var(--txt-muted)" }}>합의한 역할 · {r.role}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                <Chip tone="ok" icon="check">확인된 기록 {r.items}건</Chip>
                {r.pending ? <Chip tone="warn" icon="circle-dashed">미확인 {r.pending}건</Chip> : null}
                {r.disputed ? <Chip tone="err" icon="circle-alert">의견 차이 {r.disputed}건</Chip> : null}
              </div>
            </div>
          ))}
          <div style={{ font: "400 13px/1.6 var(--font-sans)", color: "var(--txt-muted)", wordBreak: "keep-all", textWrap: "pretty" }}>
            이 문서는 확인된 기록만 담습니다. 종합 점수와 순위는 포함하지 않으며, 팀원 간 우열을 나타내지 않습니다.
            MBTI, 사주, 채팅량, 친목 활동은 반영하지 않았습니다.
          </div>
        </div>
        <Note tone="info" icon="wand-sparkles" title="AI는 확인된 기록만 요약합니다" style={{ marginBottom: 12 }}>
          미확인·의견 차이 항목은 요약 문장에 넣지 않고 <b>따로 표시</b>합니다. 수치는 정해진 규칙으로만 셉니다.
        </Note>
        <Undecided>
          교수 제출용과 팀 내부용을 나눌지, 미확인 항목을 제출본에 넣을지가 정해지지 않았습니다.
          제출 전 <b>팀원 전원 동의</b>를 받을지도 확인이 필요합니다.
        </Undecided>
      </Body>
      <Dock above={76}>
        <Btn full size="lg" icon="file-down" onClick={() => setToast("팀원 4명에게 제출 동의를 요청했습니다")}>PDF 만들기</Btn>
      </Dock>
      <Toast msg={toast} />
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

Object.assign(window, { ScrDrive, ScrVersions, ScrAi, ScrCushion, ScrContribSelf, ScrContribTeam, ScrContribPdf, StepRail });
