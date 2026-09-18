const D5 = window.CD3;

/* ══════════════════════════════════════════════════════════
   30. 1:1 DM 목록 — 단톡방과 별도로 팀원마다 하나씩 개설.
   ══════════════════════════════════════════════════════════ */
function ScrDmList({ go, tab, setTab, onOpenDm }) {
  const totalUnread = D5.dmThreads.reduce((s, t) => s + t.unread, 0);
  return (
    <Phone label="30 1:1 DM 목록">
      <Status />
      <Bar title="1:1 대화" sub={D5.dmThreads.length + "명과의 대화"} onBack={() => go("chat")} />
      <Body dense>
        <SecTitle note="팀 전체 채팅과는 별도로 개설됩니다">DM {D5.dmThreads.length}개</SecTitle>
        <Rows>
          {D5.dmThreads.map((t) => (
            <button type="button" key={t.name} onClick={() => onOpenDm(t.name)} style={{
              width: "100%", boxSizing: "border-box", textAlign: "left", background: "none", border: "none",
              cursor: "pointer", padding: "13px 15px", minHeight: 60, display: "flex", alignItems: "center", gap: 12,
            }}>
              <Avatar name={t.name} mbti={t.mbti} size={42} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ font: "700 15px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>{t.name}</span>
                  <span style={{ font: "500 12px/1.4 var(--font-sans)", color: "var(--txt-faint)", marginLeft: "auto" }}>{t.time}</span>
                </span>
                <span style={{
                  display: "block", font: (t.unread ? "600" : "400") + " 13.5px/1.5 var(--font-sans)",
                  color: t.unread ? "var(--txt-strong)" : "var(--txt-muted)", marginTop: 2, wordBreak: "keep-all",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{t.lastMsg}</span>
              </span>
              {t.unread ? (
                <span style={{
                  minWidth: 20, height: 20, boxSizing: "border-box", padding: "0 5px", borderRadius: 999,
                  background: "var(--c-400)", color: "var(--ink-900)", font: "700 12px/20px var(--font-sans)", textAlign: "center", flex: "0 0 auto",
                }}>{t.unread}</span>
              ) : null}
            </button>
          ))}
        </Rows>
        <Note tone="info" icon="lock" style={{ marginTop: 14 }}>
          DM은 두 사람만 봅니다. 쿠션 번역기로 다듬어 보낸 말에는 단톡방과 똑같이 표시가 남습니다.
        </Note>
        <Undecided>
          DM을 팀원이 먼저 개설할 수 있는지(지금은 07번 화면의 아바타를 눌러야만 열립니다), 메시지 삭제·나가기가 되는지는 기획안에 없어 다루지 않았습니다.
        </Undecided>
      </Body>
      <TabBar value={tab} onChange={setTab} pending={{ team: totalUnread || undefined }} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   31. 1:1 DM 대화 — 팀 역할 화면(07)의 아바타에서 진입.
   ══════════════════════════════════════════════════════════ */
function ScrDm({ go, tab, setTab, target }) {
  const [text, setText] = React.useState("");
  const name = target || D5.dmThreads[0].name;
  const thread = D5.dmThreads.find((t) => t.name === name) || D5.dmThreads[0];
  const [msgs, setMsgs] = React.useState((D5.dmMessages[name] || []).slice());
  const send = () => {
    if (!text.trim()) return;
    const failed = Math.random() < 0.25;
    setMsgs([...msgs, { who: "김민준", me: true, mbti: "INFJ", text: text.trim(), time: failed ? null : "지금", status: failed ? "failed" : "sent" }]);
    setText("");
  };
  const retry = (i) => setMsgs(msgs.map((m, j) => (j === i ? { ...m, status: "sent", time: "지금" } : m)));
  return (
    <Phone label="31 1:1 DM 대화">
      <Status />
      <Bar title={name} sub={thread.mbti || "MBTI 미입력"} onBack={() => go("dmList")} />
      <Body dense style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start", flexDirection: m.me ? "row-reverse" : "row" }}>
            <Avatar name={m.who} mbti={m.mbti} size={32} />
            <div style={{ maxWidth: "72%", display: "flex", flexDirection: "column", alignItems: m.me ? "flex-end" : "flex-start" }}>
              <div style={{
                padding: "10px 13px", borderRadius: 16, wordBreak: "keep-all", textWrap: "pretty",
                font: "400 14.5px/1.55 var(--font-sans)",
                background: m.me ? "var(--y-300)" : "var(--card)",
                border: m.me ? "none" : "1px solid var(--line)",
                color: "var(--txt-strong)",
              }}>{m.text}</div>
              {m.status === "failed" ? (
                <button type="button" onClick={() => retry(i)} style={{
                  display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none",
                  cursor: "pointer", padding: 0, marginTop: 4, font: "700 11.5px/1 var(--font-sans)", color: "var(--err)",
                }}><Icon name="circle-alert" size={12} />전송 실패 · 다시 보내기</button>
              ) : (
                <span style={{ font: "500 11.5px/1 var(--font-sans)", color: "var(--txt-faint)", marginTop: 4 }}>{m.time}</span>
              )}
            </div>
          </div>
        ))}
        <Note tone="info" icon="lock" style={{ marginTop: 8 }}>
          이 대화는 <b>{name}님과 나만</b> 봅니다. 팀 전체 단톡방(19)과는 분리되어 있습니다.
        </Note>
      </Body>
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 84, padding: "10px 14px",
        background: "rgba(255,253,249,.96)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--line)",
        display: "flex", gap: 8, alignItems: "center",
      }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={name + "님에게 메시지"}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }} style={{
            flex: 1, minWidth: 0, minHeight: 44, padding: "0 14px", borderRadius: 999,
            border: "1.5px solid var(--line-strong)", background: "var(--card)",
            font: "400 15px/1 var(--font-sans)", color: "var(--txt-strong)", outline: "none",
          }} />
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
   32. 채팅 (통합 목록) — 팀 대화 / 개인 대화 필터. 하단 탭 '채팅'의 진입 화면.
   ══════════════════════════════════════════════════════════ */
