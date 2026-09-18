/* Icon — lucide UMD에서 직접 그린다.
   이 페이지는 _ds_bundle.js 를 읽지 않는다: 컴파일러가 이 파일들을 번들에도 다시 넣고
   스스로 실행하기 때문에, 번들을 같이 로드하면 같은 컴포넌트가 두 번 겹쳐 실행된다. */
const LU = (typeof window !== "undefined" && window.lucide) || {};
const PASCAL = (n) => String(n).split("-").map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join("");
function Icon({ name, size = 20, strokeWidth = 2, color = "currentColor", style }) {
  const node = (LU.icons || {})[PASCAL(name)];
  const box = { width: size, height: size, display: "block", flex: "0 0 auto", ...style };
  /* lucide UMD 노드는 ["svg", attrs, children] 또는 children 배열 두 형태로 온다 */
  const kids = Array.isArray(node) ? (Array.isArray(node[2]) ? node[2] : node) : null;
  if (!kids || !kids.length || !Array.isArray(kids[0])) return React.createElement("span", { style: box, "aria-hidden": "true" });
  return React.createElement("svg", {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color,
    strokeWidth, strokeLinecap: "round", strokeLinejoin: "round", style: box, "aria-hidden": "true",
  }, kids.map((c, i) => (typeof c[0] === "string" ? React.createElement(c[0], { key: i, ...c[1] }) : null)));
}

/* ── 표면 규칙: 테두리와 그림자를 동시에 쓰지 않는다 ── */
const S = {
  card: { background: "var(--card)", border: "1px solid var(--line)", boxShadow: "none" },
  fill: { background: "var(--fill)", border: "1px solid transparent", boxShadow: "none" },
  cream: { background: "var(--cr-25)", border: "1px solid var(--line)", boxShadow: "none" },
  yellow: { background: "var(--y-100)", border: "1px solid transparent", boxShadow: "none" },
  coral: { background: "var(--c-100)", border: "1px solid transparent", boxShadow: "none" },
  sel: { background: "var(--y-100)", border: "1.5px solid var(--y-500)", boxShadow: "none" },
  raise: { background: "var(--card)", border: "none", boxShadow: "var(--sh-lg)" },
};

function Phone({ children, label, w = 390 }) {
  return (
    <div className="cd3" data-screen-label={label} style={{
      width: w, height: 812, flex: "0 0 auto", background: "var(--page)", borderRadius: 34,
      border: "1px solid var(--line-strong)", boxShadow: "var(--sh-lg)", overflow: "hidden",
      position: "relative", display: "flex", flexDirection: "column",
    }}>{children}</div>
  );
}

function Status({ tone }) {
  return (
    <div style={{
      minHeight: 44, flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 20px", font: "600 13px/1 var(--font-sans)", color: "var(--txt-strong)",
      background: tone === "y" ? "var(--y-100)" : tone === "ink" ? "var(--ink-700)" : "transparent",
      ...(tone === "ink" ? { color: "var(--on-action)" } : null),
    }}>
      <span>9:41</span>
      <span style={{ display: "flex", gap: 5, alignItems: "center", opacity: .8 }}>
        <Icon name="signal" size={13} /><Icon name="wifi" size={13} /><Icon name="battery-full" size={15} />
      </span>
    </div>
  );
}

/** 상단바 — 제목은 화면 목적만. 진행 단계는 sub 로 */
function Bar({ title, sub, onBack, action, onAction, tone }) {
  return (
    <div style={{
      flex: "0 0 auto", minHeight: 52, display: "flex", alignItems: "center", gap: 4,
      padding: "0 6px 0 " + (onBack ? "2px" : "18px"),
      background: tone === "y" ? "var(--y-100)" : "rgba(255,253,249,.94)",
      backdropFilter: "blur(12px)", borderBottom: "1px solid " + (tone === "y" ? "transparent" : "var(--line)"),
    }}>
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="뒤로" style={{
          width: 44, height: 44, display: "grid", placeItems: "center", color: "var(--txt)",
          background: "none", border: "none", cursor: "pointer", borderRadius: 12,
        }}><Icon name="chevron-left" size={22} /></button>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "600 15px/1.35 var(--font-sans)", color: "var(--txt-strong)", letterSpacing: "-.012em", wordBreak: "keep-all" }}>{title}</div>
        {sub ? <div style={{ font: "500 13px/1.35 var(--font-sans)", color: "var(--txt-muted)" }}>{sub}</div> : null}
      </div>
      {action ? (
        <button type="button" onClick={onAction} aria-label={action} style={{
          width: 44, height: 44, display: "grid", placeItems: "center", color: "var(--txt)",
          background: "none", border: "none", cursor: "pointer", borderRadius: 12,
        }}><Icon name={action} size={20} /></button>
      ) : null}
    </div>
  );
}

