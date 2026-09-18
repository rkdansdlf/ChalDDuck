const D3 = window.CD3;

/* ══════════════════════════════════════════════════════════
   19. 팀플 단톡방 — 이번 PDF엔 화면이 없어 새로 설계.
   ══════════════════════════════════════════════════════════ */
function ScrChat({ go, tab, setTab }) {
  const [text, setText] = React.useState("");
  const [msgs, setMsgs] = React.useState(D3.chat.messages);
  const send = () => {
    if (!text.trim()) return;
    const failed = Math.random() < 0.25;
    setMsgs([...msgs, { who: "김민준", me: true, mbti: "INFJ", text: text.trim(), time: failed ? null : "지금", status: failed ? "failed" : "sent" }]);
    setText("");
  };
  const retry = (i) => setMsgs(msgs.map((m, j) => (j === i ? { ...m, status: "sent", time: "지금" } : m)));
  return (
    <Phone label="19 팀플 단톡방">
      <Status />
      <Bar title={D3.team.name} sub={D3.team.members + "명 · 단체 채팅방 1개"} onBack={() => go("cushion")} action="users-round" />
      <Body dense style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", flexDirection: m.me ? "row-reverse" : "row" }}>
            <Avatar name={m.who} mbti={m.mbti} size={32} />
            <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: m.me ? "flex-end" : "flex-start" }}>
              {!m.me ? <div style={{ font: "600 12px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginBottom: 3 }}>{m.who}</div> : null}
              <div style={{
                padding: "10px 13px", borderRadius: 16, wordBreak: "keep-all", textWrap: "pretty",
                font: "400 14.5px/1.55 var(--font-sans)",
                background: m.me ? "var(--y-300)" : "var(--card)",
                border: m.me ? "none" : "1px solid var(--line)",
                color: "var(--txt-strong)",
              }}>{m.text}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                {m.viaCushion ? <Chip tone="y" icon="wand-sparkles">쿠션 번역기</Chip> : null}
                {m.status === "failed" ? (
                  <button type="button" onClick={() => retry(i)} style={{
                    display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
                    cursor: "pointer", padding: 0, font: "700 11.5px/1 var(--font-sans)", color: "var(--err)",
                  }}><Icon name="circle-alert" size={12} />전송 실패 · 다시 보내기</button>
                ) : (
                  <span style={{ font: "500 11.5px/1 var(--font-sans)", color: "var(--txt-faint)" }}>{m.time}</span>
                )}
              </div>
              {m.reactions ? (
                <div style={{ display: "flex", gap: 5, marginTop: 5 }}>
                  {m.reactions.map((r, j) => (
                    <span key={j} style={{
                      display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 8px", borderRadius: 999,
                      background: "var(--fill)", color: "var(--txt-muted)", font: "600 12px/1 var(--font-sans)",
                    }}><Icon name={r.icon} size={12} />{r.count}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        <Note tone="info" icon="wand-sparkles" style={{ marginTop: 8 }}>
          쿠션 번역기로 다듬은 말은 <b>표시가 남습니다</b>. 원문을 숨기지 않습니다.
        </Note>
        <Undecided>
          채널을 여러 개 두는지, 1:1 DM·메시지 삭제가 되는지는 기획안에 없어 팀 전체가 보는 단일 채팅방으로만 구성했습니다.
        </Undecided>
      </Body>
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 84, padding: "10px 14px",
        background: "rgba(255,253,249,.96)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--line)",
        display: "flex", gap: 8, alignItems: "center",
      }}>
        <button type="button" onClick={() => setToast("첨부는 준비 중입니다")} aria-label="첨부" style={{
          width: 44, height: 44, flex: "0 0 auto", borderRadius: 999, display: "grid", placeItems: "center",
          background: "var(--fill)", color: "var(--txt-muted)", border: "none", cursor: "pointer",
        }}><Icon name="paperclip" size={18} /></button>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="메시지 입력"
          onKeyDown={(e) => { if (e.key === "Enter") send(); }} style={{
            flex: 1, minWidth: 0, minHeight: 44, padding: "0 14px", borderRadius: 999,
            border: "1.5px solid var(--input-border)", background: "var(--card)",
            font: "400 15px/1 var(--font-sans)", color: "var(--txt-strong)", outline: "none",
          }} />
        <button type="button" onClick={() => go("cushion")} aria-label="쿠션 번역기로 다듬기" style={{
          width: 44, height: 44, flex: "0 0 auto", borderRadius: 999, display: "grid", placeItems: "center",
          background: "var(--y-200)", color: "var(--y-700)", border: "none", cursor: "pointer",
        }}><Icon name="wand-sparkles" size={18} /></button>
        <button type="button" onClick={send} aria-label="보내기" style={{
          width: 44, height: 44, flex: "0 0 auto", borderRadius: 999, display: "grid", placeItems: "center",
          background: "var(--ink-700)", color: "var(--on-action)", border: "none", cursor: "pointer",
        }}><Icon name="send" size={17} /></button>
      </div>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   20. AI 서기 상세 — 입력 → 요약·후보 → 반영 확인, 3단계.
   AI는 초안만 만들고 담당자·기한 확정은 사람이 누른다.
   ══════════════════════════════════════════════════════════ */
function ScrClerk({ go, tab, setTab }) {
  const [step, setStep] = React.useState(0);
  const [picked, setPicked] = React.useState(D3.aiClerk.candidates.map(() => true));
  const [assignees, setAssignees] = React.useState(D3.aiClerk.candidates.map((c) => c.who));
  const names = D3.roster.map((r) => r.name);
  const cycleAssignee = (i) => {
    const cur = assignees[i];
    const idx = cur ? names.indexOf(cur) : -1;
    const next = names[(idx + 1) % names.length];
    setAssignees(assignees.map((a, j) => (j === i ? next : a)));
  };
  const acceptedCount = picked.filter(Boolean).length;
  return (
    <Phone label="20 AI 서기 상세">
      <Status />
      <Bar title="AI 서기" sub={["회의 내용 입력", "요약 · 할 일 후보", "업무에 반영"][step]} onBack={() => (step === 0 ? go("ai") : setStep(step - 1))} />
      <Body dense>
        <Progress step={step + 1} total={3} style={{ marginBottom: 16 }} />
        {step === 0 ? (
          <React.Fragment>
            <Field label="회의 내용" hint="회의 중 적은 메모나 채팅 로그를 그대로 붙여넣으면 됩니다." required>
              <div style={{
                minHeight: 160, padding: "12px 14px", borderRadius: 14, border: "1.5px solid var(--line-strong)",
                background: "var(--card)", font: "400 14.5px/1.6 var(--font-sans)", color: "var(--txt-strong)",
                wordBreak: "keep-all", textWrap: "pretty",
              }}>{D3.aiClerk.raw}</div>
            </Field>
            <Note tone="info" icon="shield" style={{ marginBottom: 14 }}>
              AI는 이 내용에서 <b>할 일 후보만 뽑습니다</b>. 실제 업무 목록에 반영하려면 다음 단계에서 직접 확인해야 합니다.
            </Note>
            <Btn full size="lg" icon="wand-sparkles" onClick={() => setStep(1)}>회의 내용에서 할 일 뽑기</Btn>
          </React.Fragment>
        ) : null}
        {step === 1 ? (
          <React.Fragment>
            <SecTitle note="AI가 뽑은 초안입니다 · 그대로 반영되지 않습니다">회의 요약</SecTitle>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)" }}>요약</span>
              <Chip tone="y" icon="sparkles">AI 초안</Chip>
            </div>
            <Panel s="coral" pad={14} r={16} style={{ marginBottom: 16 }}>
              <div style={{ font: "400 14.5px/1.6 var(--font-sans)", color: "#8A3B29", wordBreak: "keep-all", textWrap: "pretty" }}>{D3.aiClerk.summary}</div>
            </Panel>
            <SecTitle note="담당자·기한을 확인하고 필요 없으면 빼세요">할 일 후보 {D3.aiClerk.candidates.length}건</SecTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {D3.aiClerk.candidates.map((c, i) => (
                <Panel key={i} s={picked[i] ? "card" : "fill"} pad={14} r={16} style={{ opacity: picked[i] ? 1 : .55 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <button type="button" onClick={() => setPicked(picked.map((p, j) => (j === i ? !p : p)))} aria-label="후보 포함 여부" style={{
                      width: 24, height: 24, flex: "0 0 auto", marginTop: 1, borderRadius: 8, cursor: "pointer",
                      background: picked[i] ? "var(--y-400)" : "var(--card)", border: "1.5px solid " + (picked[i] ? "transparent" : "var(--line-strong)"),
                      display: "grid", placeItems: "center", color: "var(--ink-900)",
                    }}>{picked[i] ? <Icon name="check" size={15} /> : null}</button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ font: "700 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{c.title}</div>
                      <div style={{ font: "400 12.5px/1.5 var(--font-sans)", color: "var(--txt-muted)", marginTop: 3, wordBreak: "keep-all" }}>{c.basis}</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                        <button type="button" onClick={() => cycleAssignee(i)} style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}>
                          <Chip icon="user-round" tone={assignees[i] ? "n" : "warn"}>{assignees[i] || "담당자 정하기"}</Chip>
                        </button>
                        <Chip icon="calendar-clock">{c.due}</Chip>
                      </div>
                    </div>
                  </div>
                </Panel>
              ))}
            </div>
            <Undecided>
              회의 내용을 텍스트로 직접 붙여넣는 방식 외에 음성 녹음 인식 여부는 기획안에 없어 다루지 않았습니다.
            </Undecided>
            <Btn full size="lg" icon="list-checks" onClick={() => setStep(2)} style={{ marginTop: 14 }} disabled={!acceptedCount}>
              선택한 {acceptedCount}건 업무로 반영하기
            </Btn>
          </React.Fragment>
        ) : null}
        {step === 2 ? (
          <React.Fragment>
            <Panel s="yellow" pad={20} r={20} style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{ display: "inline-flex", width: 52, height: 52, borderRadius: 999, background: "rgba(255,255,255,.75)", color: "var(--y-700)", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                <Icon name="check" size={24} />
              </div>
              <div style={{ font: "800 18px/1.35 var(--font-sans)", color: "var(--ink-900)" }}>할 일 {acceptedCount}건이 업무 목록에 추가됐습니다</div>
              <div style={{ font: "500 13.5px/1.5 var(--font-sans)", color: "var(--y-700)", marginTop: 6 }}>담당자에게 별도로 수락을 요청하세요</div>
            </Panel>
            <Btn full size="lg" iconRight="arrow-right" onClick={() => go("tasks")}>할 일 · 체크리스트에서 보기</Btn>
          </React.Fragment>
        ) : null}
      </Body>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   21. 할 일 · 체크리스트 관리 — 팀 업무 / 개인 학습 / 점검을 한 목록에서 구분(사용자 지정).
   ══════════════════════════════════════════════════════════ */
const NEXT_STATUS = { todo: "doing", doing: "done", done: "todo" };

function ScrTasks({ go, tab, setTab }) {
  const [tasks, setTasks] = React.useState(D3.tasks);
  const [filter, setFilter] = React.useState("all");
  const [sheet, setSheet] = React.useState(false);
  const cycle = (i) => setTasks(tasks.map((t, j) => (j === i ? { ...t, status: NEXT_STATUS[t.status] } : t)));
  const shown = filter === "all" ? tasks : tasks.filter((t) => t.kind === filter);
  const kindOf = (k) => D3.taskKinds.find((x) => x.key === k) || D3.taskKinds[0];
  return (
    <Phone label="21 할 일 · 체크리스트">
      <Status />
      <Bar title="할 일 · 체크리스트" sub={tasks.filter((t) => t.status !== "done").length + "건 남음"} action="plus" onAction={() => setSheet(true)} />
      <Body dense>
        <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }} data-scrollrow="1">
          {[["all", "전체"], ...D3.taskKinds.map((k) => [k.key, k.name])].map(([k, l]) => {
            const on = filter === k;
            return (
              <button type="button" key={k} onClick={() => setFilter(k)} style={{
                minHeight: 40, flex: "0 0 auto", padding: "0 13px", borderRadius: 12, cursor: "pointer", whiteSpace: "nowrap",
                font: "700 13px/1 var(--font-sans)",
                ...(on ? { background: "var(--ink-700)", color: "var(--on-action)", border: "1px solid transparent" }
                       : { background: "var(--card)", color: "var(--txt)", border: "1px solid var(--line)" }),
              }}>{l}</button>
            );
          })}
        </div>
        <Btn v="outline" size="sm" icon="bell" onClick={() => go("poke")} style={{ marginBottom: 14 }}>담당자에게 콕 찌르기</Btn>
        <Rows>
          {shown.map((t, i) => {
            const realI = tasks.indexOf(t);
            const st = STATUS[t.status] || STATUS.todo;
            const kind = kindOf(t.kind);
            return (
              <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "13px 15px", minHeight: 56 }}>
                <button type="button" onClick={() => cycle(realI)} aria-label="상태 바꾸기" style={{
                  border: "none", background: "none", padding: 0, cursor: "pointer", marginTop: 1, flex: "0 0 auto", color: "var(--txt-muted)",
                }}><Icon name={st.icon} size={22} /></button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    font: "600 14.5px/1.5 var(--font-sans)", wordBreak: "keep-all", textWrap: "pretty",
                    color: t.status === "done" ? "var(--txt-faint)" : "var(--txt-strong)",
                    textDecoration: t.status === "done" ? "line-through" : "none",
                  }}>{t.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
                    <Chip icon={kind.icon}>{kind.name}</Chip>
                    {t.who ? <Chip icon="user-round">{t.who}</Chip> : <Chip tone="warn" icon="circle-dashed">담당자 미정</Chip>}
                    <Chip icon="calendar-clock">{t.due}</Chip>
                    <StatusBadge status={t.status}>{st.label}</StatusBadge>
                    {t.source === "clerk" ? <Chip tone="y" icon="notebook-pen">AI 서기</Chip> : null}
                  </div>
                </div>
                {t.mbti ? <Avatar mbti={t.mbti} name={t.who} size={30} /> : null}
              </div>
            );
          })}
        </Rows>
        <Note tone="info" icon="list-checks" style={{ marginTop: 14 }}>
          상태 아이콘을 누르면 <b>할 일 → 진행 중 → 완료</b> 순으로 바뀝니다. 완료 표시는 담당자만 되돌릴 수 있다고 가정했습니다.
        </Note>
        <Undecided>
          담당자 지정을 당사자가 수락해야 확정되는지, 마감을 놓치면 어떻게 되는지는 기획안에 없어 다루지 않았습니다.
        </Undecided>
      </Body>
      <Sheet open={sheet} title="업무 종류 고르기" onClose={() => setSheet(false)}>
        <p style={{ font: "400 14.5px/1.6 var(--font-sans)", color: "var(--txt)", margin: "0 0 14px", wordBreak: "keep-all", textWrap: "pretty" }}>
          어떤 종류의 할 일인지 먼저 고르면, 제목·담당자·기한은 다음 화면에서 채웁니다. (프로토타입에서는 예시로만 추가됩니다)
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {D3.taskKinds.map((k) => (
            <button type="button" key={k.key} onClick={() => {
              setSheet(false);
              setTasks([...tasks, { title: "새 " + k.name, kind: k.key, who: null, mbti: null, due: "미정", status: "todo", source: "manual" }]);
            }} style={{
              width: "100%", boxSizing: "border-box", textAlign: "left", minHeight: 52, borderRadius: 14, cursor: "pointer",
              background: "var(--card)", border: "1px solid var(--line)", padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <Icon name={k.icon} size={18} />
              <span style={{ font: "600 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>{k.name}</span>
            </button>
          ))}
        </div>
      </Sheet>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   22. 파일 열람·버전 복원 — 복원은 덮어쓰지 않고 새 버전을 맨 위에 추가한다.
   ══════════════════════════════════════════════════════════ */
function ScrFileView({ go, tab, setTab, versions, setVersions, selVer }) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const list = versions || D3.versions;
  const cur = list.find((v) => v.v === selVer) || list[0];
  const viewable = cur.type === "image" || cur.type === "pdf";
  const restore = () => {
    const nv = { v: "v" + (list.length + 1), who: "김민준", when: "방금", note: cur.v + " 복원", size: cur.size, latest: true, type: cur.type };
    setVersions(list.map((v) => ({ ...v, latest: false })).concat(nv));
    setConfirmOpen(false);
    setDone(true);
  };
  return (
    <Phone label="22 파일 열람·버전 복원">
      <Status />
      <Bar title={cur.v + " 미리보기"} sub="PPT 템플릿 제출함" onBack={() => go("versions")} />
      <Body dense>
        {done ? (
          <Panel s="yellow" pad={20} r={20} style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ display: "inline-flex", width: 52, height: 52, borderRadius: 999, background: "rgba(255,255,255,.75)", color: "var(--y-700)", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Icon name="check" size={24} />
            </div>
            <div style={{ font: "800 17px/1.35 var(--font-sans)", color: "var(--ink-900)" }}>{cur.v}을 새 버전으로 추가했습니다</div>
            <div style={{ font: "500 13.5px/1.5 var(--font-sans)", color: "var(--y-700)", marginTop: 6 }}>기존 버전은 지워지지 않았습니다</div>
            <Btn full size="lg" style={{ marginTop: 14 }} onClick={() => go("versions")}>버전 목록으로</Btn>
          </Panel>
        ) : (
          <React.Fragment>
            {viewable ? (
              <div style={{ borderRadius: 18, marginBottom: 16, overflow: "hidden", border: "1px solid var(--line)", background: "var(--fill)" }}>
                <img src={cur.url} alt={cur.note} style={{ width: "100%", display: "block", objectFit: "contain", maxHeight: 260 }} />
              </div>
            ) : (
              <div style={{
                minHeight: 200, borderRadius: 18, marginBottom: 16, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 8,
                background: "repeating-linear-gradient(135deg,var(--fill) 0 10px,var(--card) 10px 20px)",
                border: "1px solid var(--line)",
              }}>
                <Icon name="file-x" size={30} style={{ color: "var(--txt-faint)" }} />
                <span style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--ink-600)" }}>미지원 형식(.{cur.type})</span>
                <span style={{ font: "500 12px/1.5 var(--font-mono)", color: "var(--txt-faint)" }}>미리보기는 복원되지 않습니다 · 다운로드해서 열어 주세요</span>
              </div>
            )}
            <Rows style={{ marginBottom: 16 }}>
              <div style={{ padding: "13px 15px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ font: "700 14px/1 var(--font-mono)", padding: "4px 9px", borderRadius: 8, background: cur.latest ? "var(--ink-700)" : "var(--fill)", color: cur.latest ? "var(--on-action)" : "var(--txt-muted)" }}>{cur.v}</span>
                  {cur.latest ? <StatusBadge status="done">현재 최신 버전</StatusBadge> : null}
                  {viewable ? <Chip tone="ok" icon="eye">PDF·이미지 실험적 열람</Chip> : <Chip tone="n" icon="file-x">미지원 형식</Chip>}
                </div>
                <div style={{ font: "500 14.5px/1.5 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{cur.note}</div>
                <div style={{ font: "500 13px/1.45 var(--font-sans)", color: "var(--txt-muted)", marginTop: 4 }}>{cur.who} · {cur.when} · {cur.size}</div>
              </div>
            </Rows>
            {!cur.latest ? (
              <Btn full size="lg" icon="rotate-ccw" onClick={() => setConfirmOpen(true)}>이 버전으로 복원하기</Btn>
            ) : (
              <Btn full size="lg" v="outline" icon="download">다운로드</Btn>
            )}
            <Undecided>
              복원 권한이 올린 사람에게만 있는지가 기획안에 없어 누구나 볼 수 있게 열어뒀습니다.
            </Undecided>
          </React.Fragment>
        )}
      </Body>
      <Sheet open={confirmOpen} title="이 버전으로 복원할까요" onClose={() => setConfirmOpen(false)}>
        <p style={{ font: "400 14.5px/1.6 var(--font-sans)", color: "var(--txt)", margin: "0 0 16px", wordBreak: "keep-all", textWrap: "pretty" }}>
          {cur.v}의 내용을 <b>새 버전({("v" + (list.length + 1))})</b>으로 맨 위에 추가합니다. 지금 최신 버전을 포함해 기존 버전은 지워지지 않습니다.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn full v="outline" onClick={() => setConfirmOpen(false)}>취소</Btn>
          <Btn full onClick={restore}>복원하기</Btn>
        </div>
      </Sheet>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   23. 기여 기록 추가·정정
   ══════════════════════════════════════════════════════════ */
function ScrContribFix({ go, tab, setTab, fix, myContrib, setMyContrib, teamCheck, setTeamCheck }) {
  const mode = (fix && fix.mode) || "add";
  const [title, setTitle] = React.useState("");
  const [evidence, setEvidence] = React.useState(false);
  const kind = D3.contribKinds.find((k) => k.key === (fix && fix.kind)) || D3.contribKinds[0];
  const target = fix && fix.target;
  const submitAdd = () => {
    if (!title.trim()) return;
    setMyContrib((myContrib || D3.myContrib).concat([{ kind: kind.key, title: title.trim(), detail: "직접 추가한 기록" + (evidence ? " · 근거 첨부됨" : ""), when: "방금", src: "self", state: "pending" }]));
    go("contribSelf");
  };
  const resolve = (way) => {
    const list = teamCheck || D3.teamCheck;
    setTeamCheck(list.map((t) => t === target ? { ...t, state: "ok", by: way, dispute: null } : t));
    go("contribTeam");
  };
  return (
    <Phone label="23 기여 기록 추가·정정">
      <Status />
      <Bar title={mode === "add" ? "빠진 기록 추가" : "정정 응답"} onBack={() => go(mode === "add" ? "contribSelf" : "contribTeam")} />
      <Body dense>
        {mode === "add" ? (
          <React.Fragment>
            <Note tone="info" icon="user-round" title={kind.name + " · 직접 추가"} style={{ marginBottom: 16 }}>
              앱 밖에서 한 일도 기록에 넣을 수 있습니다. 추가한 항목은 팀원 확인을 거쳐야 확정됩니다.
            </Note>
            <Field label="무슨 일을 했나요" required>
              <Input value={title} onChange={setTitle} placeholder="예: 발표 자료 오탈자 전체 검토" />
            </Field>
            <Field label="근거">
              <button type="button" onClick={() => setEvidence(!evidence)} style={{
                width: "100%", boxSizing: "border-box", minHeight: 50, borderRadius: 14, cursor: "pointer",
                border: "1.5px dashed " + (evidence ? "var(--y-500)" : "var(--line-strong)"),
                background: evidence ? "var(--y-100)" : "var(--card)", color: evidence ? "var(--y-700)" : "var(--txt-muted)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8, font: "600 14px/1 var(--font-sans)",
              }}><Icon name={evidence ? "check" : "paperclip"} size={16} />{evidence ? "근거 파일 1개 첨부됨" : "스크린샷·링크 등 근거 첨부(선택)"}</button>
            </Field>
            <Btn full size="lg" onClick={submitAdd} disabled={!title.trim()}>추가하고 확인 요청하기</Btn>
            <Undecided>
              근거 파일의 형식·용량 제한이 기획안에 없어 다루지 않았습니다.
            </Undecided>
          </React.Fragment>
        ) : (
          <React.Fragment>
            {target ? (
              <React.Fragment>
                <SecTitle>원래 기록</SecTitle>
                <Panel s="fill" pad={14} r={16} style={{ marginBottom: 14 }}>
                  <div style={{ font: "700 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{target.title}</div>
                  <div style={{ font: "500 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginTop: 4 }}>{target.who}</div>
                </Panel>
                <SecTitle>적힌 의견</SecTitle>
                <Panel s="coral" pad={14} r={16} style={{ marginBottom: 16 }}>
                  <div style={{ font: "400 14.5px/1.6 var(--font-sans)", color: "#8A3B29", wordBreak: "keep-all", textWrap: "pretty" }}>{target.dispute}</div>
                </Panel>
                <Note tone="info" icon="pen-line" style={{ marginBottom: 16 }}>
                  의견이 다른 항목은 한쪽 말로 덮지 않습니다. 둘 중 하나로 정리하거나, 공동 작업으로 나눠 적을 수 있습니다.
                </Note>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Btn full icon="check" onClick={() => resolve("정정 동의 · 의견대로 수정")}>정정 의견에 동의하기</Btn>
                  <Btn full v="outline" icon="split" onClick={() => resolve("공동 작업으로 나눔")}>공동 작업으로 나누기</Btn>
                </div>
                <Undecided>
                  정정에도 합의가 안 되면 어떻게 되는지는 기획안에 없어 다루지 않았습니다.
                </Undecided>
              </React.Fragment>
            ) : <Note tone="info" icon="circle-dashed">정정할 항목이 선택되지 않았습니다.</Note>}
          </React.Fragment>
        )}
      </Body>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   24. 익명 찰떡 콕 찌르기 — 다그치지 않고 슬쩍 알린다. 업무당 하루 한 번.
   ══════════════════════════════════════════════════════════ */
function ScrPoke({ go, tab, setTab }) {
  const [selTask, setSelTask] = React.useState(null);
  const [sent, setSent] = React.useState({});
  const targets = D3.tasks.filter((t) => t.status !== "done" && t.who);
  const send = (t) => setSent({ ...sent, [t.title]: true });
  return (
    <Phone label="24 익명 콕 찌르기">
      <Status />
      <Bar title="콕 찌르기" sub="담당자에게 조용히 알립니다" onBack={() => go("tasks")} />
      <Body dense>
        <Note tone="info" icon="eye-off" style={{ marginBottom: 14 }}>
          보낸 사람은 밝히지 않습니다. 받는 사람에게만 조용히 뜨고, 업무당 <b>하루 한 번</b>만 보낼 수 있습니다.
        </Note>
        <SecTitle note="아직 끝나지 않은 업무만 보입니다">업무 고르기</SecTitle>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {targets.map((t, i) => {
            const on = selTask === t.title, already = sent[t.title];
            return (
              <button type="button" key={i} disabled={already} onClick={() => setSelTask(t.title)} style={{
                width: "100%", boxSizing: "border-box", textAlign: "left", borderRadius: 16, cursor: already ? "default" : "pointer",
                padding: "13px 15px", background: on ? "var(--y-100)" : "var(--card)",
                border: "1.5px solid " + (on ? "var(--y-500)" : "var(--line)"), opacity: already ? .55 : 1,
                display: "flex", alignItems: "center", gap: 11,
              }}>
                <Avatar name={t.who} mbti={t.mbti} size={32} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", font: "600 14.5px/1.4 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all" }}>{t.title}</span>
                  <span style={{ display: "block", font: "500 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginTop: 2 }}>{t.who} · {t.due} 마감</span>
                </span>
                {already ? <Chip tone="ok" icon="check">오늘 이미 보냈어요</Chip> : null}
              </button>
            );
          })}
        </div>
        <Undecided>
          익명이 악용될 때(과도하게 자주 찌르기 등) 대응 방법은 기획안에 없어 다루지 않았습니다.
        </Undecided>
      </Body>
      <Dock>
        <Btn full size="lg" icon="bell" disabled={!selTask || sent[selTask]} onClick={() => { const t = targets.find((x) => x.title === selTask); if (t) send(t); }}>
          익명으로 콕 찌르기
        </Btn>
      </Dock>
      <TabBar value={tab} onChange={setTab} />
    </Phone>
  );
}

Object.assign(window, { ScrChat, ScrClerk, ScrTasks, ScrFileView, ScrContribFix, ScrPoke });
