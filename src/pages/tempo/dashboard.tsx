import React, { useState, useMemo } from "react";
import {
  MILES,
  SCOPE_COLORS,
  OWNER,
  SHIFTS,
  type TimeEvent,
} from "./constants";
import {
  getAllEvents,
  getManagerCreds,
  addManagerCred,
  removeManagerCred,
  verifyDashboardLogin,
  formatDuration,
  formatTime,
  getTodayStr,
} from "./storage";

// ─── Theme (matches tool) ─────────────────────────────────────────────────────
const NAVBAR   = "#2563eb";
const BG       = "#f0f4ff";
const WHITE    = "#ffffff";
const BORDER   = "#e0e7ff";
const MUTED    = "#6b7280";
const ACCENT   = "#2563eb";
const TEXT     = "#1e1a2e";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDayStr(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
function getWeekDates(offset = 0): string[] {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}
function evtSecs(e: TimeEvent): number {
  if (!e.endTime) return 0;
  return Math.round((new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 1000);
}
function exportToCSV(events: TimeEvent[], filename: string) {
  const headers = ["Date","Login","Mile","Shift","Scope","Function Type","Start","End","Duration (sec)","Note"];
  const rows = events.map((e) => [
    e.date, e.login, e.mile, e.shiftCode, e.scope, e.functionType,
    e.startTime ? new Date(e.startTime).toLocaleString() : "",
    e.endTime   ? new Date(e.endTime).toLocaleString()   : "",
    evtSecs(e), e.note || "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = ACCENT }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: WHITE, border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 20px", borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" as const, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: TEXT }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Horizontal Bar ───────────────────────────────────────────────────────────
function HBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
      <div style={{ minWidth: 110, fontSize: 11, color: TEXT }}>{label}</div>
      <div style={{ flex: 1, height: 8, background: "#e8eaf0", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.5s" }} />
      </div>
      <div style={{ minWidth: 36, textAlign: "right" as const, fontSize: 11, fontWeight: 700, color }}>{Math.round(pct)}%</div>
      <div style={{ minWidth: 58, textAlign: "right" as const, fontSize: 10, color: MUTED }}>{formatDuration(value)}</div>
    </div>
  );
}

// ─── Scope Badge ──────────────────────────────────────────────────────────────
function ScopeBadge({ scope }: { scope: string }) {
  const c = SCOPE_COLORS[scope] || "#888";
  return (
    <span style={{ background: c + "22", color: c, borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700, display: "inline-block", whiteSpace: "nowrap" as const }}>{scope}</span>
  );
}

// ─── Role ─────────────────────────────────────────────────────────────────────
type Role = "owner" | "manager";

// ─── Dashboard ────────────────────────────────────────────────────────────────
type DashTab = "overview" | "benchmark" | "livelog" | "managers";

export default function TempoDashboard() {
  // ── Auth ──
  const [role,         setRole]         = useState<Role | null>(null);
  const [aliasInput,   setAliasInput]   = useState("");
  const [passInput,    setPassInput]    = useState("");
  const [loginError,   setLoginError]   = useState("");
  const [currentLogin, setCurrentLogin] = useState("");

  const handleLogin = () => {
    const r = verifyDashboardLogin(aliasInput, passInput);
    if (!r) { setLoginError("Invalid alias or password."); return; }
    setRole(r);
    setCurrentLogin(aliasInput.trim().toLowerCase());
    setLoginError("");
  };

  // ── Tabs + filters ──
  const [tab,         setTab]         = useState<DashTab>("overview");
  const [filterMile,  setFilterMile]  = useState("ALL");
  const [filterFrom,  setFilterFrom]  = useState(getDayStr(-7));
  const [filterTo,    setFilterTo]    = useState(getTodayStr());
  const [filterLogin, setFilterLogin] = useState("");
  const [dodOffset,   setDodOffset]   = useState(0);
  const [wowOffset,   setWowOffset]   = useState(0);
  const [bmMile,      setBmMile]      = useState("ALL");

  // Manager credentials (owner only)
  const [mgrs,        setMgrsState]   = useState(() => getManagerCreds());
  const [newAlias,    setNewAlias]    = useState("");
  const [newPass,     setNewPass]     = useState("");
  const [newPassErr,  setNewPassErr]  = useState("");

  const today    = getTodayStr();
  const allEvents = useMemo(() => getAllEvents(), [tab]);
  const allLogins = useMemo(() => [...new Set(allEvents.map((e) => e.login))].sort(), [allEvents]);

  const filteredEvents = useMemo(() => allEvents.filter((e) => {
    if (filterMile !== "ALL" && e.mile !== filterMile) return false;
    if (e.date < filterFrom || e.date > filterTo)       return false;
    if (filterLogin && !e.login.includes(filterLogin))  return false;
    return true;
  }), [allEvents, filterMile, filterFrom, filterTo, filterLogin]);

  // overview stats
  const completedFiltered = filteredEvents.filter((e) => e.endTime);
  const totalSecs  = completedFiltered.reduce((a, e) => a + evtSecs(e), 0);
  const uniqueUsers = [...new Set(completedFiltered.map((e) => e.login))].length;

  const scopeMap: Record<string,number> = {};
  completedFiltered.forEach((e) => { scopeMap[e.scope] = (scopeMap[e.scope]||0) + evtSecs(e); });
  const scopeEntries = Object.entries(scopeMap).sort((a,b)=>b[1]-a[1]);
  const scopeTotal   = scopeEntries.reduce((a,[,v])=>a+v,0);

  // DOD
  const todayDate = getDayStr(dodOffset);
  const yestDate  = getDayStr(dodOffset - 1);
  const getScopeMap = (dates: string[], mile: string) => {
    const m: Record<string,number> = {};
    allEvents.filter((e) => e.endTime && dates.includes(e.date) && (mile==="ALL"||e.mile===mile))
      .forEach((e) => { m[e.scope]=(m[e.scope]||0)+evtSecs(e); });
    return m;
  };
  const dodToday = getScopeMap([todayDate], bmMile);
  const dodYest  = getScopeMap([yestDate],  bmMile);
  const wowThis  = getScopeMap(getWeekDates(wowOffset),   bmMile);
  const wowLast  = getScopeMap(getWeekDates(wowOffset-1), bmMile);

  // Managers handlers (owner only)
  const refreshMgrs = () => setMgrsState(getManagerCreds());
  const handleAddMgr = () => {
    const a = newAlias.trim().toLowerCase();
    if (!a || !newPass.trim()) { setNewPassErr("Alias and password required"); return; }
    if (a === OWNER)            { setNewPassErr("Cannot add owner as manager"); return; }
    addManagerCred(a, newPass.trim());
    refreshMgrs();
    setNewAlias(""); setNewPass(""); setNewPassErr("");
  };
  const handleRemoveMgr = (login: string) => {
    if (login === OWNER) return;
    removeManagerCred(login);
    refreshMgrs();
  };

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!role) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background: BG, gap:20, fontFamily:"'Segoe UI',Arial,sans-serif" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ background: NAVBAR, color:"#fff", borderRadius:8, padding:"5px 20px", fontSize:18, fontWeight:900, letterSpacing:4, display:"inline-block" }}>TEMPO</div>
        <div style={{ fontSize:11, color:MUTED, marginTop:6, letterSpacing:1.5, textTransform:"uppercase" as const }}>Dashboard · Manager Access</div>
      </div>

      <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:14, padding:"28px 32px", width:380, boxShadow:"0 4px 24px #2563eb11" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <div style={{ width:38, height:38, borderRadius:"50%", background:"#eff6ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>🛡️</div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:TEXT }}>Sign In to Dashboard</div>
            <div style={{ fontSize:11, color:MUTED }}>Enter your alias and password to continue</div>
          </div>
        </div>

        <div style={{ fontSize:12, color:TEXT, marginBottom:4 }}>Amazon Alias</div>
        <input
          style={{ width:"100%", border:`1.5px solid ${BORDER}`, borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box" as const, color:TEXT, marginBottom:10 }}
          placeholder="e.g. prdmano"
          value={aliasInput}
          onChange={(e) => { setAliasInput(e.target.value); setLoginError(""); }}
          onKeyDown={(e) => e.key === "Enter" && (document.getElementById("dashPassInput") as HTMLInputElement)?.focus()}
          autoFocus
        />

        <div style={{ fontSize:12, color:TEXT, marginBottom:4 }}>Password</div>
        <input
          id="dashPassInput"
          type="password"
          style={{ width:"100%", border:`1.5px solid ${loginError ? "#ef4444" : BORDER}`, borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box" as const, color:TEXT, marginBottom: loginError ? 6 : 16 }}
          placeholder="Password"
          value={passInput}
          onChange={(e) => { setPassInput(e.target.value); setLoginError(""); }}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
        {loginError && <div style={{ fontSize:11, color:"#ef4444", marginBottom:12 }}>⚠ {loginError}</div>}

        <button onClick={handleLogin}
          style={{ width:"100%", background: NAVBAR, color:"#fff", border:"none", borderRadius:8, padding:"11px 0", fontSize:14, fontWeight:800, cursor:"pointer" }}>
          Sign In
        </button>

        <button
          onClick={() => window.location.href = window.location.href.replace("/dashboard", "/frame")}
          style={{ width:"100%", background:"transparent", color: MUTED, border:`1px solid ${BORDER}`, borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:600, cursor:"pointer", marginTop:8 }}>
          ← Back to TEMPO Tool
        </button>

        <div style={{ fontSize:10, color:MUTED, marginTop:12, textAlign:"center" as const }}>
          Contact <b>prdmano</b> to get access as a manager.
        </div>
      </div>
      <div style={{ fontSize:10, color:MUTED, opacity:0.5 }}>iCMRS · Created by prdmano</div>
    </div>
  );

  // ── Main Dashboard ────────────────────────────────────────────────────────
  const roleLabel = role === "owner" ? "OWNER" : "MANAGER";
  const roleColor = role === "owner" ? "#f59e0b" : "#22c55e";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"'Segoe UI',Arial,sans-serif", background: BG, overflow:"hidden" }}>

      {/* Navbar */}
      <div style={{ background: NAVBAR, color:"#fff", display:"flex", alignItems:"center", padding:"0 24px", height:50, flexShrink:0, gap:16, borderBottom:"2px solid #1d4ed8" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ background:"#fff", color: NAVBAR, borderRadius:4, padding:"2px 10px", fontWeight:900, fontSize:14, letterSpacing:2 }}>TEMPO</div>
          <div style={{ display:"flex", flexDirection:"column", lineHeight:1.1 }}>
            <span style={{ fontSize:11, fontWeight:600 }}>Dashboard</span>
            <span style={{ fontSize:9, color:"#bfdbfe" }}>Manager View</span>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4, marginLeft:24 }}>
          {([
            ["overview",  "📊 Overview"  ],
            ["benchmark", "📈 Benchmark" ],
            ["livelog",   "📋 Live Log"  ],
            ["managers",  "👥 Managers"  ],
          ] as [DashTab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ background: tab===t ? "rgba(255,255,255,0.2)" : "transparent", color:"#fff", border: tab===t ? "1px solid rgba(255,255,255,0.4)" : "1px solid transparent", borderRadius:7, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ flex:1 }} />

        {/* Role + user chip */}
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.12)", borderRadius:20, padding:"4px 12px 4px 8px" }}>
          <div style={{ width:26, height:26, borderRadius:"50%", background:"rgba(255,255,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700 }}>
            {currentLogin?.[0]?.toUpperCase() || "?"}
          </div>
          <div style={{ lineHeight:1.2 }}>
            <div style={{ fontSize:11, fontWeight:700 }}>{currentLogin}</div>
            <div style={{ fontSize:9, color: roleColor, fontWeight:700, letterSpacing:1 }}>{roleLabel}</div>
          </div>
        </div>

        <button onClick={() => { setRole(null); setAliasInput(""); setPassInput(""); }}
          style={{ background:"transparent", color:"#bfdbfe", border:"1px solid #93c5fd", borderRadius:6, padding:"4px 12px", fontSize:11, cursor:"pointer" }}>
          Sign Out
        </button>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:18 }}>

        {/* ══════ OVERVIEW ══════ */}
        {tab === "overview" && (<>
          {/* Filters */}
          <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, padding:"14px 20px", display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" as const }}>
            {[
              { label:"Mile",  el: <select style={sel} value={filterMile} onChange={(e)=>setFilterMile(e.target.value)}><option value="ALL">All Miles</option>{MILES.map(m=><option key={m}>{m}</option>)}</select> },
              { label:"From",  el: <input type="date" style={sel} value={filterFrom} onChange={(e)=>setFilterFrom(e.target.value)} /> },
              { label:"To",    el: <input type="date" style={sel} value={filterTo}   onChange={(e)=>setFilterTo(e.target.value)} /> },
              { label:"Login", el: <input style={sel} placeholder="Search alias…" value={filterLogin} onChange={(e)=>setFilterLogin(e.target.value)} /> },
            ].map(({ label, el }) => (
              <div key={label}>
                <div style={{ fontSize:10, fontWeight:700, color:MUTED, letterSpacing:1, marginBottom:4, textTransform:"uppercase" as const }}>{label}</div>
                {el}
              </div>
            ))}
          </div>

          {/* Stats */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14 }}>
            <StatCard label="Active Users"      value={String(uniqueUsers)}           color="#2563eb" />
            <StatCard label="Total Events"      value={String(completedFiltered.length)} color="#22c55e" />
            <StatCard label="Total Time"        value={formatDuration(totalSecs)}     color="#f59e0b" />
            <StatCard label="Avg per User"      value={uniqueUsers > 0 ? formatDuration(Math.round(totalSecs/uniqueUsers)) : "—"} color="#9333ea" />
          </div>

          {/* Scope breakdown */}
          <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, padding:"18px 22px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:TEXT, marginBottom:14 }}>Process Scope Breakdown</div>
            {scopeEntries.length === 0
              ? <div style={{ color:MUTED, fontSize:12 }}>No data for selected range</div>
              : scopeEntries.map(([k,v]) => <HBar key={k} label={k} value={v} total={scopeTotal} color={SCOPE_COLORS[k]||"#888"} />)
            }
          </div>

          {/* Per-user table */}
          <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, padding:"18px 22px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:TEXT, marginBottom:14 }}>Per User Summary</div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#f8f9ff" }}>
                    {["Login","Mile","Shift","Total Time","Direct","In-Direct","Break","Idle","OT","Events"].map((h)=>(
                      <th key={h} style={{ padding:"7px 10px", fontWeight:700, fontSize:10, color:MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${BORDER}`, textAlign:"left" as const, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allLogins.filter((l) => completedFiltered.some((e)=>e.login===l)).map((login) => {
                    const ue   = completedFiltered.filter((e)=>e.login===login);
                    const sum  = (ft: string[]) => ue.filter((e)=>ft.includes(e.functionType)||ft.includes(e.scope)).reduce((a,e)=>a+evtSecs(e),0);
                    const tot  = ue.reduce((a,e)=>a+evtSecs(e),0);
                    const miles = [...new Set(ue.map((e)=>e.mile))].join(", ");
                    const shifts= [...new Set(ue.map((e)=>e.shiftCode))].join(", ");
                    return (
                      <tr key={login} style={{ borderBottom:`1px solid #f0f4ff` }}>
                        <td style={td}><span style={{ fontWeight:700, color:ACCENT }}>{login}</span></td>
                        <td style={td}>{miles}</td>
                        <td style={td}>{shifts}</td>
                        <td style={{ ...td, fontWeight:700, color:TEXT }}>{formatDuration(tot)}</td>
                        <td style={td}>{formatDuration(sum(["Direct"]))}</td>
                        <td style={td}>{formatDuration(sum(["In-Direct","Indirect","Drills","Huddle","Break"]))}</td>
                        <td style={td}>{formatDuration(sum(["Break"]))}</td>
                        <td style={td}>{formatDuration(sum(["Idle","Idle / No Task"]))}</td>
                        <td style={td}>{formatDuration(sum(["OT"]))}</td>
                        <td style={td}>{ue.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* ══════ BENCHMARK ══════ */}
        {tab === "benchmark" && (() => {
          // Targets (matching image)
          const TARGET_DIRECT = 80;
          const TARGET_INDIRECT = 15;
          const TARGET_IDLE = 3;
          const TARGET_INNOVATION = 2;

          // Build per-date data for DOD (last 7 days) and per-week for WOW (last 3 weeks)
          // DOD: get last 7 dates ending at dodOffset
          const dodDates = Array.from({ length: 7 }, (_, i) => getDayStr(dodOffset - i));
          // WOW: get week numbers (current + 2 prior)
          const wowWeeks = [wowOffset, wowOffset - 1, wowOffset - 2];

          const getDateStats = (date: string, mile: string) => {
            const evts = allEvents.filter((e) =>
              e.endTime && e.date === date && (mile === "ALL" || e.mile === mile)
            );
            const users = [...new Set(evts.map((e) => e.login))].length;
            const totalS    = evts.reduce((a, e) => a + evtSecs(e), 0);
            const directS   = evts.filter((e) => e.functionType === "Direct").reduce((a, e) => a + evtSecs(e), 0);
            const indirectS = evts.filter((e) =>
              ["In-Direct","Indirect","Break"].includes(e.functionType) ||
              ["Drills","Huddle","Break","Handover","Learning","Rebuttals"].includes(e.scope)
            ).reduce((a, e) => a + evtSecs(e), 0);
            const idleS       = evts.filter((e) => e.functionType === "Idle" || e.scope === "Idle / No Task").reduce((a, e) => a + evtSecs(e), 0);
            const innovationS = evts.filter((e) => e.functionType === "Innovation" || e.scope.includes("Initiative")).reduce((a, e) => a + evtSecs(e), 0);

            // Available hrs = sum of each user's shift standard hours for this date
            const availableS = [...new Set(evts.map((e) => e.login))].reduce((sum, login) => {
              const userShift = evts.find((e) => e.login === login)?.shiftCode || "X";
              const sh = SHIFTS[userShift as keyof typeof SHIFTS];
              if (!sh?.start || !sh?.end) return sum + 8 * 3600; // X = default 8h
              const [sh1, sm1] = sh.start.split(":").map(Number);
              const [eh1, em1] = sh.end.split(":").map(Number);
              const startM = sh1 * 60 + sm1, endM = eh1 * 60 + em1;
              const hrs = endM > startM ? (endM - startM) / 60 : (1440 - startM + endM) / 60;
              // G = 9h, others = 8h
              return sum + Math.round(hrs) * 3600;
            }, 0);

            const toHrs = (s: number) => s > 0 ? (s / 3600).toFixed(1) : "0";
            const toPct = (s: number) => totalS > 0 ? Math.round((s / totalS) * 100) : 0;
            const otS      = totalS > availableS ? totalS - availableS : 0;
            const shortS   = totalS < availableS ? availableS - totalS : 0;
            const unknownS = Math.max(0, shortS - idleS);
            return { users, totalHrs: toHrs(totalS), availableHrs: toHrs(availableS), directHrs: toHrs(directS), indirectHrs: toHrs(indirectS), idleHrs: toHrs(idleS), innovationHrs: toHrs(innovationS), otHrs: toHrs(otS), unknownHrs: toHrs(unknownS), directPct: toPct(directS), indirectPct: toPct(indirectS), idlePct: toPct(idleS), innovationPct: toPct(innovationS) };
          };

          const getWeekStats = (offset: number, mile: string) => {
            const dates = getWeekDates(offset);
            const evts = allEvents.filter((e) => e.endTime && dates.includes(e.date) && (mile === "ALL" || e.mile === mile));
            const users     = [...new Set(evts.map((e) => e.login))].length;
            const totalS    = evts.reduce((a, e) => a + evtSecs(e), 0);
            const directS   = evts.filter((e) => e.functionType === "Direct").reduce((a, e) => a + evtSecs(e), 0);
            const indirectS = evts.filter((e) => ["In-Direct","Indirect","Break"].includes(e.functionType) || ["Drills","Huddle","Break","Handover","Learning","Rebuttals"].includes(e.scope)).reduce((a, e) => a + evtSecs(e), 0);
            const idleS       = evts.filter((e) => e.functionType === "Idle" || e.scope === "Idle / No Task").reduce((a, e) => a + evtSecs(e), 0);
            const innovationS = evts.filter((e) => e.functionType === "Innovation" || e.scope.includes("Initiative")).reduce((a, e) => a + evtSecs(e), 0);

            // Available hrs = per user × shift hrs × number of days they clocked in
            const availableS = [...new Set(evts.map((e) => e.login))].reduce((sum, login) => {
              const ue = evts.filter((e) => e.login === login);
              const daysActive = [...new Set(ue.map((e) => e.date))].length;
              const userShift  = ue[0]?.shiftCode || "X";
              const sh = SHIFTS[userShift as keyof typeof SHIFTS];
              if (!sh?.start || !sh?.end) return sum + daysActive * 8 * 3600;
              const [sh1, sm1] = sh.start.split(":").map(Number);
              const [eh1, em1] = sh.end.split(":").map(Number);
              const startM = sh1 * 60 + sm1, endM = eh1 * 60 + em1;
              const hrs = endM > startM ? (endM - startM) / 60 : (1440 - startM + endM) / 60;
              return sum + daysActive * Math.round(hrs) * 3600;
            }, 0);

            const toHrs2 = (s: number) => s > 0 ? (s / 3600).toFixed(1) : "0";
            const toPct2 = (s: number) => totalS > 0 ? Math.round((s / totalS) * 100) : 0;
            const otS2      = totalS > availableS ? totalS - availableS : 0;
            const shortS2   = totalS < availableS ? availableS - totalS : 0;
            const unknownS2 = Math.max(0, shortS2 - idleS);
            return { users, totalHrs: toHrs2(totalS), availableHrs: toHrs2(availableS), directHrs: toHrs2(directS), indirectHrs: toHrs2(indirectS), idleHrs: toHrs2(idleS), innovationHrs: toHrs2(innovationS), otHrs: toHrs2(otS2), unknownHrs: toHrs2(unknownS2), directPct: toPct2(directS), indirectPct: toPct2(indirectS), idlePct: toPct2(idleS), innovationPct: toPct2(innovationS) };
          };

          const dodStats = dodDates.map((d) => getDateStats(d, bmMile));
          const wowStats = wowWeeks.map((w) => getWeekStats(w, bmMile));

          // ── YTD stats (Year to Date) ─────────────────────────────────────
          const ytdYear = new Date().getFullYear().toString();
          const ytdEvts = allEvents.filter((e) =>
            e.endTime &&
            e.date.startsWith(ytdYear) &&
            (bmMile === "ALL" || e.mile === bmMile)
          );
          const ytdHC       = [...new Set(ytdEvts.map((e) => e.login))].length;
          const ytdTotalS   = ytdEvts.reduce((a, e) => a + evtSecs(e), 0);
          const ytdDirectS  = ytdEvts.filter((e) => e.functionType === "Direct").reduce((a, e) => a + evtSecs(e), 0);
          const ytdIndirectS= ytdEvts.filter((e) => ["In-Direct","Indirect","Break"].includes(e.functionType) || ["Drills","Huddle","Break","Handover","Learning","Rebuttals"].includes(e.scope)).reduce((a, e) => a + evtSecs(e), 0);
          const ytdIdleS    = ytdEvts.filter((e) => e.functionType === "Idle" || e.scope === "Idle / No Task").reduce((a, e) => a + evtSecs(e), 0);
          const ytdInnoS    = ytdEvts.filter((e) => e.functionType === "Innovation" || e.scope.includes("Initiative")).reduce((a, e) => a + evtSecs(e), 0);
          const toHrs = (s: number) => s > 0 ? (s / 3600).toFixed(1) : "0";

          // Aggregated stats for the header pills (latest day)
          const latest = dodStats[0];

          // Format date as "16 Apr"
          const fmtDate = (d: string) => {
            const dt = new Date(d + "T00:00:00");
            return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          };

          // Cell colour for % rows
          const pctColor = (val: number, target: number, isIdle = false) => {
            if (val === 0) return "transparent";
            if (isIdle) return val <= target ? "#dcfce7" : "#fee2e2";
            return val >= target ? "#dcfce7" : "#fee2e2";
          };
          const pctTextColor = (val: number, target: number, isIdle = false) => {
            if (val === 0) return TEXT;
            if (isIdle) return val <= target ? "#166534" : "#991b1b";
            return val >= target ? "#166534" : "#991b1b";
          };

          // Table header style
          const thStyle: React.CSSProperties = { padding:"6px 10px", fontSize:11, fontWeight:700, color:"#fff", textAlign:"center" as const, whiteSpace:"nowrap" as const, borderRight:"1px solid rgba(255,255,255,0.2)" };
          const attrTh: React.CSSProperties = { padding:"6px 10px", fontSize:11, fontWeight:700, color:"#fff", textAlign:"left" as const, background:"#2563eb", borderRight:"1px solid rgba(255,255,255,0.2)", minWidth:110 };
          const cellStyle: React.CSSProperties = { padding:"5px 10px", fontSize:11, textAlign:"center" as const, borderRight:`1px solid ${BORDER}`, borderBottom:`1px solid ${BORDER}`, color: TEXT };
          const attrCell: React.CSSProperties = { padding:"5px 10px", fontSize:11, fontWeight:600, color:TEXT, borderRight:`1px solid ${BORDER}`, borderBottom:`1px solid ${BORDER}`, background:"#f8f9ff", whiteSpace:"nowrap" as const };
          const targetCell: React.CSSProperties = { padding:"5px 10px", fontSize:11, fontWeight:700, textAlign:"center" as const, borderRight:`1px solid ${BORDER}`, borderBottom:`1px solid ${BORDER}`, background:"#fef9c3", color:"#854d0e" };
          const dividerRow: React.CSSProperties = { height:8, background:"#f0f4ff" };

          return (
            <>
              {/* Header: Mile selector + title */}
              <div style={{ display:"flex", alignItems:"center", gap:0, background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ background:"#fca5a5", padding:"18px 28px", fontSize:22, fontWeight:800, color:"#7f1d1d", minWidth:140, textAlign:"center" as const }}>Mile</div>
                <div style={{ flex:1 }}>
                  <select style={{ width:"100%", border:"none", fontSize:22, fontWeight:800, color:"#1e3a5f", padding:"18px 20px", outline:"none", background:"transparent", cursor:"pointer" }}
                    value={bmMile} onChange={(e) => setBmMile(e.target.value)}>
                    <option value="ALL">ALL</option>
                    {MILES.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {/* YTD Stats pills */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                <div style={{ background:"#2563eb", color:"#fff", borderRadius:8, padding:"12px 16px", textAlign:"center" as const }}>
                  <div style={{ fontSize:11, fontWeight:600, opacity:0.8, marginBottom:4, letterSpacing:0.5 }}>YTD HC · {bmMile === "ALL" ? "ALL" : bmMile}</div>
                  <div style={{ fontSize:22, fontWeight:900 }}>{ytdHC}</div>
                  <div style={{ fontSize:10, opacity:0.7, marginTop:2 }}>associates tracked</div>
                </div>
                <div style={{ background:"#dcfce7", borderRadius:8, padding:"12px 16px", textAlign:"center" as const, border:"1px solid #bbf7d0" }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#166534", marginBottom:4 }}>Total Direct Hrs YTD</div>
                  <div style={{ fontSize:22, fontWeight:900, color:"#15803d" }}>{toHrs(ytdDirectS)}</div>
                  <div style={{ fontSize:10, color:"#16a34a", marginTop:2 }}>
                    {ytdTotalS > 0 ? Math.round((ytdDirectS/ytdTotalS)*100) : 0}% of total
                  </div>
                </div>
                <div style={{ background:"#dbeafe", borderRadius:8, padding:"12px 16px", textAlign:"center" as const, border:"1px solid #bfdbfe" }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#1e40af", marginBottom:4 }}>Total In-Direct Hrs YTD</div>
                  <div style={{ fontSize:22, fontWeight:900, color:"#1d4ed8" }}>{toHrs(ytdIndirectS)}</div>
                  <div style={{ fontSize:10, color:"#2563eb", marginTop:2 }}>
                    {ytdTotalS > 0 ? Math.round((ytdIndirectS/ytdTotalS)*100) : 0}% of total
                  </div>
                </div>
                <div style={{ background:"#f1f5f9", borderRadius:8, padding:"12px 16px", textAlign:"center" as const, border:"1px solid #e2e8f0" }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#475569", marginBottom:4 }}>Total Idle Hrs YTD</div>
                  <div style={{ fontSize:22, fontWeight:900, color:"#64748b" }}>{toHrs(ytdIdleS)}</div>
                  <div style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>
                    {ytdTotalS > 0 ? Math.round((ytdIdleS/ytdTotalS)*100) : 0}% of total
                  </div>
                </div>
                <div style={{ background:"#faf5ff", borderRadius:8, padding:"12px 16px", textAlign:"center" as const, border:"1px solid #e9d5ff" }}>
                  <div style={{ fontSize:11, fontWeight:600, color:"#7e22ce", marginBottom:4 }}>Total Innovation Hrs YTD</div>
                  <div style={{ fontSize:22, fontWeight:900, color:"#9333ea" }}>{toHrs(ytdInnoS)}</div>
                  <div style={{ fontSize:10, color:"#a855f7", marginTop:2 }}>
                    {ytdTotalS > 0 ? Math.round((ytdInnoS/ytdTotalS)*100) : 0}% of total
                  </div>
                </div>
              </div>

              {/* DOD + WOW tables side by side */}
              <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>

                {/* DOD Table */}
                <div style={{ flex:2, background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, overflow:"hidden" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#2563eb", padding:"8px 14px" }}>
                    <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>DOD</span>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <button style={{ ...navBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={()=>setDodOffset(x=>x-1)}>‹</button>
                      <button style={{ ...navBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={()=>setDodOffset(x=>Math.min(x+1,0))} disabled={dodOffset===0}>›</button>
                    </div>
                  </div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead>
                        <tr style={{ background:"#2563eb" }}>
                          <th style={attrTh}>Attributes</th>
                          {dodDates.map(d => <th key={d} style={thStyle}>{fmtDate(d)}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {/* Raw rows */}
                        <tr><td style={attrCell}>Total HC</td>{dodStats.map((s,i)=><td key={i} style={cellStyle}>{s.users}</td>)}</tr>
                        <tr><td style={{ ...attrCell, background:"#eff6ff", color:"#1e40af" }}>Available Hrs.</td>{dodStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:"#f8fbff", fontWeight:600 }}>{s.availableHrs}</td>)}</tr>
                        <tr><td style={attrCell}>Total Working Hrs.</td>{dodStats.map((s,i)=><td key={i} style={cellStyle}>{s.totalHrs}</td>)}</tr>
                        <tr><td style={attrCell}>Direct Hrs.</td>{dodStats.map((s,i)=><td key={i} style={cellStyle}>{s.directHrs}</td>)}</tr>
                        <tr><td style={attrCell}>In-Direct Hrs.</td>{dodStats.map((s,i)=><td key={i} style={cellStyle}>{s.indirectHrs}</td>)}</tr>
                        <tr><td style={attrCell}>Idle Hrs.</td>{dodStats.map((s,i)=><td key={i} style={cellStyle}>{s.idleHrs}</td>)}</tr>
                        <tr><td style={attrCell}>Innovation hrs</td>{dodStats.map((s,i)=><td key={i} style={cellStyle}>{s.innovationHrs}</td>)}</tr>
                        {/* Divider */}
                        <tr style={{ background:"#f0f4ff" }}><td colSpan={9} style={{ height:8, padding:0, borderBottom:`1px solid ${BORDER}` }} /></tr>
                        {/* Variance rows: Available vs Working */}
                        <tr>
                          <td style={{ ...attrCell, background:"#fff7ed", color:"#c2410c" }}>OT Hrs. <span style={{ fontSize:9, fontWeight:400, color:"#c2410c" }}>(working &gt; available)</span></td>
                          {dodStats.map((s,i)=> {
                            const hasOT = parseFloat(s.otHrs) > 0;
                            return <td key={i} style={{ ...cellStyle, background: hasOT ? "#fee2e2" : "transparent", color: hasOT ? "#991b1b" : "#94a3b8", fontWeight: hasOT ? 700 : 400 }}>{hasOT ? `+${s.otHrs}` : "—"}</td>;
                          })}
                          <td style={{ ...targetCell, background:"#fff7ed", color:"#c2410c", fontSize:9 }}>Excess</td>
                        </tr>
                        <tr>
                          <td style={{ ...attrCell, background:"#faf5ff", color:"#7e22ce" }}>Unknown <span style={{ fontSize:9, fontWeight:400, color:"#7e22ce" }}>(no clock-in)</span></td>
                          {dodStats.map((s,i)=> {
                            const hasUnknown = parseFloat(s.unknownHrs) > 0;
                            return <td key={i} style={{ ...cellStyle, background: hasUnknown ? "#faf5ff" : "transparent", color: hasUnknown ? "#7e22ce" : "#94a3b8", fontWeight: hasUnknown ? 700 : 400 }}>{hasUnknown ? `-${s.unknownHrs}` : "—"}</td>;
                          })}
                          <td style={{ ...targetCell, background:"#faf5ff", color:"#7e22ce", fontSize:9 }}>Shortfall</td>
                        </tr>
                        {/* Second divider before % section */}
                        <tr style={{ background:"#f0f4ff" }}><td colSpan={9} style={{ height:8, padding:0, borderBottom:`1px solid ${BORDER}` }} /></tr>
                        {/* % rows with colour + Target */}
                        <tr>
                          <td style={attrCell}>Direct Hrs.</td>
                          {dodStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:pctColor(s.directPct,TARGET_DIRECT), color:pctTextColor(s.directPct,TARGET_DIRECT), fontWeight:700 }}>{s.directPct}%</td>)}
                          <td style={targetCell}>Target<br/>{TARGET_DIRECT}%</td>
                        </tr>
                        <tr>
                          <td style={attrCell}>In-Direct Hrs.</td>
                          {dodStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:pctColor(s.indirectPct,TARGET_INDIRECT), color:pctTextColor(s.indirectPct,TARGET_INDIRECT), fontWeight:700 }}>{s.indirectPct}%</td>)}
                          <td style={targetCell}>{TARGET_INDIRECT}%</td>
                        </tr>
                        <tr>
                          <td style={attrCell}>Idle Hrs.</td>
                          {dodStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:pctColor(s.idlePct,TARGET_IDLE,true), color:pctTextColor(s.idlePct,TARGET_IDLE,true), fontWeight:700 }}>{s.idlePct}%</td>)}
                          <td style={targetCell}>{TARGET_IDLE}%</td>
                        </tr>
                        <tr>
                          <td style={attrCell}>Innovation hrs</td>
                          {dodStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:pctColor(s.innovationPct,TARGET_INNOVATION), color:pctTextColor(s.innovationPct,TARGET_INNOVATION), fontWeight:700 }}>{s.innovationPct}%</td>)}
                          <td style={targetCell}>{TARGET_INNOVATION}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* WOW Table */}
                <div style={{ flex:1, background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, overflow:"hidden" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#0f766e", padding:"8px 14px" }}>
                    <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>WOW</span>
                    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                      <button style={{ ...navBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={()=>setWowOffset(x=>x-1)}>‹</button>
                      <button style={{ ...navBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={()=>setWowOffset(x=>Math.min(x+1,0))} disabled={wowOffset===0}>›</button>
                    </div>
                  </div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead>
                        <tr style={{ background:"#0f766e" }}>
                          <th style={{ ...attrTh, background:"#0f766e" }}>Attributes</th>
                          {wowWeeks.map(w => <th key={w} style={{ ...thStyle, background:"#0f766e" }}>Wk {w === 0 ? "Now" : w === -1 ? "-1" : String(w)}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        <tr><td style={attrCell}>Total HC</td>{wowStats.map((s,i)=><td key={i} style={cellStyle}>{s.users}</td>)}</tr>
                        <tr><td style={{ ...attrCell, background:"#eff6ff", color:"#1e40af" }}>Available Hrs.</td>{wowStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:"#f8fbff", fontWeight:600 }}>{s.availableHrs}</td>)}</tr>
                        <tr><td style={attrCell}>Total Working Hrs.</td>{wowStats.map((s,i)=><td key={i} style={cellStyle}>{s.totalHrs}</td>)}</tr>
                        <tr><td style={attrCell}>Direct Hrs.</td>{wowStats.map((s,i)=><td key={i} style={cellStyle}>{s.directHrs}</td>)}</tr>
                        <tr><td style={attrCell}>In-Direct Hrs.</td>{wowStats.map((s,i)=><td key={i} style={cellStyle}>{s.indirectHrs}</td>)}</tr>
                        <tr><td style={attrCell}>Idle Hrs.</td>{wowStats.map((s,i)=><td key={i} style={cellStyle}>{s.idleHrs}</td>)}</tr>
                        <tr><td style={attrCell}>Innovation hrs</td>{wowStats.map((s,i)=><td key={i} style={cellStyle}>{s.innovationHrs}</td>)}</tr>
                        <tr style={{ background:"#f0f4ff" }}><td colSpan={5} style={{ height:8, padding:0, borderBottom:`1px solid ${BORDER}` }} /></tr>
                        {/* Variance rows */}
                        <tr>
                          <td style={{ ...attrCell, background:"#fff7ed", color:"#c2410c" }}>OT Hrs. <span style={{ fontSize:9, fontWeight:400 }}>(excess)</span></td>
                          {wowStats.map((s,i)=> {
                            const hasOT = parseFloat(s.otHrs) > 0;
                            return <td key={i} style={{ ...cellStyle, background: hasOT ? "#fee2e2" : "transparent", color: hasOT ? "#991b1b" : "#94a3b8", fontWeight: hasOT ? 700 : 400 }}>{hasOT ? `+${s.otHrs}` : "—"}</td>;
                          })}
                        </tr>
                        <tr>
                          <td style={{ ...attrCell, background:"#faf5ff", color:"#7e22ce" }}>Unknown <span style={{ fontSize:9, fontWeight:400 }}>(no clock-in)</span></td>
                          {wowStats.map((s,i)=> {
                            const hasUnknown = parseFloat(s.unknownHrs) > 0;
                            return <td key={i} style={{ ...cellStyle, background: hasUnknown ? "#faf5ff" : "transparent", color: hasUnknown ? "#7e22ce" : "#94a3b8", fontWeight: hasUnknown ? 700 : 400 }}>{hasUnknown ? `-${s.unknownHrs}` : "—"}</td>;
                          })}
                        </tr>
                        <tr style={{ background:"#f0f4ff" }}><td colSpan={5} style={{ height:8, padding:0, borderBottom:`1px solid ${BORDER}` }} /></tr>
                        <tr>
                          <td style={attrCell}>Direct Hrs.</td>
                          {wowStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:pctColor(s.directPct,TARGET_DIRECT), color:pctTextColor(s.directPct,TARGET_DIRECT), fontWeight:700 }}>{s.directPct}%</td>)}
                        </tr>
                        <tr>
                          <td style={attrCell}>In-Direct Hrs.</td>
                          {wowStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:pctColor(s.indirectPct,TARGET_INDIRECT), color:pctTextColor(s.indirectPct,TARGET_INDIRECT), fontWeight:700 }}>{s.indirectPct}%</td>)}
                        </tr>
                        <tr>
                          <td style={attrCell}>Idle Hrs.</td>
                          {wowStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:pctColor(s.idlePct,TARGET_IDLE,true), color:pctTextColor(s.idlePct,TARGET_IDLE,true), fontWeight:700 }}>{s.idlePct}%</td>)}
                        </tr>
                        <tr>
                          <td style={attrCell}>Innovation hrs</td>
                          {wowStats.map((s,i)=><td key={i} style={{ ...cellStyle, background:pctColor(s.innovationPct,TARGET_INNOVATION), color:pctTextColor(s.innovationPct,TARGET_INNOVATION), fontWeight:700 }}>{s.innovationPct}%</td>)}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* ── Performers (N-1 Week basis) ── */}
              {(() => {
                // N-1 week = the week before the currently viewed WOW week
                const n1Dates = getWeekDates(wowOffset - 1);
                const n1Evts  = allEvents.filter((e) =>
                  e.endTime &&
                  n1Dates.includes(e.date) &&
                  (bmMile === "ALL" || e.mile === bmMile)
                );

                const n1Label = `${n1Dates[0]} – ${n1Dates[6]}`;

                // Per-user breakdown for N-1 week
                const userStats = [...new Set(n1Evts.map((e) => e.login))].map((login) => {
                  const ue       = n1Evts.filter((e) => e.login === login);
                  const totalS   = ue.reduce((a, e) => a + evtSecs(e), 0);
                  const directS  = ue.filter((e) => e.functionType === "Direct").reduce((a, e) => a + evtSecs(e), 0);
                  const indirectS= ue.filter((e) => ["In-Direct","Indirect","Break"].includes(e.functionType)).reduce((a, e) => a + evtSecs(e), 0);
                  const idleS    = ue.filter((e) => e.functionType === "Idle" || e.scope === "Idle / No Task").reduce((a, e) => a + evtSecs(e), 0);
                  const pct = (s: number) => totalS > 0 ? Math.round((s / totalS) * 100) : 0;
                  return { login, directPct: pct(directS), indirectPct: pct(indirectS), idlePct: pct(idleS) };
                }).filter((u) => u.directPct + u.indirectPct + u.idlePct > 0);

                if (userStats.length === 0) return null;

                // Sort helpers
                const topN    = (arr: typeof userStats, key: keyof typeof userStats[0], asc: boolean, n = 3) =>
                  [...arr].sort((a, b) => asc ? (a[key] as number) - (b[key] as number) : (b[key] as number) - (a[key] as number)).slice(0, n);

                const tops = {
                  direct:   topN(userStats, "directPct",   false), // more is better
                  indirect: topN(userStats, "indirectPct", true),  // less is better
                  idle:     topN(userStats, "idlePct",     true),  // less is better
                };
                const bottoms = {
                  direct:   topN(userStats, "directPct",   true),
                  indirect: topN(userStats, "indirectPct", false),
                  idle:     topN(userStats, "idlePct",     false),
                };

                type ColDef = { key: keyof typeof userStats[0]; label: string; unit: string; topColor: string; botColor: string; topBg: string; botBg: string; };
                const cols: ColDef[] = [
                  { key:"directPct",   label:"Direct",    unit:"%", topColor:"#166534", botColor:"#991b1b", topBg:"#dcfce7", botBg:"#fee2e2" },
                  { key:"indirectPct", label:"In-Direct", unit:"%", topColor:"#1e40af", botColor:"#92400e", topBg:"#dbeafe", botBg:"#fef9c3" },
                  { key:"idlePct",     label:"Idle",      unit:"%", topColor:"#374151", botColor:"#991b1b", topBg:"#f1f5f9", botBg:"#fee2e2" },
                ];

                const Card = ({ title, emoji, bgColor, borderColor, users, col }: { title: string; emoji: string; bgColor: string; borderColor: string; users: typeof userStats; col: ColDef }) => (
                  <div style={{ flex:1, background: bgColor, border:`1.5px solid ${borderColor}`, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color: col.topColor, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontSize:16 }}>{emoji}</span> {title}
                    </div>
                    {users.map((u, i) => (
                      <div key={u.login} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                        <div style={{ width:20, height:20, borderRadius:"50%", background: borderColor, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"#fff", flexShrink:0 }}>
                          {i + 1}
                        </div>
                        <div style={{ flex:1, fontSize:12, fontWeight:600, color:TEXT }}>{u.login}</div>
                        <div style={{ fontSize:13, fontWeight:800, color: col.topColor }}>
                          {u[col.key] as number}{col.unit}
                        </div>
                      </div>
                    ))}
                  </div>
                );

                return (
                  <div style={{ display:"flex", gap:14, marginTop:4 }}>
                    {/* R&R — Top performers */}
                    <div style={{ flex:1, background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, padding:"16px 18px" }}>
                      <div style={{ fontSize:12, fontWeight:800, color:"#15803d", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
                        🏆 Top Performers <span style={{ fontSize:10, color:MUTED, fontWeight:400 }}>R&amp;R · N-1 Week ({n1Label})</span>
                      </div>
                      <div style={{ display:"flex", gap:10 }}>
                        {cols.map((col) => (
                          <Card key={col.key} emoji="🥇" title={`${col.label} (more)`}
                            bgColor={col.topBg} borderColor={col.topColor}
                            users={tops[col.key.replace("Pct","") as keyof typeof tops]}
                            col={col} />
                        ))}
                      </div>
                    </div>

                    {/* Coaching — Bottom performers */}
                    <div style={{ flex:1, background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, padding:"16px 18px" }}>
                      <div style={{ fontSize:12, fontWeight:800, color:"#dc2626", marginBottom:12, display:"flex", alignItems:"center", gap:6 }}>
                        📋 Needs Coaching <span style={{ fontSize:10, color:MUTED, fontWeight:400 }}>Bottom Performers · N-1 Week ({n1Label})</span>
                      </div>
                      <div style={{ display:"flex", gap:10 }}>
                        {cols.map((col) => (
                          <Card key={col.key} emoji="⚠️" title={`${col.label} (low)`}
                            bgColor="#fff8f8" borderColor={col.botColor}
                            users={bottoms[col.key.replace("Pct","") as keyof typeof bottoms]}
                            col={{ ...col, topColor: col.botColor }} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })()}

            </>
          );
        })()}

        {/* ══════ LIVE LOG ══════ */}
        {tab === "livelog" && (<>
          {/* Filters + export */}
          <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, padding:"14px 20px", display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" as const }}>
            {[
              { label:"Mile",  el: <select style={sel} value={filterMile} onChange={(e)=>setFilterMile(e.target.value)}><option value="ALL">All Miles</option>{MILES.map(m=><option key={m}>{m}</option>)}</select> },
              { label:"From",  el: <input type="date" style={sel} value={filterFrom} onChange={(e)=>setFilterFrom(e.target.value)} /> },
              { label:"To",    el: <input type="date" style={sel} value={filterTo}   onChange={(e)=>setFilterTo(e.target.value)} /> },
              { label:"Login", el: <input style={sel} placeholder="All users" value={filterLogin} onChange={(e)=>setFilterLogin(e.target.value)} /> },
            ].map(({ label, el }) => (
              <div key={label}>
                <div style={{ fontSize:10, fontWeight:700, color:MUTED, letterSpacing:1, marginBottom:4, textTransform:"uppercase" as const }}>{label}</div>
                {el}
              </div>
            ))}
            <button
              onClick={() => exportToCSV(filteredEvents, `TEMPO_Log_${filterFrom}_${filterTo}.csv`)}
              style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:12, fontWeight:700, cursor:"pointer", alignSelf:"flex-end" as const }}>
              📊 Export CSV
            </button>
          </div>

          {/* Table */}
          <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, overflow:"hidden" }}>
            <div style={{ position:"sticky", top:0, zIndex:10, background:WHITE, borderBottom:`1px solid ${BORDER}`, padding:"12px 20px", display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:13, fontWeight:700, color:TEXT }}>Live Log</span>
              <span style={{ background:"#eff6ff", color:ACCENT, borderRadius:10, padding:"1px 8px", fontSize:11, fontWeight:600 }}>{filteredEvents.length} events</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#f8f9ff" }}>
                    {["Date","Login","Mile","Shift","Scope","Type","In","Out","Duration","Note"].map((h)=>(
                      <th key={h} style={{ position:"sticky", top:0, background:"#f8f9ff", padding:"7px 10px", fontWeight:700, fontSize:10, color:MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${BORDER}`, textAlign:"left" as const, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding:"24px", textAlign:"center", color:MUTED }}>No events for selected filters</td></tr>
                  ) : filteredEvents.slice(0,300).map((e) => {
                    const sec = evtSecs(e);
                    const ft  = e.functionType === "Indirect" || e.functionType === "Break" ? "In-Direct" : e.functionType;
                    const ftColor = ft==="Direct"?"#22c55e":ft==="In-Direct"?"#3b82f6":ft==="Idle"?"#94a3b8":ft==="OT"?"#dc2626":"#f59e0b";
                    return (
                      <tr key={e.id} style={{ borderBottom:`1px solid #f0f4ff` }}>
                        <td style={td}>{e.date}</td>
                        <td style={{ ...td, fontWeight:700, color:ACCENT }}>{e.login}</td>
                        <td style={td}>{e.mile}</td>
                        <td style={td}>
                          <span style={{ background: "#eff6ff", color:ACCENT, borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{e.shiftCode}</span>
                        </td>
                        <td style={td}><ScopeBadge scope={e.scope} /></td>
                        <td style={td}>
                          <span style={{ background:ftColor+"22", color:ftColor, borderRadius:4, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{ft}</span>
                        </td>
                        <td style={{ ...td, fontVariantNumeric:"tabular-nums" }}>{e.startTime ? formatTime(e.startTime) : "—"}</td>
                        <td style={{ ...td, fontVariantNumeric:"tabular-nums" }}>{e.endTime ? formatTime(e.endTime) : "—"}</td>
                        <td style={{ ...td, fontWeight:600 }}>{sec ? formatDuration(sec) : "—"}</td>
                        <td style={{ ...td, color:MUTED, maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{e.note||""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredEvents.length > 300 && (
                <div style={{ padding:"10px 20px", color:MUTED, fontSize:11, textAlign:"center" as const }}>
                  Showing 300 of {filteredEvents.length} — export CSV for full data
                </div>
              )}
            </div>
          </div>
        </>)}

        {/* ══════ MANAGERS ══════ */}
        {tab === "managers" && role === "owner" && (
          <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, padding:"22px 24px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:TEXT, marginBottom:4 }}>Manager Access Control</div>
            <div style={{ fontSize:12, color:MUTED, marginBottom:16 }}>
              Owner: <span style={{ color:"#f59e0b", fontWeight:700 }}>{OWNER}</span>
              &nbsp;·&nbsp; Add manager logins with a password. Managers sign in with their alias + password.
            </div>

            {/* Add manager form */}
            <div style={{ background:"#f8f9ff", border:`1px solid ${BORDER}`, borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:600, color:TEXT, marginBottom:10 }}>Add New Manager</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
                <div style={{ flex:1, minWidth:120 }}>
                  <div style={{ fontSize:10, color:MUTED, marginBottom:3 }}>ALIAS</div>
                  <input style={sel} placeholder="Amazon alias" value={newAlias}
                    onChange={(e)=>{ setNewAlias(e.target.value); setNewPassErr(""); }} />
                </div>
                <div style={{ flex:1, minWidth:120 }}>
                  <div style={{ fontSize:10, color:MUTED, marginBottom:3 }}>PASSWORD</div>
                  <input type="password" style={sel} placeholder="Set a password" value={newPass}
                    onChange={(e)=>{ setNewPass(e.target.value); setNewPassErr(""); }}
                    onKeyDown={(e)=>e.key==="Enter"&&handleAddMgr()} />
                </div>
                <div style={{ alignSelf:"flex-end" as const }}>
                  <button onClick={handleAddMgr}
                    style={{ background:NAVBAR, color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    Add Manager
                  </button>
                </div>
              </div>
              {newPassErr && <div style={{ fontSize:11, color:"#ef4444", marginTop:6 }}>⚠ {newPassErr}</div>}
            </div>

            {/* Managers table */}
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"#f8f9ff" }}>
                  {["Alias","Role","Action"].map(h=>(
                    <th key={h} style={{ padding:"7px 12px", fontWeight:700, fontSize:10, color:MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${BORDER}`, textAlign:"left" as const }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Owner row (always first) */}
                <tr style={{ borderBottom:`1px solid #f0f4ff` }}>
                  <td style={{ ...td, fontWeight:700, color:ACCENT }}>{OWNER}</td>
                  <td style={td}><span style={{ background:"#fef9c3", color:"#854d0e", borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>OWNER</span></td>
                  <td style={td}><span style={{ fontSize:10, color:MUTED }}>Protected</span></td>
                </tr>
                {mgrs.map((cred) => (
                  <tr key={cred.login} style={{ borderBottom:`1px solid #f0f4ff` }}>
                    <td style={{ ...td, fontWeight:700, color:ACCENT }}>{cred.login}</td>
                    <td style={td}><span style={{ background:"#eff6ff", color:ACCENT, borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>MANAGER</span></td>
                    <td style={td}>
                      <button onClick={()=>handleRemoveMgr(cred.login)}
                        style={{ background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca", borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
                {mgrs.length === 0 && (
                  <tr><td colSpan={3} style={{ padding:"16px", textAlign:"center", color:MUTED, fontSize:12 }}>No managers added yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {tab === "managers" && role === "manager" && (
          <div style={{ background:WHITE, border:`1px solid ${BORDER}`, borderRadius:12, padding:"22px 24px", textAlign:"center" as const }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔒</div>
            <div style={{ fontSize:14, fontWeight:700, color:TEXT }}>Owner Access Only</div>
            <div style={{ fontSize:12, color:MUTED, marginTop:4 }}>Only the owner (prdmano) can manage manager accounts.</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ background:WHITE, borderTop:`1px solid ${BORDER}`, padding:"8px 24px", display:"flex", justifyContent:"space-between", fontSize:10, color:MUTED, flexShrink:0 }}>
        <span>iCMRS · Created by prdmano</span>
        <span>TEMPO Dashboard · {today}</span>
      </div>
    </div>
  );
}

// ─── Shared inline styles ─────────────────────────────────────────────────────
const sel: React.CSSProperties = {
  border: `1px solid ${BORDER}`, borderRadius: 7, padding: "7px 10px",
  fontSize: 12, outline: "none", background: "#fff", color: TEXT, cursor: "pointer",
};
const td: React.CSSProperties = {
  padding: "6px 10px", color: TEXT, fontSize: 11,
};
const navBtn: React.CSSProperties = {
  background: "#eff6ff", color: ACCENT, border: `1px solid ${BORDER}`,
  borderRadius: 6, width: 28, height: 28, fontSize: 15, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700,
};