/** 본문. dense = 목록·시간표 화면(좌우 16), 기본 = 소개·입력 화면(좌우 20) */
function Body({ children, dense, tone, pad = 104, style }) {
  return (
    <div style={{
      flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden",
      background: tone === "y" ? "var(--y-100)" : "transparent",
      padding: (dense ? "12px 16px " : "16px 20px ") + pad + "px", ...style,
    }}>{children}</div>
  );
}

const TABS = [
  { v: "home", label: "홈", icon: "house" },
  { v: "chat", label: "채팅", icon: "messages-square" },
  { v: "cal", label: "일정", icon: "calendar-check" },
  { v: "drive", label: "드라이브", icon: "folder-open" },
  { v: "team", label: "팀", icon: "users-round" },
];

function TabBar({ value, onChange, pending = {} }) {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, background: "rgba(255,253,249,.96)",
      backdropFilter: "blur(12px)", borderTop: "1px solid var(--line)", paddingBottom: 16,
    }}>
      <div style={{ display: "flex" }}>
        {TABS.map((t) => {
          const on = t.v === value;
          return (
            <button type="button" key={t.v} onClick={() => onChange && onChange(t.v)} style={{
              flex: 1, minWidth: 0, minHeight: 54, display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: 3, background: "none", border: "none", cursor: "pointer",
              color: on ? "var(--txt-strong)" : "var(--txt-faint)", position: "relative",
            }}>
              <span data-overhang="badge" style={{ position: "relative", display: "inline-flex" }}>
                <Icon name={t.icon} size={21} strokeWidth={on ? 2.4 : 1.9} />
                {pending[t.v] ? <span style={{
                  position: "absolute", top: -4, right: -7, minWidth: 17, height: 17, boxSizing: "border-box",
                  padding: "0 4px", borderRadius: 999, background: "var(--c-400)", color: "var(--ink-900)",
                  font: "700 11px/17px var(--font-sans)", textAlign: "center",
                }}>{pending[t.v]}</span> : null}
              </span>
              <span style={{ font: (on ? "700" : "500") + " 11px/1.2 var(--font-sans)", whiteSpace: "nowrap" }}>{t.label}</span>
              {on ? <span style={{ position: "absolute", top: 0, width: 22, height: 3, borderRadius: 2, background: "var(--y-400)" }} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Panel({ children, s = "card", pad = 16, r = 20, style, onClick }) {
  return (
    <div onClick={onClick} style={{
      borderRadius: r, padding: pad, ...S[s],
      ...(onClick ? { cursor: "pointer" } : null), ...style,
    }}>{children}</div>
  );
}

/** 연속된 항목은 카드가 아니라 한 면 + 구분선 */
function Rows({ children, s = "card", style }) {
  const kids = React.Children.toArray(children);
  return (
    <div style={{ borderRadius: 20, overflow: "hidden", ...S[s], ...style }}>
      {kids.map((c, i) => <div key={i} style={{ borderTop: i ? "1px solid var(--line)" : "none" }}>{c}</div>)}
    </div>
  );
}

function SecTitle({ children, note, action, onAction, style }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, margin: "0 0 8px", ...style }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ font: "700 15px/1.4 var(--font-sans)", color: "var(--txt-strong)", letterSpacing: "-.012em", margin: 0, wordBreak: "keep-all" }}>{children}</h3>
        {note ? <div style={{ font: "500 13px/1.45 var(--font-sans)", color: "var(--txt-muted)", marginTop: 2, wordBreak: "keep-all" }}>{note}</div> : null}
      </div>
      {action ? (
        <button type="button" onClick={onAction} style={{
          display: "inline-flex", alignItems: "center", gap: 2, font: "600 13px/1 var(--font-sans)",
          color: "var(--link)", background: "none", border: "none", cursor: "pointer", flex: "0 0 auto", padding: "6px 0",
        }}>{action}<Icon name="chevron-right" size={13} /></button>
      ) : null}
    </div>
  );
}

/* ── 버튼: 채운 버튼은 화면에 하나. 비활성은 투명도가 아니라 명시 팔레트 ── */
const BTN = {
  primary: { background: "var(--action)", color: "var(--on-action)", border: "1px solid transparent" },
  yellow: { background: "var(--y-400)", color: "var(--ink-900)", border: "1px solid transparent" },
  outline: { background: "var(--card)", color: "var(--txt-strong)", border: "1px solid var(--line-strong)" },
  soft: { background: "var(--fill)", color: "var(--txt-strong)", border: "1px solid transparent" },
  ghost: { background: "transparent", color: "var(--link)", border: "1px solid transparent" },
  off: { background: "var(--fill)", color: "var(--txt-disabled)", border: "1px solid var(--line)" },
};
function Btn({ children, v = "primary", size = "md", icon, iconRight, full, disabled, onClick, style }) {
  const look = disabled ? BTN.off : BTN[v];
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled} style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
      minHeight: size === "lg" ? 52 : 44, padding: size === "sm" ? "8px 13px" : "9px 17px",
      width: full ? "100%" : "auto", maxWidth: "100%", borderRadius: 14,
      font: "700 " + (size === "sm" ? "13px" : "15px") + "/1.3 var(--font-sans)",
      cursor: disabled ? "default" : "pointer", wordBreak: "keep-all", ...look, ...style,
    }}>
      {icon ? <span style={{ flex: "0 0 auto", display: "inline-flex" }}><Icon name={icon} size={size === "sm" ? 15 : 17} /></span> : null}
      {children}
      {iconRight ? <span style={{ flex: "0 0 auto", display: "inline-flex" }}><Icon name={iconRight} size={size === "sm" ? 15 : 17} /></span> : null}
    </button>
  );
}