function ScrChatHub({ go, tab, setTab, onOpenDm }) {
  const [filter, setFilter] = React.useState("all");
  const dmUnread = D5.dmThreads.reduce((s, t) => s + t.unread, 0);
  const showTeam = filter !== "dm";
  const showDm = filter !== "team";
  return (
    <Phone label="32 채팅">
      <Status />
      <Bar title="채팅" sub={D5.team.name} />
      <Body dense>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {[["all", "전체"], ["team", "팀 대화"], ["dm", "개인 대화"]].map(([k, l]) => {
            const on = filter === k;
            return (
              <button type="button" key={k} onClick={() => setFilter(k)} style={{
                minHeight: 40, padding: "0 14px", borderRadius: 12, cursor: "pointer",
                font: "700 13px/1 var(--font-sans)",
                background: on ? "var(--ink-700)" : "var(--card)", color: on ? "var(--on-action)" : "var(--txt)",
                border: "1px solid " + (on ? "transparent" : "var(--line)"),
              }}>{l}</button>
            );
          })}
        </div>
        {showTeam ? (
          <React.Fragment>
            <SecTitle note="팀 전체가 보는 대화방 1개">팀 대화</SecTitle>
            <Rows style={{ marginBottom: showDm ? 16 : 0 }}>
              <button type="button" onClick={() => go("chat")} style={{
                width: "100%", boxSizing: "border-box", textAlign: "left", background: "none", border: "none",
                cursor: "pointer", padding: "13px 15px", minHeight: 60, display: "flex", alignItems: "center", gap: 12,
              }}>
                <span style={{ width: 42, height: 42, flex: "0 0 auto", borderRadius: 999, background: "var(--y-100)", display: "grid", placeItems: "center", color: "var(--y-700)" }}>
                  <Icon name="users-round" size={19} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ font: "700 15px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>{D5.team.name}</span>
                    <span style={{ font: "500 12px/1.4 var(--font-sans)", color: "var(--txt-faint)", marginLeft: "auto" }}>{D5.chat.messages[D5.chat.messages.length - 1].time}</span>
                  </span>
                  <span style={{
                    display: "block", font: "400 13.5px/1.5 var(--font-sans)", color: "var(--txt-muted)", marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{D5.chat.messages[D5.chat.messages.length - 1].who}: {D5.chat.messages[D5.chat.messages.length - 1].text}</span>
                </span>
              </button>
            </Rows>
          </React.Fragment>
        ) : null}
        {showDm ? (
          <React.Fragment>
            <SecTitle note="팀원과 나눈 1:1 대화">개인 대화 {D5.dmThreads.length}개</SecTitle>
            <Rows>
              {D5.dmThreads.map((t) => (
                <button type="button" key={t.name} onClick={() => onOpenDm(t.name)} style={{
                  width: "100%", boxSizing: "border-box", textAlign: "left", background: "none", border: "none",
                  cursor: "pointer", padding: "13px 15px", minHeight: 60, display: "flex", alignItems: "center", gap: 12,
                }}>
                  <Avatar name={t.name} mbti={t.mbti} size={42} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ font: "700 15px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>{t.name}</span>
                      <span style={{ font: "500 12px/1.4 var(--font-sans)", color: "var(--txt-faint)", marginLeft: "auto" }}>{t.time}</span>
                    </span>
                    <span style={{
                      display: "block", font: (t.unread ? "600" : "400") + " 13.5px/1.5 var(--font-sans)",
                      color: t.unread ? "var(--txt-strong)" : "var(--txt-muted)", marginTop: 2,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{t.lastMsg}</span>
                  </span>
                  {t.unread ? (
                    <span style={{
                      minWidth: 20, height: 20, boxSizing: "border-box", padding: "0 5px", borderRadius: 999,
                      background: "var(--c-400)", color: "var(--ink-900)", font: "700 12px/20px var(--font-sans)", textAlign: "center", flex: "0 0 auto",
                    }}>{t.unread}</span>
                  ) : null}
                </button>
              ))}
            </Rows>
          </React.Fragment>
        ) : null}
      </Body>
      <TabBar value={tab} onChange={setTab} pending={{ chat: dmUnread || undefined }} />
    </Phone>
  );
}

/* ══════════════════════════════════════════════════════════
   33. 채팅 — PC 화면 예시 (1024px 이상). 목록 / 메시지 / 선택한 정보 3분할.
   모바일(600px 미만)은 기존 32·19·31번처럼 한 화면씩 순차 이동한다.
   ══════════════════════════════════════════════════════════ */
function ScrChatDesktop() {
  const msgs = D5.chat.messages;
  return (
    <div data-screen-label="33 채팅 · PC 3분할 예시" style={{
      width: 1040, height: 640, flex: "0 0 auto", background: "var(--page)", borderRadius: 20,
      border: "1px solid var(--line-strong)", boxShadow: "var(--sh-lg)", overflow: "hidden",
      display: "flex",
    }}>
      <div style={{ width: 260, flex: "0 0 auto", borderRight: "1px solid var(--line)", background: "var(--card)", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "16px 16px 10px", font: "800 15px/1.3 var(--font-sans)", color: "var(--txt-strong)" }}>채팅</div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          <div style={{ padding: "12px 16px", background: "var(--y-100)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 999, background: "var(--y-200)", display: "grid", placeItems: "center", color: "var(--y-700)", flex: "0 0 auto" }}><Icon name="users-round" size={16} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", font: "700 13.5px/1.3 var(--font-sans)", color: "var(--txt-strong)" }}>{D5.team.name}</span>
              <span style={{ display: "block", font: "500 12px/1.3 var(--font-sans)", color: "var(--txt-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{msgs[msgs.length - 1].who}: {msgs[msgs.length - 1].text}</span>
            </span>
          </div>
          {D5.dmThreads.map((t) => (
            <div key={t.name} style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
              <Avatar name={t.name} mbti={t.mbti} size={34} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", font: "600 13.5px/1.3 var(--font-sans)", color: "var(--txt-strong)" }}>{t.name}</span>
                <span style={{ display: "block", font: "500 12px/1.3 var(--font-sans)", color: "var(--txt-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.lastMsg}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line)", font: "700 15px/1.3 var(--font-sans)", color: "var(--txt-strong)" }}>{D5.team.name}</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {msgs.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: m.me ? "row-reverse" : "row" }}>
              <Avatar name={m.who} mbti={m.mbti} size={28} />
              <div style={{
                maxWidth: "60%", padding: "9px 12px", borderRadius: 14, font: "400 14px/1.5 var(--font-sans)",
                background: m.me ? "var(--y-300)" : "var(--card)", border: m.me ? "none" : "1px solid var(--line)",
                color: "var(--txt-strong)", wordBreak: "keep-all",
              }}>{m.text}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
          <div style={{ flex: 1, minHeight: 42, borderRadius: 999, border: "1.5px solid var(--input-border)", background: "var(--card)" }} />
          <span style={{ width: 42, height: 42, borderRadius: 999, background: "var(--ink-700)", display: "grid", placeItems: "center", color: "var(--on-action)" }}><Icon name="send" size={16} /></span>
        </div>
      </div>
      <div style={{ width: 260, flex: "0 0 auto", borderLeft: "1px solid var(--line)", background: "var(--card)", padding: "16px" }}>
        <div style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginBottom: 10 }}>선택한 자료·정보</div>
        <Panel s="fill" pad={12} r={14} style={{ marginBottom: 10 }}>
          <div style={{ font: "600 13.5px/1.4 var(--font-sans)", color: "var(--txt-strong)" }}>발표자료 v4</div>
          <div style={{ font: "500 12px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginTop: 3 }}>어제 수정 · 이서연</div>
        </Panel>
        <div style={{ font: "500 12.5px/1.6 var(--font-sans)", color: "var(--txt-faint)", wordBreak: "keep-all" }}>
          600~1023px에서는 목록·상세를 선택적으로 나누고, 600px 미만(모바일)에서는 화면을 순서대로 넘겨 같은 정보를 보여줍니다.
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScrDmList, ScrDm, ScrChatHub, ScrChatDesktop });