/** 상태 라벨 — 색만으로 구분하지 않도록 텍스트를 항상 함께 둔다 */
function Chip({ tone = "n", icon, children, style }) {
  const t = {
    n: { bg: "var(--fill)", fg: "var(--ink-600)", bd: "var(--line)" },
    ok: { bg: "var(--ok-bg)", fg: "#2F5F52", bd: "#CADDD6" },
    warn: { bg: "var(--warn-bg)", fg: "#6F5219", bd: "#E8D7AE" },
    err: { bg: "var(--err-bg)", fg: "#8A3B31", bd: "#EFCEC7" },
    want: { bg: "var(--ok-bg)", fg: "#2F5F52", bd: "#CADDD6" },
    veto: { bg: "var(--err-bg)", fg: "#8A3B31", bd: "#EFCEC7" },
    y: { bg: "var(--y-200)", fg: "#7A5E12", bd: "transparent" },
  }[tone];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 9px", borderRadius: 9,
      background: t.bg, color: t.fg, border: "1px solid " + t.bd,
      font: "600 13px/1.4 var(--font-sans)", maxWidth: "100%", wordBreak: "keep-all", ...style,
    }}>
      {icon ? <span style={{ flex: "0 0 auto", display: "inline-flex", alignSelf: "center" }}><Icon name={icon} size={13} /></span> : null}
      {children}
    </span>
  );
}

/** 안내·고지 — 채우기만 */
function Note({ tone = "info", title, icon, children, style }) {
  const t = {
    info: { bg: "var(--info-bg)", ink: "var(--focus)", fg: "var(--info)" },
    y: { bg: "var(--y-100)", ink: "#6B5312", fg: "var(--y-700)" },
    warn: { bg: "var(--warn-bg)", ink: "#6F5219", fg: "var(--warn)" },
    err: { bg: "var(--err-bg)", ink: "#8A3B31", fg: "var(--err)" },
  }[tone];
  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: 14, background: t.bg, ...style }}>
      <span style={{ flex: "0 0 auto", marginTop: 1, color: t.fg }}><Icon name={icon || "info"} size={17} /></span>
      <div style={{ minWidth: 0 }}>
        {title ? <div style={{ font: "700 14px/1.45 var(--font-sans)", color: t.ink, marginBottom: 3, wordBreak: "keep-all" }}>{title}</div> : null}
        <div style={{ font: "400 14px/1.6 var(--font-sans)", color: t.ink, wordBreak: "keep-all", textWrap: "pretty" }}>{children}</div>
      </div>
    </div>
  );
}

/** 문서에 규칙이 없는 지점을 화면에서 지어내지 않고 이렇게 표시한다 */
/* 개발·검토 모드 토글 — 사용자 화면에는 기본적으로 숨기고, 켜졌을 때만 점선 박스로 나타난다 */
function useReviewMode() {
  const [on, setOn] = React.useState(typeof window !== "undefined" && !!window.__CD3_REVIEW__);
  React.useEffect(() => {
    const h = () => setOn(!!window.__CD3_REVIEW__);
    window.addEventListener("cd3-review-toggle", h);
    return () => window.removeEventListener("cd3-review-toggle", h);
  }, []);
  return on;
}
function toggleReviewMode() {
  window.__CD3_REVIEW__ = !window.__CD3_REVIEW__;
  window.dispatchEvent(new Event("cd3-review-toggle"));
}

function Undecided({ children }) {
  const review = useReviewMode();
  if (!review) return null;
  return (
    <div style={{
      display: "flex", gap: 8, padding: "10px 12px", borderRadius: 12,
      background: "repeating-linear-gradient(135deg,var(--cr-100) 0 6px,var(--cr-25) 6px 12px)",
      border: "1px dashed var(--input-border)",
    }}>
      <span style={{ flex: "0 0 auto", marginTop: 1, color: "var(--txt-faint)" }}><Icon name="circle-dashed" size={15} /></span>
      <div style={{ font: "500 13px/1.55 var(--font-sans)", color: "var(--ink-500)", wordBreak: "keep-all", textWrap: "pretty" }}>
        <b style={{ fontWeight: 700, color: "var(--ink-600)" }}>[검토] 기획안에 규칙 없음 · 확인 필요</b> — {children}
      </div>
    </div>
  );
}

/** 팀원 자리 — 16종 캐릭터 이미지(assets/characters/&lt;MBTI&gt;.png)가 제공되어
    MBTI가 있으면 해당 캐릭터를, 없으면 이름 첫 글자 모노그램(점선 원)을 대신 표시한다. */
function Avatar({ name, mbti, size = 36 }) {
  if (mbti) {
    return (
      <span style={{
        width: size, height: size, flex: "0 0 auto", borderRadius: 999, overflow: "hidden",
        display: "block", background: "var(--y-100)", border: "1px solid var(--line)",
      }}>
        <img src={"assets/characters/" + mbti + ".png"} alt={mbti + " 캐릭터"}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </span>
    );
  }
  const ch = (name || "?").trim().charAt(0) || "?";
  return (
    <span title="MBTI 미입력 — 캐릭터 미배정, 이름 모노그램으로 대신 표시" style={{
      width: size, height: size, flex: "0 0 auto", borderRadius: 999, background: "var(--fill)",
      border: "1px dashed var(--line-strong)", display: "grid", placeItems: "center",
      font: "700 " + Math.round(size * 0.42) + "px/1 var(--font-sans)", color: "var(--txt-muted)",
    }}>{ch}</span>
  );
}

/** 상태 어휘 통일 — 미입력·대기·진행 중·완료·실패·준비 중을 드라이브·버전·할 일에서 같은 색·아이콘으로 표시한다 */
const STATUS = {
  none: { label: "미입력", tone: "n", icon: "circle-dashed" },
  todo: { label: "할 일", tone: "n", icon: "circle" },
  waiting: { label: "대기", tone: "warn", icon: "clock" },
  doing: { label: "진행 중", tone: "y", icon: "circle-dot" },
  done: { label: "완료", tone: "ok", icon: "check" },
  late: { label: "마감 후 제출", tone: "err", icon: "alarm-clock" },
  failed: { label: "실패", tone: "err", icon: "circle-alert" },
  ready: { label: "준비 중", tone: "n", icon: "circle-dashed" },
};
function StatusBadge({ status, children, style }) {
  const s = STATUS[status] || STATUS.none;
  return <Chip tone={s.tone} icon={s.icon} style={style}>{children || s.label}</Chip>;
}

/** AI 도구 공통 — 원문/결과 비교 카드. 모바일에서는 위아래로 쌓이고, PC 폭에서는 좌우로 나란히 놓인다. */
function CompareCard({ inputLabel = "원문", input, resultLabel = "AI 초안", result, resultColor = "#8A3B29" }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)", marginBottom: 6 }}>{inputLabel}</div>
        <Panel s="fill" pad={14} r={16}>
          <div style={{ font: "400 14.5px/1.6 var(--font-sans)", color: "var(--txt-strong)", wordBreak: "keep-all", textWrap: "pretty" }}>{input}</div>
        </Panel>
      </div>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ font: "700 13px/1.4 var(--font-sans)", color: "var(--txt-muted)" }}>{resultLabel}</span>
          <Chip tone="y" icon="sparkles">AI 초안</Chip>
        </div>
        <Panel s="coral" pad={14} r={16}>
          <div style={{ font: "400 15px/1.65 var(--font-sans)", color: resultColor, wordBreak: "keep-all", textWrap: "pretty" }}>{result}</div>
        </Panel>
      </div>
    </div>
  );
}

function Progress({ step, total, style }) {
  return (
    <div style={{ display: "flex", gap: 4, ...style }}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} style={{
          flex: 1, height: 4, borderRadius: 2,
          background: i < step ? "var(--y-400)" : "var(--cr-200)",
        }} />
      ))}
    </div>
  );
}

function Field({ label, hint, error, children, required }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", font: "700 14px/1.4 var(--font-sans)", color: "var(--txt-strong)", marginBottom: 6 }}>
        {label}{required ? null : <span style={{ fontWeight: 500, color: "var(--txt-muted)" }}> · 선택</span>}
      </label>
      {children}
      {error ? (
        <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 7 }}>
          <span style={{ marginTop: 1, color: "var(--err)", flex: "0 0 auto", display: "inline-flex" }}><Icon name="circle-alert" size={15} /></span>
          <span style={{ font: "600 13px/1.5 var(--font-sans)", color: "var(--err)", wordBreak: "keep-all" }}>{error}</span>
        </div>
      ) : hint ? (
        <div style={{ font: "400 13px/1.55 var(--font-sans)", color: "var(--txt-muted)", marginTop: 6, wordBreak: "keep-all", textWrap: "pretty" }}>{hint}</div>
      ) : null}
    </div>
  );
}

function Input({ value, onChange, placeholder, error, mono }) {
  return (
    <input value={value} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder} style={{
      width: "100%", boxSizing: "border-box", minHeight: 52, padding: "0 14px", borderRadius: 14,
      border: "1.5px solid " + (error ? "var(--err)" : "var(--input-border)"), background: "var(--card)",
      font: "400 16px/1 " + (mono ? "var(--font-mono)" : "var(--font-sans)"), color: "var(--txt-strong)", outline: "none",
    }} />
  );
}

/** 하단 고정 행동 바 — 탭바 위에 겹칠 때만 씀 */
function Dock({ children, above = 0 }) {
  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: above, padding: "12px 16px " + (above ? "12px" : "22px"),
      background: "rgba(255,253,249,.96)", backdropFilter: "blur(12px)", borderTop: "1px solid var(--line)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>{children}</div>
  );
}

function Sheet({ open, title, onClose, children }) {
  if (!open) return null;
  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, background: "rgba(36,28,20,.38)", display: "flex",
      alignItems: "flex-end", zIndex: 30,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: "100%", background: "var(--card)", borderRadius: "28px 28px 0 0", padding: "8px 20px 26px",
        boxShadow: "var(--sh-lg)", maxHeight: "86%", overflowY: "auto",
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--cr-300)", margin: "6px auto 14px" }} />
        {title ? <h3 style={{ font: "700 19px/1.35 var(--font-sans)", color: "var(--txt-strong)", letterSpacing: "-.02em", margin: "0 0 12px", wordBreak: "keep-all" }}>{title}</h3> : null}
        {children}
      </div>
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position: "absolute", left: 16, right: 16, bottom: 88, zIndex: 40,
      background: "var(--ink-800)", color: "var(--on-action)", borderRadius: 14, padding: "12px 16px",
      font: "600 14px/1.45 var(--font-sans)", boxShadow: "var(--sh-lg)", wordBreak: "keep-all",
    }}>{msg}</div>
  );
}

Object.assign(window, { Icon, S, Phone, Status, Bar, Body, TabBar, TABS, Panel, Rows, SecTitle, Btn, Chip, Note, Undecided, useReviewMode, toggleReviewMode, Avatar, Progress, Field, Input, Dock, Sheet, Toast, STATUS, StatusBadge, CompareCard });
