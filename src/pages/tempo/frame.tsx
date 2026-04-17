import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  SHIFTS,
  MILES,
  FUNCTION_TYPES,
  SCOPE_COLORS,
  LATE_GRACE_MINUTES,
  OT_GRACE_MINUTES,
  OWNER,
  type ShiftKey,
  type TimeEvent,
} from "./constants";
import {
  getStoredUser,
  setStoredUser,
  getEventsForDate,
  getTodayStr,
  formatDuration,
  formatTime,
  generateId,
  saveEvent,
  getShiftAvailability,
  getEventsForUser,
  getDailyShift,
  setDailyShift,
  getManagerCreds,
  clearDailyShift,
  getAllEvents,
  addManagerCred,
  removeManagerCred,
  verifyDashboardLogin,
  setLastClockOut,
  getLastClockOut,
  clearLastClockOut,
  getAllLPInvestigations,
  saveLPInvestigation,
  type LPInvestigation,
  type LastClockOut,
} from "./storage";

// ─── Process Scope options visible to user ────────────────────────────────────
const USER_SCOPES = [
  // Direct
  { value: "LP",                              label: "LP",                                   internal: "Direct",    group: "Direct"     },
  { value: "Audit",                           label: "Audit",                                internal: "Direct",    group: "Direct"     },
  { value: "Shift Managing",                  label: "Shift Managing",                       internal: "Direct",    group: "Direct"     },
  { value: "IDS/Alarm monitoring",            label: "IDS/Alarm monitoring",                 internal: "Direct",    group: "Direct"     },
  { value: "Major MO",                        label: "Major MO",                             internal: "Direct",    group: "Direct"     },
  { value: "Report",                          label: "Report",                               internal: "Direct",    group: "Direct"     },
  { value: "TT",                              label: "TT",                                   internal: "Direct",    group: "Direct"     },
  { value: "Critical Observations",           label: "Critical Observations",                internal: "Direct",    group: "Direct"     },
  // In-Direct
  { value: "Break",                           label: "Break",                                internal: "Indirect",  group: "In-Direct"  },
  { value: "Handover",                        label: "Handover",                             internal: "Indirect",  group: "In-Direct"  },
  { value: "Huddle",                          label: "Huddle",                               internal: "Indirect",  group: "In-Direct"  },
  { value: "Learning",                        label: "Learning",                             internal: "Indirect",  group: "In-Direct"  },
  { value: "Rebuttals",                       label: "Rebuttals",                            internal: "Indirect",  group: "In-Direct"  },
  // Innovation
  { value: "New Initiative/C2CMRS/Other develop", label: "New Initiative/C2CMRS/Other develop", internal: "Innovation", group: "Innovation" },
  // Idle
  { value: "Idle / No Task",                  label: "Idle / No Task",                      internal: "Idle",      group: "Idle"       },
];

// Grouped structure for rendering <optgroup>
const SCOPE_GROUPS: { group: string; scopes: typeof USER_SCOPES }[] = [
  { group: "Direct",     scopes: USER_SCOPES.filter((s) => s.group === "Direct")     },
  { group: "In-Direct",  scopes: USER_SCOPES.filter((s) => s.group === "In-Direct")  },
  { group: "Innovation", scopes: USER_SCOPES.filter((s) => s.group === "Innovation") },
  { group: "Idle",       scopes: USER_SCOPES.filter((s) => s.group === "Idle")       },
];

function getScopeInternal(value: string): string {
  return USER_SCOPES.find((s) => s.value === value)?.internal ?? value;
}
function getScopeLabel(value: string): string {
  return USER_SCOPES.find((s) => s.value === value)?.label ?? value;
}

// ─── Colors ───────────────────────────────────────────────────────────────────
const BG_LEFT  = "#ffffff";
const BG_RIGHT = "#f5f6fa";
const ACCENT   = "#1a3a6b";   // dark navy
const NAVBAR   = "#2563eb";   // light blue
const WHITE    = "#ffffff";
const BORDER   = "#e0e4ef";
const MUTED    = "#7a8bb0";
const GREEN    = "#22863a";

const SHIFT_ICONS: Record<string, string> = {
  G: "☀️", M: "🌤️", M2: "🌥️", E: "🌙", N: "⭐", X: "⚙️",
};
const SHIFT_COLORS: Record<string, string> = {
  G: "#f59e0b", M: "#3b82f6", M2: "#6366f1", E: "#7c3aed", N: "#1e293b", X: "#64748b",
};

// ─── Type badge colors ────────────────────────────────────────────────────────
const TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  Direct:      { bg: "#dcfce7", color: "#166534" },
  "In-Direct": { bg: "#dbeafe", color: "#1e40af" },
  Indirect:    { bg: "#dbeafe", color: "#1e40af" },
  Idle:        { bg: "#f1f5f9", color: "#475569" },
  OT:          { bg: "#fee2e2", color: "#991b1b" },
};

// ─── Status badge ─────────────────────────────────────────────────────────────
function getStatusBadge(scope: string, note?: string): { text: string; bg: string; color: string } {
  if (scope === "Break")
    return { text: "● Break",   bg: "#fef9c3", color: "#92400e" };
  if (scope === "OT")
    return { text: "⏱ OT",      bg: "#fee2e2", color: "#991b1b" };
  if (scope === "Idle / No Task" || scope === "Idle") {
    // Late check-in idle records have a special note
    if (note && note.startsWith("Late check-in:"))
      return { text: "⏰ Late",  bg: "#fff7ed", color: "#c2410c" };
    return   { text: "🧊 Idle",  bg: "#f1f5f9", color: "#475569" };
  }
  return       { text: "✓ On Time", bg: "#dcfce7", color: "#166534" };
}

// ─── Format seconds as HH:MM:SS ──────────────────────────────────────────────
function formatTimer(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function formatDur(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Donut Chart ──────────────────────────────────────────────────────────────
interface DonutSlice { label: string; value: number; color: string; }
function DonutChart({ slices, size = 90 }: { slices: DonutSlice[]; size?: number }) {
  const [tip, setTip] = useState<{ label: string; value: number; pct: number; color: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  const total = slices.reduce((a, b) => a + b.value, 0);
  if (total === 0) return null;
  const cx = size / 2, cy = size / 2, r = size * 0.38, inner = size * 0.22;
  let angle = -Math.PI / 2;
  const paths: React.ReactNode[] = [];
  slices.forEach((sl, i) => {
    const frac = sl.value / total;
    if (frac === 0) return;
    const startA = angle;
    const endA = angle + frac * 2 * Math.PI;
    const x1 = cx + r * Math.cos(startA), y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA),   y2 = cy + r * Math.sin(endA);
    const xi1 = cx + inner * Math.cos(startA), yi1 = cy + inner * Math.sin(startA);
    const xi2 = cx + inner * Math.cos(endA),   yi2 = cy + inner * Math.sin(endA);
    const large = frac > 0.5 ? 1 : 0;
    paths.push(
      <path key={i}
        d={`M${xi1},${yi1} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} L${xi2},${yi2} A${inner},${inner} 0 ${large},0 ${xi1},${yi1} Z`}
        fill={sl.color} stroke="#fff" strokeWidth={1.5}
        style={{ cursor: "pointer", opacity: tip?.label === sl.label ? 0.82 : 1, transition:"opacity 0.1s" }}
        onMouseEnter={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          setTip({ label: sl.label, value: sl.value, pct: Math.round(frac * 100), color: sl.color });
        }}
        onMouseMove={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => setTip(null)}
      />
    );
    angle = endA;
  });

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <svg width={size} height={size}>{paths}</svg>
      {tip && (
        <div style={{
          position: "absolute",
          left: mousePos.x,
          top: mousePos.y - 8,
          transform: "translate(-50%, -100%)",
          background: "#1a1a2e",
          color: "#fff",
          borderRadius: 8,
          padding: "6px 10px",
          fontSize: 11,
          fontWeight: 600,
          pointerEvents: "none",
          whiteSpace: "nowrap",
          zIndex: 50,
          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          border: `1px solid ${tip.color}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 2 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: tip.color, flexShrink: 0 }} />
            <span>{tip.label}</span>
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 12 }}>
            <span style={{ color: tip.color, fontWeight: 800 }}>{tip.pct}%</span>
            <span style={{ color: "#94a3b8", fontWeight: 400 }}>{formatDur(tip.value)}</span>
          </div>
          {/* Arrow */}
          <div style={{
            position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: `5px solid ${tip.color}`,
          }} />
        </div>
      )}
    </div>
  );
}

// ─── Horizontal bar row — shorter bar ────────────────────────────────────────
function BarRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
      <div style={{ width: 8, height: 8, background: color, borderRadius: 2, flexShrink: 0 }} />
      <div style={{ minWidth: 105, fontSize: 11, color: "#333", whiteSpace: "nowrap" as const }}>{label}</div>
      {/* Bar capped at 55% of available width */}
      <div style={{ width: "55%", height: 7, background: "#e8eaf0", borderRadius: 4, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.5s" }} />
      </div>
      <div style={{ minWidth: 32, textAlign: "right" as const, fontSize: 11, fontWeight: 700, color: color }}>
        {Math.round(pct)}%
      </div>
      <div style={{ minWidth: 48, textAlign: "right" as const, fontSize: 10, color: MUTED }}>
        {formatDuration(value)}
      </div>
    </div>
  );
}

// ─── Stacked horizontal bar (for Function Type) ───────────────────────────────
function StackedBar({ slices, total }: { slices: { label: string; value: number; color: string }[]; total: number }) {
  const [tip, setTip] = useState<{ label: string; value: number; pct: number } | null>(null);
  if (total === 0) return <div style={{ color: MUTED, fontSize: 12 }}>No data yet</div>;
  return (
    <div>
      {/* Single stacked bar */}
      <div style={{ display: "flex", height: 28, borderRadius: 8, overflow: "hidden", marginBottom: 10, position: "relative" as const }}>
        {slices.map((sl) => {
          const pct = (sl.value / total) * 100;
          return (
            <div key={sl.label}
              style={{ width: `${pct}%`, background: sl.color, transition: "width 0.5s", cursor: "pointer", position: "relative" as const }}
              onMouseEnter={() => setTip({ label: sl.label, value: sl.value, pct: Math.round(pct) })}
              onMouseLeave={() => setTip(null)}>
              {pct > 8 && (
                <span style={{ position: "absolute" as const, top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 10, fontWeight: 700, color: "#fff", pointerEvents: "none", whiteSpace: "nowrap" as const }}>
                  {Math.round(pct)}%
                </span>
              )}
            </div>
          );
        })}
        {tip && (
          <div style={{ position: "absolute" as const, top: -34, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.82)", color: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 11, pointerEvents: "none", whiteSpace: "nowrap" as const, zIndex: 20 }}>
            {tip.label}: {tip.pct}% · {formatDuration(tip.value)}
          </div>
        )}
      </div>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "6px 16px" }}>
        {slices.map((sl) => {
          const pct = Math.round((sl.value / total) * 100);
          return (
            <div key={sl.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: sl.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#374151" }}>{sl.label}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: sl.color }}>{pct}%</span>
              <span style={{ fontSize: 10, color: MUTED }}>{formatDuration(sl.value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shift Card ───────────────────────────────────────────────────────────────
function ShiftCard({
  shiftKey, selected, available, onClick,
}: { shiftKey: ShiftKey; selected: boolean; available: boolean; onClick: () => void }) {
  const shift = SHIFTS[shiftKey];
  const color = SHIFT_COLORS[shiftKey] || "#888";
  return (
    <div onClick={available ? onClick : undefined}
      style={{
        width: 74, minHeight: 78, borderRadius: 10, padding: "8px 4px",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 2, cursor: available ? "pointer" : "not-allowed",
        background: selected ? "#1a1a2e" : available ? "#fff" : "#f0f2f8",
        border: selected ? `2px solid ${color}` : `1.5px solid ${BORDER}`,
        boxShadow: selected ? `0 0 0 3px ${color}33` : "none",
        opacity: available ? 1 : 0.4,
        transition: "all 0.15s",
        position: "relative",
      }}>
      {!available && (
        <div style={{ position: "absolute", top: 4, right: 6, fontSize: 9, color: "#aaa" }}>🔒</div>
      )}
      <div style={{ fontSize: 20 }}>{SHIFT_ICONS[shiftKey]}</div>
      <div style={{ fontSize: 12, fontWeight: 700, color: selected ? "#fff" : "#1a1a2e" }}>{shiftKey}</div>
      <div style={{ fontSize: 9, color: selected ? color : MUTED, fontWeight: 500 }}>
        {shiftKey === "X" ? "Custom" : shift.label.replace(" Shift", "")}
      </div>
      {shift.start && (
        <div style={{ fontSize: 8, color: selected ? "#aac" : "#bbb" }}>
          {shift.start}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD — embedded inside the tool frame
// ═══════════════════════════════════════════════════════════════════════════

const DB = "#f0f4ff";
const DB_WHITE = "#ffffff";
const DB_BORDER = "#e0e7ff";
const DB_MUTED = "#6b7280";
const DB_ACCENT = "#2563eb";
const DB_TEXT = "#1e1a2e";

function dbDayStr(offset: number): string {
  const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10);
}
function dbWeekDates(offset = 0): string[] {
  const today = new Date(); const day = today.getDay();
  const monday = new Date(today); monday.setDate(today.getDate() - ((day + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return d.toISOString().slice(0, 10); });
}
function dbEvtSecs(e: TimeEvent): number {
  if (!e.endTime) return 0;
  return Math.round((new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 1000);
}
function dbExportCSV(events: TimeEvent[], filename: string) {
  const headers = ["Date","Login","Mile","Shift","Scope","Function Type","Start","End","Duration (sec)","Note"];
  const rows = events.map((e) => [e.date, e.login, e.mile, e.shiftCode, e.scope, e.functionType, e.startTime ? new Date(e.startTime).toLocaleString() : "", e.endTime ? new Date(e.endTime).toLocaleString() : "", dbEvtSecs(e), e.note||""]);
  const csv = [headers,...rows].map((r)=>r.map((v)=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  const a = document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}

function DbStatCard({ label, value, sub, color = DB_ACCENT }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"16px 20px", borderLeft:`4px solid ${color}` }}>
      <div style={{ fontSize:11, color:DB_MUTED, fontWeight:600, letterSpacing:1, textTransform:"uppercase" as const, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:800, color:DB_TEXT }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:DB_MUTED, marginTop:2 }}>{sub}</div>}
    </div>
  );
}
function DbHBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value/total)*100 : 0;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
      <div style={{ width:8, height:8, borderRadius:2, background:color, flexShrink:0 }} />
      <div style={{ minWidth:110, fontSize:11, color:DB_TEXT }}>{label}</div>
      <div style={{ flex:1, height:8, background:"#e8eaf0", borderRadius:4, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:color, borderRadius:4, transition:"width 0.5s" }} />
      </div>
      <div style={{ minWidth:36, textAlign:"right" as const, fontSize:11, fontWeight:700, color }}>{Math.round(pct)}%</div>
      <div style={{ minWidth:58, textAlign:"right" as const, fontSize:10, color:DB_MUTED }}>{formatDuration(value)}</div>
    </div>
  );
}
function DbScopeBadge({ scope }: { scope: string }) {
  const c = SCOPE_COLORS[scope]||"#888";
  return <span style={{ background:c+"22", color:c, borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700, display:"inline-block", whiteSpace:"nowrap" as const }}>{scope}</span>;
}

const dbSel: React.CSSProperties = { border:`1px solid ${DB_BORDER}`, borderRadius:7, padding:"7px 10px", fontSize:12, outline:"none", background:"#fff", color:DB_TEXT, cursor:"pointer" };
const dbTd: React.CSSProperties = { padding:"6px 10px", color:DB_TEXT, fontSize:11 };
const dbNavBtn: React.CSSProperties = { background:"#eff6ff", color:DB_ACCENT, border:`1px solid ${DB_BORDER}`, borderRadius:6, width:28, height:28, fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 };

type DashRole = "owner" | "manager";
type DashTab  = "overview" | "benchmark" | "breaks" | "livelog" | "managers" | "performance";

// ─── Performance Tab ─────────────────────────────────────────────────────────
type PerfSubTab = "lp" | "process_audit";

const LP_PLAN_DATA = [
  { region:"INOPS",  mile:"FC",        annualMM:0.44, dailyUSD:1205.48,  avgShipCost:23234.60, plannedHC:5,  availHrs:35,  hrsRequired:31.44, idlePerPerson:0.71  },
  { region:"INOPS",  mile:"ATS",       annualMM:0.21, dailyUSD:575.34,   avgShipCost:11932.50, plannedHC:6,  availHrs:42,  hrsRequired:29.22, idlePerPerson:2.13  },
  { region:"INOPS",  mile:"AMZL-IFIT", annualMM:0.40, dailyUSD:1095.89,  avgShipCost:18157.45, plannedHC:6,  availHrs:42,  hrsRequired:36.58, idlePerPerson:0.90  },
  { region:"INOPS",  mile:"AMZL-MDR",  annualMM:0.17, dailyUSD:465.75,   avgShipCost:18702.56, plannedHC:2,  availHrs:14,  hrsRequired:15.09, idlePerPerson:-0.55 },
  { region:"INOPS",  mile:"GSF",       annualMM:0.13, dailyUSD:356.16,   avgShipCost:15667.15, plannedHC:2,  availHrs:14,  hrsRequired:13.78, idlePerPerson:0.11  },
  { region:"JPOPS",  mile:"JPAMZL",    annualMM:0.05, dailyUSD:136.99,   avgShipCost:5000.00,  plannedHC:6,  availHrs:42,  hrsRequired:16.60, idlePerPerson:4.23  },
  { region:"SGOPS",  mile:"SGAMZL",    annualMM:0.02, dailyUSD:54.79,    avgShipCost:5000.00,  plannedHC:1,  availHrs:7,   hrsRequired:6.64,  idlePerPerson:0.36  },
  { region:"AUOPS",  mile:"AUAMZL",    annualMM:0.15, dailyUSD:410.96,   avgShipCost:5000.00,  plannedHC:3,  availHrs:21,  hrsRequired:49.81, idlePerPerson:-9.60 },
];

function PerformanceTab({ allEvents }: { allEvents: TimeEvent[] }) {
  const todayStr = getTodayStr();
  const [perfSubTab,  setPerfSubTab]  = React.useState<PerfSubTab>("lp");
  const [lpDateFrom,  setLpDateFrom]  = React.useState(todayStr);
  const [lpDateTo,    setLpDateTo]    = React.useState(todayStr);
  const [paDFrom,     setPaDFrom]     = React.useState(todayStr);
  const [paDTo,       setPaDTo]       = React.useState(todayStr);

  // ── LP actuals (hours & HC) ──
  const lpActualEvents = React.useMemo(() =>
    allEvents.filter((e) => e.endTime && e.scope === "LP" && e.date >= lpDateFrom && e.date <= lpDateTo),
  [allEvents, lpDateFrom, lpDateTo]);

  const lpActuals = React.useMemo(() => {
    const map: Record<string, { hrs:number; hc:number; users:Set<string> }> = {};
    lpActualEvents.forEach((e) => {
      if (!map[e.mile]) map[e.mile] = { hrs:0, hc:0, users:new Set() };
      map[e.mile].hrs += dbEvtSecs(e) / 3600;
      map[e.mile].users.add(e.login);
    });
    Object.keys(map).forEach(m => { map[m].hc = map[m].users.size; });
    return map;
  }, [lpActualEvents]);

  const lpDayCount = Math.max(1, Math.round((new Date(lpDateTo).getTime() - new Date(lpDateFrom).getTime()) / 86400000) + 1);

  // ── LP investigation actuals ──
  const lpInvActuals = React.useMemo(() => {
    const all = getAllLPInvestigations().filter(r => r.date >= lpDateFrom && r.date <= lpDateTo);
    const map: Record<string, { noOfInv:number; valueUSD:number; cppValueUSD:number }> = {};
    all.forEach(r => {
      if (!map[r.mile]) map[r.mile] = { noOfInv:0, valueUSD:0, cppValueUSD:0 };
      map[r.mile].noOfInv     += r.noOfInv;
      map[r.mile].valueUSD    += r.valueUSD;
      map[r.mile].cppValueUSD += (r.cppValueUSD || 0);
    });
    return map;
  }, [lpDateFrom, lpDateTo, perfSubTab]);

  // ── Audit actuals ──
  const auditActualEvents = React.useMemo(() =>
    allEvents.filter((e) => e.endTime && e.scope === "Audit" && e.date >= paDFrom && e.date <= paDTo),
  [allEvents, paDFrom, paDTo]);

  const auditByUser = React.useMemo(() => {
    const map: Record<string, { login:string; mile:string; totalHrs:number; sessions:number; dates:Set<string> }> = {};
    auditActualEvents.forEach((e) => {
      if (!map[e.login]) map[e.login] = { login:e.login, mile:e.mile, totalHrs:0, sessions:0, dates:new Set() };
      map[e.login].totalHrs += dbEvtSecs(e)/3600;
      map[e.login].sessions += 1;
      map[e.login].dates.add(e.date);
    });
    return map;
  }, [auditActualEvents]);

  const auditRows = Object.values(auditByUser).sort((a,b) => b.totalHrs - a.totalHrs);
  const auditTotalHrs = auditRows.reduce((s,r) => s+r.totalHrs, 0);

  // ── Shared styles ──
  const thLP:  React.CSSProperties = { padding:"7px 10px", fontSize:10, fontWeight:700, color:"#fff", textAlign:"center" as const, whiteSpace:"nowrap" as const, background:"#1e3a5f", borderRight:"1px solid rgba(255,255,255,0.2)" };
  const thLPA: React.CSSProperties = { ...thLP, textAlign:"left" as const, minWidth:90 };
  const tdLP:  React.CSSProperties = { padding:"6px 10px", fontSize:11, textAlign:"center" as const, borderRight:`1px solid ${DB_BORDER}`, borderBottom:`1px solid ${DB_BORDER}`, color:DB_TEXT };
  const tdLPA: React.CSSProperties = { ...tdLP, textAlign:"left" as const, fontWeight:600, background:"#f8f9ff", whiteSpace:"nowrap" as const };
  const tdTot: React.CSSProperties = { padding:"6px 10px", fontSize:11, fontWeight:700, textAlign:"center" as const, borderRight:`1px solid ${DB_BORDER}`, borderBottom:`1px solid ${DB_BORDER}`, background:"#fef9c3", color:"#854d0e" };

  const fmtH   = (h: number) => h.toFixed(1);
  const fmtN2  = (n: number) => n.toFixed(2);
  const fmtUSD = (n: number) => n >= 1000 ? `$${(n/1000).toFixed(1)}k` : `$${n.toFixed(0)}`;

  const cmpHrs = (actual: number, plan: number): React.CSSProperties => {
    if (plan <= 0) return {};
    const r = actual / plan;
    if (r >= 0.9) return { background:"#dcfce7", color:"#166534", fontWeight:700 };
    if (r >= 0.7) return { background:"#fef9c3", color:"#854d0e", fontWeight:700 };
    return { background:"#fee2e2", color:"#991b1b", fontWeight:700 };
  };
  const cmpHC = (actual: number, plan: number): React.CSSProperties => {
    if (plan <= 0) return {};
    if (actual >= plan)       return { background:"#dcfce7", color:"#166534", fontWeight:700 };
    if (actual >= plan * 0.7) return { background:"#fef9c3", color:"#854d0e", fontWeight:700 };
    return { background:"#fee2e2", color:"#991b1b", fontWeight:700 };
  };
  const cmpUSD = (actual: number, plan: number): React.CSSProperties => {
    if (plan <= 0) return {};
    const r = actual / plan;
    if (r >= 0.9) return { background:"#dcfce7", color:"#166534", fontWeight:700 };
    if (r >= 0.6) return { background:"#fef9c3", color:"#854d0e", fontWeight:700 };
    return { background:"#fee2e2", color:"#991b1b", fontWeight:700 };
  };
  const cmpInv = (actual: number, plan: number): React.CSSProperties => {
    if (plan <= 0) return {};
    if (actual >= plan)       return { background:"#dcfce7", color:"#166534", fontWeight:700 };
    if (actual >= plan * 0.7) return { background:"#fef9c3", color:"#854d0e", fontWeight:700 };
    return { background:"#fee2e2", color:"#991b1b", fontWeight:700 };
  };
  const deltaStyle = (delta: number): React.CSSProperties =>
    delta >= 0 ? { background:"#dcfce7", color:"#166534", fontWeight:700 } : { background:"#fee2e2", color:"#991b1b", fontWeight:700 };

  // Totals
  const tPlanHrs    = LP_PLAN_DATA.reduce((s,r) => s + r.hrsRequired * lpDayCount, 0);
  const tPlanHC     = LP_PLAN_DATA.reduce((s,r) => s + r.plannedHC, 0);
  const tAvail      = LP_PLAN_DATA.reduce((s,r) => s + r.availHrs   * lpDayCount, 0);
  const tActualHrs  = Object.values(lpActuals).reduce((s,r) => s + r.hrs, 0);
  const tActualHC   = new Set(lpActualEvents.map(e=>e.login)).size;
  const tPlanUSD    = LP_PLAN_DATA.reduce((s,r) => s + r.dailyUSD * lpDayCount, 0);
  const tActualUSD  = Object.values(lpInvActuals).reduce((s,r) => s + r.valueUSD, 0);
  const tActualCPP  = Object.values(lpInvActuals).reduce((s,r) => s + (r.cppValueUSD||0), 0);
  const tActualInv  = Object.values(lpInvActuals).reduce((s,r) => s + r.noOfInv,  0);
  // Plan investigations: from sheet "No of Investigations required as per the plan (45% recovered)"
  const tPlanInv    = LP_PLAN_DATA.reduce((s,r) => s + (r.hrsRequired * lpDayCount / 3), 0);

  const paDayCount = Math.max(1, Math.round((new Date(paDTo).getTime()-new Date(paDFrom).getTime())/86400000)+1);

  return (
    <div style={{ display:"flex", flexDirection:"column" as const, gap:16 }}>
      {/* Sub-tab bar */}
      <div style={{ display:"flex", gap:8, background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:10, padding:"10px 16px", alignItems:"center" }}>
        <span style={{ fontSize:12, fontWeight:700, color:DB_MUTED, marginRight:8, letterSpacing:1, textTransform:"uppercase" as const }}>Performance</span>
        {([["lp","📦 LP"],["process_audit","🔍 Process Audit"]] as [PerfSubTab,string][]).map(([st,label]) => (
          <button key={st} onClick={()=>setPerfSubTab(st)}
            style={{ background:perfSubTab===st?"#2563eb":"transparent", color:perfSubTab===st?"#fff":DB_TEXT,
              border:perfSubTab===st?"none":`1px solid ${DB_BORDER}`, borderRadius:7, padding:"6px 18px",
              fontSize:12, fontWeight:700, cursor:"pointer" }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── LP Sub-tab ── */}
      {perfSubTab==="lp" && (
        <div style={{ display:"flex", flexDirection:"column" as const, gap:16 }}>
          {/* Date filter */}
          <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:10, padding:"12px 18px", display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" as const }}>
            <div><div style={{ fontSize:10, fontWeight:700, color:DB_MUTED, letterSpacing:1, marginBottom:4, textTransform:"uppercase" as const }}>From</div>
              <input type="date" style={dbSel} value={lpDateFrom} onChange={(e)=>setLpDateFrom(e.target.value)} /></div>
            <div><div style={{ fontSize:10, fontWeight:700, color:DB_MUTED, letterSpacing:1, marginBottom:4, textTransform:"uppercase" as const }}>To</div>
              <input type="date" style={dbSel} value={lpDateTo} onChange={(e)=>setLpDateTo(e.target.value)} /></div>
            <div style={{ background:"#eff6ff", border:`1px solid #bfdbfe`, borderRadius:8, padding:"8px 14px", fontSize:11, color:"#1e40af", fontWeight:600 }}>
              📅 {lpDayCount} day{lpDayCount!==1?"s":""} selected
            </div>
            <div style={{ flex:1 }} />
            <div style={{ fontSize:10, color:DB_MUTED, maxWidth:360, textAlign:"right" as const, lineHeight:1.6 }}>
              Plan = daily entitlement × {lpDayCount} days. HC = unique associates who logged LP.<br/>
              Investigations & value entered by each associate at clock-out.
            </div>
          </div>

          {/* KPI cards — 6 across */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:10 }}>
            {[
              { bg:"#faf5ff", c:"#7c3aed", label:"Plan Value (USD)",      val:fmtUSD(tPlanUSD),   sub:`${lpDayCount}d entitlement` },
              { bg:"#fffbeb", c:"#d97706", label:"Intervene Value (USD)",  val:fmtUSD(tActualUSD), sub:"recorded · view only" },
              { bg:"#eff6ff", c:"#1e40af", label:"Planned HC",             val:String(tPlanHC),    sub:"associates in plan" },
              { bg:"#fef9c3", c:"#854d0e", label:"Actual HC",              val:String(tActualHC),  sub:`${tPlanHC>0?Math.round(tActualHC/tPlanHC*100):0}% of planned` },
              { bg:"#fdf2f8", c:"#9d174d", label:"CPP Raised (USD)",       val:fmtUSD(tActualCPP), sub:`${tPlanUSD>0?Math.round(tActualCPP/tPlanUSD*100):0}% of plan` },
              { bg:"#dcfce7", c:"#166534", label:"Actual LP Hrs",          val:fmtH(tActualHrs),   sub:`${tPlanHrs>0?Math.round(tActualHrs/tPlanHrs*100):0}% of plan` },
            ].map(({bg,c,label,val,sub})=>(
              <div key={label} style={{ background:bg, borderRadius:8, padding:"10px 12px", textAlign:"center" as const }}>
                <div style={{ fontSize:9, fontWeight:600, color:c, marginBottom:3, lineHeight:1.3 }}>{label}</div>
                <div style={{ fontSize:18, fontWeight:900, color:c }}>{val}</div>
                <div style={{ fontSize:9, color:c, opacity:0.8, marginTop:2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* LP entitlement table */}
          <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
            <div style={{ background:"#1e3a5f", padding:"10px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>📦 LP Entitlement vs. Actuals · {lpDayCount}d Window</span>
              <span style={{ color:"#bfdbfe", fontSize:11 }}>Plan = daily entitlement × {lpDayCount} · 🟢≥90% · 🟡≥70% · 🔴&lt;70%</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr>
                    <th style={thLPA}>Region</th>
                    <th style={thLPA}>Mile</th>
                    {/* HC group */}
                    <th style={{ ...thLP, background:"#0f766e" }}>Planned HC</th>
                    <th style={{ ...thLP, background:"#0f766e" }}>Actual HC</th>
                    <th style={{ ...thLP, background:"#0f766e" }}>HC Δ</th>
                    {/* Hours group */}
                    <th style={{ ...thLP, background:"#7c3aed" }}>Avail Hrs</th>
                    <th style={{ ...thLP, background:"#7c3aed" }}>Plan LP Hrs</th>
                    <th style={{ ...thLP, background:"#7c3aed" }}>Actual LP Hrs</th>
                    <th style={{ ...thLP, background:"#7c3aed" }}>% to Plan</th>
                    <th style={{ ...thLP, background:"#7c3aed" }}>Hrs Δ</th>
                    {/* USD group */}
                    <th style={{ ...thLP, background:"#374151" }}>Plan USD</th>
                    <th style={{ ...thLP, background:"#374151" }}>Intervene USD</th>
                    <th style={{ ...thLP, background:"#9d174d" }}>CPP Raised USD</th>
                    <th style={{ ...thLP, background:"#9d174d" }}>CPP % to Plan</th>
                   </tr>
                </thead>
                <tbody>
                  {LP_PLAN_DATA.map((row, i) => {
                    const act       = lpActuals[row.mile];
                    const actHrs    = act ? act.hrs : 0;
                    const actHC     = act ? act.hc  : 0;
                    const planHrs   = row.hrsRequired * lpDayCount;
                    const planAvl   = row.availHrs    * lpDayCount;
                    const planUSD   = row.dailyUSD    * lpDayCount;
                    // investigations: approx 3h per investigation (from sheet logic)
                    const planInvF  = planHrs / 3;
                    const invData   = lpInvActuals[row.mile];
                    const actUSD    = invData ? invData.valueUSD    : 0;
                    const actCPP    = invData ? (invData.cppValueUSD||0) : 0;
                    const actInv    = invData ? invData.noOfInv  : 0;
                    const cppPct    = planUSD > 0 ? Math.round(actCPP / planUSD * 100) : 0;
                    const hcDelta   = actHC  - row.plannedHC;
                    const hrsDelta  = actHrs - planHrs;
                    const hrsPct    = planHrs > 0 ? Math.round(actHrs / planHrs * 100) : 0;
                    const usdPct    = planUSD > 0 ? Math.round(actUSD / planUSD * 100) : 0;
                    const invPct    = planInvF > 0 ? Math.round(actInv / planInvF * 100) : 0;
                    return (
                      <tr key={row.mile} style={{ borderBottom:`1px solid #f0f4ff`, background:i%2===0?"#fff":"#fafbff" }}>
                        <td style={tdLPA}>{row.region}</td>
                        <td style={tdLPA}><span style={{ background:"#eff6ff", color:"#1e40af", borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{row.mile}</span></td>
                        {/* HC */}
                        <td style={{ ...tdLP, background:"#f0fdf4", color:"#166534", fontWeight:700 }}>{row.plannedHC}</td>
                        <td style={{ ...tdLP, ...cmpHC(actHC, row.plannedHC) }}>{actHC}</td>
                        <td style={{ ...tdLP, ...deltaStyle(hcDelta) }}>{hcDelta>=0?`+${hcDelta}`:hcDelta}</td>
                        {/* Hours */}
                        <td style={{ ...tdLP, background:"#faf5ff", color:"#7e22ce" }}>{fmtH(planAvl)}</td>
                        <td style={{ ...tdLP, background:"#faf5ff", color:"#7e22ce", fontWeight:700 }}>{fmtH(planHrs)}</td>
                        <td style={{ ...tdLP, ...cmpHrs(actHrs, planHrs) }}>{fmtH(actHrs)}</td>
                        <td style={{ ...tdLP, ...cmpHrs(actHrs, planHrs) }}>{hrsPct}%</td>
                        <td style={{ ...tdLP, ...deltaStyle(hrsDelta) }}>{hrsDelta>=0?`+${fmtH(hrsDelta)}`:fmtH(hrsDelta)}</td>
                        {/* USD — Intervene: display only, CPP: compared vs Plan */}
                        <td style={{ ...tdLP, background:"#f8faff", color:"#374151", fontWeight:700 }}>{fmtUSD(planUSD)}</td>
                        <td style={{ ...tdLP, color: actUSD > 0 ? "#d97706" : DB_MUTED, fontWeight: actUSD > 0 ? 700 : 400 }}>{actUSD > 0 ? fmtUSD(actUSD) : "—"}</td>
                        <td style={{ ...tdLP, ...cmpUSD(actCPP, planUSD) }}>{actCPP > 0 ? fmtUSD(actCPP) : "—"}</td>
                        <td style={{ ...tdLP, ...cmpUSD(actCPP, planUSD) }}>{actCPP > 0 ? `${cppPct}%` : "—"}</td>
                      </tr>
                    );
                  })}
                  {/* Totals */}
                  <tr style={{ borderTop:`2px solid #1e3a5f` }}>
                    <td colSpan={2} style={{ ...tdLPA, background:"#1e3a5f", color:"#fff", fontWeight:800 }}>Total Direct - LP</td>
                    {/* HC totals */}
                    <td style={tdTot}>{tPlanHC}</td>
                    <td style={tdTot}>{tActualHC}</td>
                    <td style={{ ...tdTot, ...deltaStyle(tActualHC-tPlanHC) }}>{tActualHC-tPlanHC>=0?`+${tActualHC-tPlanHC}`:tActualHC-tPlanHC}</td>
                    {/* Hours totals */}
                    <td style={tdTot}>{fmtH(tAvail)}</td>
                    <td style={tdTot}>{fmtH(tPlanHrs)}</td>
                    <td style={tdTot}>{fmtH(tActualHrs)}</td>
                    <td style={{ ...tdTot, ...cmpHrs(tActualHrs, tPlanHrs) }}>{tPlanHrs>0?Math.round(tActualHrs/tPlanHrs*100):0}%</td>
                    <td style={{ ...tdTot, ...deltaStyle(tActualHrs-tPlanHrs) }}>{tActualHrs-tPlanHrs>=0?`+${fmtH(tActualHrs-tPlanHrs)}`:fmtH(tActualHrs-tPlanHrs)}</td>
                    {/* USD totals */}
                    <td style={tdTot}>{fmtUSD(tPlanUSD)}</td>
                    <td style={{ ...tdTot, color:"#d97706" }}>{tActualUSD>0?fmtUSD(tActualUSD):"—"}</td>
                    <td style={{ ...tdTot, ...cmpUSD(tActualCPP, tPlanUSD) }}>{tActualCPP>0?fmtUSD(tActualCPP):"—"}</td>
                    <td style={{ ...tdTot, ...cmpUSD(tActualCPP, tPlanUSD) }}>{tActualCPP>0?`${Math.round(tActualCPP/tPlanUSD*100)}%`:"—"}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-associate LP breakdown */}
          {lpActualEvents.length > 0 && (()=>{
            // Merge hours + investigation data per associate
            const byUser: Record<string,{login:string;mile:string;hrs:number;sessions:number;invCount:number;invUSD:number;cppUSD:number}> = {};
            lpActualEvents.forEach((e)=>{
              if(!byUser[e.login]) byUser[e.login]={login:e.login,mile:e.mile,hrs:0,sessions:0,invCount:0,invUSD:0,cppUSD:0};
              byUser[e.login].hrs      += dbEvtSecs(e)/3600;
              byUser[e.login].sessions += 1;
            });
            // Overlay investigation data
            getAllLPInvestigations().filter(r=>r.date>=lpDateFrom&&r.date<=lpDateTo).forEach(r=>{
              if(byUser[r.login]){ byUser[r.login].invCount+=r.noOfInv; byUser[r.login].invUSD+=r.valueUSD; byUser[r.login].cppUSD+=(r.cppValueUSD||0); }
            });
            const rows = Object.values(byUser).sort((a,b)=>b.hrs-a.hrs);
            return (
              <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ background:"#0f766e", padding:"10px 18px" }}><span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>👤 LP by Associate</span></div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead><tr style={{ background:"#f0fdf4" }}>
                    {["#","Associate","Mile","LP Hours","Sessions","Investigations","Intervene (USD)","CPP Raised (USD)"].map(h=>(
                      <th key={h} style={{ padding:"7px 12px", fontWeight:700, fontSize:10, color:DB_MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${DB_BORDER}`, textAlign:["#","Associate","Mile"].includes(h)?"left" as const:"center" as const }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{rows.map((r,i)=>(
                    <tr key={r.login} style={{ borderBottom:`1px solid #f0f4ff`, background:i%2===0?"#fff":"#fafbff" }}>
                      <td style={tdLP}>{i+1}</td>
                      <td style={{ ...tdLPA, color:DB_ACCENT, fontWeight:700 }}>{r.login}</td>
                      <td style={tdLPA}><span style={{ background:"#eff6ff", color:"#1e40af", borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{r.mile}</span></td>
                      <td style={{ ...tdLP, fontWeight:700, color:"#166534" }}>{fmtH(r.hrs)}</td>
                      <td style={tdLP}>{r.sessions}</td>
                      <td style={{ ...tdLP, fontWeight:r.invCount>0?700:400, color:r.invCount>0?"#b45309":DB_MUTED }}>{r.invCount>0?r.invCount:"—"}</td>
                      <td style={{ ...tdLP, fontWeight:r.invUSD>0?700:400, color:r.invUSD>0?"#d97706":DB_MUTED }}>{r.invUSD>0?fmtUSD(r.invUSD):"—"}</td>
                      <td style={{ ...tdLP, fontWeight:r.cppUSD>0?700:400, color:r.cppUSD>0?"#9d174d":DB_MUTED }}>{r.cppUSD>0?fmtUSD(r.cppUSD):"—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            );
          })()}
          {lpActualEvents.length===0 && (
            <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"32px", textAlign:"center" as const }}>
              <div style={{ fontSize:28, marginBottom:8 }}>📭</div>
              <div style={{ fontSize:13, fontWeight:700, color:DB_TEXT }}>No LP events for selected date range</div>
              <div style={{ fontSize:11, color:DB_MUTED, marginTop:4 }}>Associates must log "LP" scope in TEMPO. Investigation data is entered at clock-out.</div>
            </div>
          )}
        </div>
      )}

      {/* ── Process Audit Sub-tab ── */}
      {perfSubTab==="process_audit" && (
        <div style={{ display:"flex", flexDirection:"column" as const, gap:16 }}>
          {/* Date filter */}
          <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:10, padding:"12px 18px", display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" as const }}>
            <div><div style={{ fontSize:10, fontWeight:700, color:DB_MUTED, letterSpacing:1, marginBottom:4, textTransform:"uppercase" as const }}>From</div>
              <input type="date" style={dbSel} value={paDFrom} onChange={(e)=>setPaDFrom(e.target.value)} /></div>
            <div><div style={{ fontSize:10, fontWeight:700, color:DB_MUTED, letterSpacing:1, marginBottom:4, textTransform:"uppercase" as const }}>To</div>
              <input type="date" style={dbSel} value={paDTo} onChange={(e)=>setPaDTo(e.target.value)} /></div>
            <div style={{ background:"#eff6ff", border:`1px solid #bfdbfe`, borderRadius:8, padding:"8px 14px", fontSize:11, color:"#1e40af", fontWeight:600 }}>
              📅 {paDayCount} day{paDayCount!==1?"s":""}
            </div>
          </div>

          {/* KPI summary */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
            {[
              { bg:"#1e3a5f", c:"#fff",    label:"Total Audit Hours",    val:fmtH(auditTotalHrs), sub:"across all associates" },
              { bg:"#dcfce7", c:"#166534", label:"Associates Auditing",   val:String(auditRows.length), sub:"unique users" },
              { bg:"#fef9c3", c:"#854d0e", label:"Total Audit Sessions",  val:String(auditRows.reduce((s,r)=>s+r.sessions,0)), sub:"individual audit blocks" },
            ].map(({bg,c,label,val,sub})=>(
              <div key={label} style={{ background:bg, borderRadius:8, padding:"12px 16px", textAlign:"center" as const }}>
                <div style={{ fontSize:10, fontWeight:600, color:c, marginBottom:4 }}>{label}</div>
                <div style={{ fontSize:22, fontWeight:900, color:c }}>{val}</div>
                <div style={{ fontSize:10, color:c, opacity:0.8, marginTop:2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Audit detail table */}
          {auditRows.length > 0 ? (
            <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
              <div style={{ background:"#7c3aed", padding:"10px 18px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>🔍 Process Audit Detail</span>
                <span style={{ color:"#ede9fe", fontSize:11 }}>{auditRows.length} associate(s)</span>
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead><tr style={{ background:"#f5f3ff" }}>
                  {["#","Associate","Mile","Total Audit Hrs","Active Days","Sessions","Avg Hrs/Day","% of Shift (7h)"].map(h=>(
                    <th key={h} style={{ padding:"7px 12px", fontWeight:700, fontSize:10, color:DB_MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${DB_BORDER}`, textAlign:["#","Associate","Mile"].includes(h)?"left" as const:"center" as const }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {auditRows.map((r,i)=>{
                    const avgDay = r.dates.size>0 ? r.totalHrs/r.dates.size : 0;
                    const pct    = Math.round(avgDay/7*100);
                    return (
                      <tr key={r.login} style={{ borderBottom:`1px solid #f0f4ff`, background:i%2===0?"#fff":"#fafbff" }}>
                        <td style={tdLPA}>{i+1}</td>
                        <td style={{ ...tdLPA, color:DB_ACCENT, fontWeight:700 }}>{r.login}</td>
                        <td style={tdLPA}><span style={{ background:"#eff6ff", color:"#1e40af", borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>{r.mile}</span></td>
                        <td style={{ ...tdLP, fontWeight:700, color:"#7c3aed" }}>{fmtH(r.totalHrs)}</td>
                        <td style={tdLP}>{r.dates.size}</td>
                        <td style={tdLP}>{r.sessions}</td>
                        <td style={tdLP}>{fmtH(avgDay)}</td>
                        <td style={{ ...tdLP, background:pct>=20?"#dcfce7":pct>=10?"#fef9c3":"#fee2e2", color:pct>=20?"#166534":pct>=10?"#854d0e":"#991b1b", fontWeight:700 }}>{pct}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"32px", textAlign:"center" as const }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🔍</div>
              <div style={{ fontSize:13, fontWeight:700, color:DB_TEXT }}>No Audit events for selected date range</div>
              <div style={{ fontSize:11, color:DB_MUTED, marginTop:4 }}>Associates must log "Audit" scope in TEMPO for actuals to show here.</div>
            </div>
          )}

          {/* Audit by date */}
          {auditActualEvents.length > 0 && (()=>{
            const byDate: Record<string,{date:string;hrs:number;hc:number;sessions:number;users:Set<string>}> = {};
            auditActualEvents.forEach(e=>{
              if(!byDate[e.date]) byDate[e.date]={date:e.date,hrs:0,hc:0,sessions:0,users:new Set()};
              byDate[e.date].hrs+=dbEvtSecs(e)/3600; byDate[e.date].users.add(e.login); byDate[e.date].sessions+=1;
            });
            Object.values(byDate).forEach(r=>{r.hc=r.users.size;});
            const rows=Object.values(byDate).sort((a,b)=>a.date<b.date?1:-1);
            return (
              <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ background:"#0f766e", padding:"10px 18px" }}><span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>📅 Audit by Date</span></div>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                  <thead><tr style={{ background:"#f0fdf4" }}>{["Date","Audit Hrs","Associates","Sessions","Avg Hrs/HC"].map(h=><th key={h} style={{ padding:"7px 12px", fontWeight:700, fontSize:10, color:DB_MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${DB_BORDER}`, textAlign:h==="Date"?"left" as const:"center" as const }}>{h}</th>)}</tr></thead>
                  <tbody>{rows.map((r,i)=>(
                    <tr key={r.date} style={{ borderBottom:`1px solid #f0f4ff`, background:i%2===0?"#fff":"#fafbff" }}>
                      <td style={tdLPA}>{new Date(r.date+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</td>
                      <td style={{ ...tdLP, color:"#0f766e", fontWeight:700 }}>{fmtH(r.hrs)}</td>
                      <td style={tdLP}>{r.hc}</td>
                      <td style={tdLP}>{r.sessions}</td>
                      <td style={tdLP}>{r.hc>0?fmtH(r.hrs/r.hc):"—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function TempoDashboardEmbed({ onClose }: { onClose: () => void }) {
  const [role,         setRole]         = React.useState<DashRole | null>(null);
  const [aliasInput,   setAliasInput]   = React.useState("");
  const [passInput,    setPassInput]    = React.useState("");
  const [loginError,   setLoginError]   = React.useState("");
  const [currentLogin, setCurrentLogin] = React.useState("");

  const handleLogin = () => {
    const r = verifyDashboardLogin(aliasInput, passInput);
    if (!r) { setLoginError("Invalid alias or password."); return; }
    setRole(r); setCurrentLogin(aliasInput.trim().toLowerCase()); setLoginError("");
  };

  const [tab,         setTab]        = React.useState<DashTab>("overview");
  const [filterMile,  setFilterMile] = React.useState("ALL");
  const [filterFrom,  setFilterFrom] = React.useState(dbDayStr(-7));
  const [filterTo,    setFilterTo]   = React.useState(getTodayStr());
  const [filterLogin, setFilterLogin]= React.useState("");
  const [dodOffset,   setDodOffset]  = React.useState(0);
  const [wowOffset,   setWowOffset]  = React.useState(0);
  const [bmMile,      setBmMile]     = React.useState("ALL");
  const [ytdMile,     setYtdMile]    = React.useState("ALL");  // separate YTD mile filter
  const [mgrs,        setMgrsState]  = React.useState(() => getManagerCreds());
  const [newAlias,    setNewAlias]   = React.useState("");
  const [newPass,     setNewPass]    = React.useState("");
  const [newPassErr,  setNewPassErr] = React.useState("");

  const today     = getTodayStr();
  const allEvents = React.useMemo(() => getAllEvents(), [tab]);
  const allLogins = React.useMemo(() => [...new Set(allEvents.map((e) => e.login))].sort(), [allEvents]);

  const filteredEvents = React.useMemo(() => allEvents.filter((e) => {
    if (filterMile !== "ALL" && e.mile !== filterMile) return false;
    if (e.date < filterFrom || e.date > filterTo) return false;
    if (filterLogin && !e.login.includes(filterLogin)) return false;
    return true;
  }), [allEvents, filterMile, filterFrom, filterTo, filterLogin]);

  const completedFiltered = filteredEvents.filter((e) => e.endTime);
  const totalSecs   = completedFiltered.reduce((a, e) => a + dbEvtSecs(e), 0);
  const uniqueUsers = [...new Set(completedFiltered.map((e) => e.login))].length;
  const scopeMap: Record<string,number> = {};
  completedFiltered.forEach((e) => { scopeMap[e.scope]=(scopeMap[e.scope]||0)+dbEvtSecs(e); });
  const scopeEntries = Object.entries(scopeMap).sort((a,b)=>b[1]-a[1]);
  const scopeTotal   = scopeEntries.reduce((a,[,v])=>a+v,0);

  const refreshMgrs = () => setMgrsState(getManagerCreds());
  const handleAddMgr = () => {
    const a = newAlias.trim().toLowerCase();
    if (!a||!newPass.trim()) { setNewPassErr("Alias and password required"); return; }
    if (a===OWNER) { setNewPassErr("Cannot add owner as manager"); return; }
    addManagerCred(a,newPass.trim()); refreshMgrs(); setNewAlias(""); setNewPass(""); setNewPassErr("");
  };
  const handleRemoveMgr = (login: string) => { if(login===OWNER) return; removeManagerCred(login); refreshMgrs(); };

  // ── Login screen ──
  if (!role) return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:DB, gap:20 }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ background:"#2563eb", color:"#fff", borderRadius:8, padding:"5px 20px", fontSize:18, fontWeight:900, letterSpacing:4, display:"inline-block" }}>TEMPO</div>
        <div style={{ fontSize:11, color:DB_MUTED, marginTop:6, letterSpacing:1.5, textTransform:"uppercase" as const }}>Dashboard · Manager Access</div>
      </div>
      <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:14, padding:"28px 32px", width:380, boxShadow:"0 4px 24px #2563eb11" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <div style={{ width:38, height:38, borderRadius:"50%", background:"#eff6ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20 }}>🛡️</div>
          <div>
            <div style={{ fontSize:14, fontWeight:800, color:DB_TEXT }}>Sign In to Dashboard</div>
            <div style={{ fontSize:11, color:DB_MUTED }}>Enter your alias and password</div>
          </div>
        </div>
        <div style={{ fontSize:12, color:DB_TEXT, marginBottom:4 }}>Amazon Alias</div>
        <input style={{ width:"100%", border:`1.5px solid ${DB_BORDER}`, borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box" as const, color:DB_TEXT, marginBottom:10 }}
          placeholder="e.g. prdmano" value={aliasInput}
          onChange={(e) => { setAliasInput(e.target.value); setLoginError(""); }}
          onKeyDown={(e) => e.key==="Enter" && (document.getElementById("dbPassInput") as HTMLInputElement)?.focus()} autoFocus />
        <div style={{ fontSize:12, color:DB_TEXT, marginBottom:4 }}>Password</div>
        <input id="dbPassInput" type="password"
          style={{ width:"100%", border:`1.5px solid ${loginError?"#ef4444":DB_BORDER}`, borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box" as const, color:DB_TEXT, marginBottom:loginError?6:16 }}
          placeholder="Password" value={passInput}
          onChange={(e) => { setPassInput(e.target.value); setLoginError(""); }}
          onKeyDown={(e) => e.key==="Enter" && handleLogin()} />
        {loginError && <div style={{ fontSize:11, color:"#ef4444", marginBottom:12 }}>⚠ {loginError}</div>}
        <button onClick={handleLogin} style={{ width:"100%", background:"#2563eb", color:"#fff", border:"none", borderRadius:8, padding:"11px 0", fontSize:14, fontWeight:800, cursor:"pointer" }}>Sign In</button>
        <button onClick={onClose} style={{ width:"100%", background:"transparent", color:DB_MUTED, border:`1px solid ${DB_BORDER}`, borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:600, cursor:"pointer", marginTop:8 }}>← Back to TEMPO Tool</button>
        <div style={{ fontSize:10, color:DB_MUTED, marginTop:12, textAlign:"center" as const }}>Contact <b>prdmano</b> to get access.</div>
      </div>
    </div>
  );

  const roleLabel = role==="owner" ? "OWNER" : "MANAGER";
  const roleColor = role==="owner" ? "#f59e0b" : "#22c55e";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:DB, overflow:"hidden" }}>
      {/* Navbar */}
      <div style={{ background:"#2563eb", color:"#fff", display:"flex", alignItems:"center", padding:"0 24px", height:50, flexShrink:0, gap:16, borderBottom:"2px solid #1d4ed8" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ background:"#fff", color:"#2563eb", borderRadius:4, padding:"2px 10px", fontWeight:900, fontSize:14, letterSpacing:2 }}>TEMPO</div>
          <div style={{ display:"flex", flexDirection:"column", lineHeight:1.1 }}>
            <span style={{ fontSize:11, fontWeight:600 }}>Dashboard</span>
            <span style={{ fontSize:9, color:"#bfdbfe" }}>Manager View</span>
          </div>
        </div>
        <div style={{ display:"flex", gap:4, marginLeft:24 }}>
          {([ ["overview","📊 Overview"], ["benchmark","📈 Benchmark"], ["breaks","☕ Breaks"], ["livelog","📋 Live Log"], ["performance","🎯 Performance"], ["managers","👥 Managers"] ] as [DashTab,string][]).map(([t,label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ background:tab===t?"rgba(255,255,255,0.2)":"transparent", color:"#fff", border:tab===t?"1px solid rgba(255,255,255,0.4)":"1px solid transparent", borderRadius:7, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>{label}</button>
          ))}
        </div>
        <div style={{ flex:1 }} />
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.12)", borderRadius:20, padding:"4px 12px 4px 8px" }}>
          <div style={{ width:26, height:26, borderRadius:"50%", background:"rgba(255,255,255,0.3)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700 }}>{currentLogin?.[0]?.toUpperCase()||"?"}</div>
          <div style={{ lineHeight:1.2 }}>
            <div style={{ fontSize:11, fontWeight:700 }}>{currentLogin}</div>
            <div style={{ fontSize:9, color:roleColor, fontWeight:700, letterSpacing:1 }}>{roleLabel}</div>
          </div>
        </div>
        <button onClick={() => { setRole(null); setAliasInput(""); setPassInput(""); }} style={{ background:"transparent", color:"#bfdbfe", border:"1px solid #93c5fd", borderRadius:6, padding:"4px 12px", fontSize:11, cursor:"pointer" }}>Sign Out</button>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid #93c5fd", borderRadius:6, padding:"4px 12px", fontSize:11, fontWeight:600, cursor:"pointer" }}>← Tool</button>
      </div>

      {/* Body */}
      <div style={{ flex:1, overflowY:"auto", padding:"20px 24px", display:"flex", flexDirection:"column", gap:18 }}>

        {/* OVERVIEW */}
        {tab==="overview" && (()=>{
          // ── YTD calculations (Year to Date, filtered by ytdMile) ──
          const ytdYear = new Date().getFullYear().toString();
          const ytdAllEvts = allEvents.filter((e)=>e.endTime&&e.date.startsWith(ytdYear)&&(ytdMile==="ALL"||e.mile===ytdMile));
          const ytdTot  = ytdAllEvts.reduce((a,e)=>a+dbEvtSecs(e),0);
          const ytdDir  = ytdAllEvts.filter((e)=>e.functionType==="Direct").reduce((a,e)=>a+dbEvtSecs(e),0);
          const ytdInd  = ytdAllEvts.filter((e)=>["In-Direct","Indirect","Break"].includes(e.functionType)||["Drills","Huddle","Handover","Learning","Rebuttals"].includes(e.scope)).reduce((a,e)=>a+dbEvtSecs(e),0);
          const ytdIdl  = ytdAllEvts.filter((e)=>e.functionType==="Idle"||e.scope==="Idle / No Task").reduce((a,e)=>a+dbEvtSecs(e),0);
          const ytdIno  = ytdAllEvts.filter((e)=>e.functionType==="Innovation"||e.scope.includes("Initiative")).reduce((a,e)=>a+dbEvtSecs(e),0);
          const ytdHCu  = [...new Set(ytdAllEvts.map((e)=>e.login))].length;
          const pct     = (s:number)=>ytdTot>0?Math.round((s/ytdTot)*100):0;

          return (
            <>
              {/* ── YTD block — TOP, with its own mile filter ── */}
              <div style={{ background:"linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%)", borderRadius:12, padding:"16px 22px" }}>
                {/* YTD header + mile filter */}
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:"#fff", letterSpacing:0.5 }}>
                      Year to Date · {ytdYear}
                    </div>
                    <div style={{ fontSize:10, color:"#bfdbfe", marginTop:2 }}>
                      All activity from 1 Jan {ytdYear} — showing {ytdHCu} associate{ytdHCu!==1?"s":""}
                    </div>
                  </div>
                  {/* YTD Mile Filter */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, background:"rgba(255,255,255,0.12)", borderRadius:8, padding:"6px 12px" }}>
                    <span style={{ fontSize:10, fontWeight:700, color:"#bfdbfe", letterSpacing:1, textTransform:"uppercase" as const }}>Mile</span>
                    <select
                      style={{ background:"rgba(255,255,255,0.2)", border:"1px solid rgba(255,255,255,0.3)", borderRadius:6, color:"#fff", padding:"5px 10px", fontSize:13, fontWeight:700, outline:"none", cursor:"pointer" }}
                      value={ytdMile}
                      onChange={(e)=>setYtdMile(e.target.value)}>
                      <option value="ALL" style={{ background:"#1e3a5f" }}>All Miles</option>
                      {MILES.map(m=><option key={m} value={m} style={{ background:"#1e3a5f" }}>{m}</option>)}
                    </select>
                  </div>
                </div>

                {/* YTD Function Type cards */}
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
                  {[
                    { label:"Direct",     val:ytdDir, pct:pct(ytdDir), color:"#22c55e", bg:"#166534", target:"≥80%", ok:pct(ytdDir)>=80 },
                    { label:"In-Direct",  val:ytdInd, pct:pct(ytdInd), color:"#60a5fa", bg:"#1e40af", target:"<15%", ok:pct(ytdInd)<15 },
                    { label:"Idle",       val:ytdIdl, pct:pct(ytdIdl), color:"#94a3b8", bg:"#334155", target:"<3%",  ok:pct(ytdIdl)<3  },
                    { label:"Invention", val:ytdIno, pct:pct(ytdIno), color:"#c084fc", bg:"#6b21a8", target:"<2%",  ok:pct(ytdIno)<2  },
                  ].map(({label,val,pct:p,color,bg,target,ok})=>(
                    <div key={label} style={{ background:"rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 14px", border:`1px solid ${ok?"rgba(255,255,255,0.2)":"rgba(239,68,68,0.5)"}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:"#fff" }}>{label}</div>
                        <span style={{ fontSize:9, color:ok?"#bbf7d0":"#fca5a5", background:"rgba(0,0,0,0.25)", borderRadius:4, padding:"1px 5px", fontWeight:700 }}>
                          {ok?"✓":"✗"} {target}
                        </span>
                      </div>
                      <div style={{ fontSize:28, fontWeight:900, color:ok?color:"#f87171" }}>{p}%</div>
                      <div style={{ fontSize:10, color:"#93c5fd", marginTop:2 }}>{formatDuration(val)} total</div>
                      <div style={{ height:4, background:"rgba(0,0,0,0.25)", borderRadius:3, marginTop:8, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${Math.min(p,100)}%`, background:ok?color:"#f87171", borderRadius:3, transition:"width 0.5s" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Range filters ── */}
              <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"14px 20px", display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" as const }}>
                {[ { label:"Mile", el:<select style={dbSel} value={filterMile} onChange={(e)=>setFilterMile(e.target.value)}><option value="ALL">All Miles</option>{MILES.map(m=><option key={m}>{m}</option>)}</select> }, { label:"From", el:<input type="date" style={dbSel} value={filterFrom} onChange={(e)=>setFilterFrom(e.target.value)} /> }, { label:"To", el:<input type="date" style={dbSel} value={filterTo} onChange={(e)=>setFilterTo(e.target.value)} /> }, { label:"Login", el:<input style={dbSel} placeholder="Search alias…" value={filterLogin} onChange={(e)=>setFilterLogin(e.target.value)} /> } ].map(({label,el})=>(
                  <div key={label}><div style={{ fontSize:10, fontWeight:700, color:DB_MUTED, letterSpacing:1, marginBottom:4, textTransform:"uppercase" as const }}>{label}</div>{el}</div>
                ))}
              </div>

              {/* Range stats — Active Users + Direct / In-Direct / Idle / Innovation */}
              {(()=>{
                const rDir = completedFiltered.filter((e)=>e.functionType==="Direct").reduce((a,e)=>a+dbEvtSecs(e),0);
                const rInd = completedFiltered.filter((e)=>["In-Direct","Indirect","Break"].includes(e.functionType)||["Drills","Huddle","Handover","Learning","Rebuttals"].includes(e.scope)).reduce((a,e)=>a+dbEvtSecs(e),0);
                const rIdl = completedFiltered.filter((e)=>e.functionType==="Idle"||e.scope==="Idle / No Task").reduce((a,e)=>a+dbEvtSecs(e),0);
                const rIno = completedFiltered.filter((e)=>e.functionType==="Innovation"||e.scope.includes("Initiative")).reduce((a,e)=>a+dbEvtSecs(e),0);
                return (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:12 }}>
                    <DbStatCard label="Active Users"      value={String(uniqueUsers)}                                      color="#2563eb" />
                    <DbStatCard label="Avg per User"      value={uniqueUsers>0?formatDuration(Math.round(totalSecs/uniqueUsers)):"—"} color="#64748b" />
                    <DbStatCard label="Direct Hrs"        value={formatDuration(rDir)}  sub={totalSecs>0?`${Math.round((rDir/totalSecs)*100)}% of total`:""} color="#22c55e" />
                    <DbStatCard label="In-Direct Hrs"     value={formatDuration(rInd)}  sub={totalSecs>0?`${Math.round((rInd/totalSecs)*100)}% of total`:""} color="#3b82f6" />
                    <DbStatCard label="Idle Hrs"          value={formatDuration(rIdl)}  sub={totalSecs>0?`${Math.round((rIdl/totalSecs)*100)}% of total`:""} color="#94a3b8" />
                    <DbStatCard label="Invention Hrs"    value={formatDuration(rIno)}  sub={totalSecs>0?`${Math.round((rIno/totalSecs)*100)}% of total`:""} color="#9333ea" />
                  </div>
                );
              })()}

              {/* Scope Breakdown */}
              <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"18px 22px" }}>
                <div style={{ fontSize:13, fontWeight:700, color:DB_TEXT, marginBottom:14 }}>Process Scope Breakdown</div>
                {scopeEntries.length===0 ? <div style={{ color:DB_MUTED, fontSize:12 }}>No data</div>
                  : scopeEntries.map(([k,v])=><DbHBar key={k} label={k} value={v} total={scopeTotal} color={SCOPE_COLORS[k]||"#888"} />)}
              </div>
            </>
          );
        })()}

        {/* BENCHMARK */}
        {tab==="benchmark" && (()=>{
          const T_DIR=80, T_IND=15, T_IDL=3, T_INO=2;
          const dodDates=Array.from({length:7},(_,i)=>dbDayStr(dodOffset-i));
          const wowWeeks=[wowOffset, wowOffset-1, wowOffset-2]; // newest first
          // ISO week number helper
          const isoWeekNum=(w:number)=>{
            const d=new Date(dbWeekDates(w)[0]+"T00:00:00");
            const jan4=new Date(d.getFullYear(),0,4);
            const startOfWeek1=new Date(jan4);
            startOfWeek1.setDate(jan4.getDate()-((jan4.getDay()+6)%7));
            return Math.round((d.getTime()-startOfWeek1.getTime())/(7*24*3600*1000))+1;
          };
          const wkLabel=(w:number)=>`Wk ${isoWeekNum(w)}`;
          const wkRange=(w:number)=>{
            const dates=dbWeekDates(w);
            const fmt=(d:string)=>new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
            return `${fmt(dates[0])} – ${fmt(dates[6])}`;
          };
          const shiftHrs=(sk:string)=>{ const sh=SHIFTS[sk as keyof typeof SHIFTS]; if(!sh?.start||!sh?.end) return 8*3600; const[h1,m1]=sh.start.split(":").map(Number),[h2,m2]=sh.end.split(":").map(Number); const sm=h1*60+m1,em=h2*60+m2; return(em>sm?(em-sm)/60:(1440-sm+em)/60)*3600; };
          const calcStats=(evts:TimeEvent[])=>{
            const users=[...new Set(evts.map((e)=>e.login))].length;
            const totalS=evts.reduce((a,e)=>a+dbEvtSecs(e),0);
            const directS=evts.filter((e)=>e.functionType==="Direct").reduce((a,e)=>a+dbEvtSecs(e),0);
            const indirectS=evts.filter((e)=>["In-Direct","Indirect","Break"].includes(e.functionType)||["Drills","Huddle","Break","Handover","Learning","Rebuttals"].includes(e.scope)).reduce((a,e)=>a+dbEvtSecs(e),0);
            const idleS=evts.filter((e)=>e.functionType==="Idle"||e.scope==="Idle / No Task").reduce((a,e)=>a+dbEvtSecs(e),0);
            const innoS=evts.filter((e)=>e.functionType==="Innovation"||e.scope.includes("Initiative")).reduce((a,e)=>a+dbEvtSecs(e),0);
            const availableS=[...new Set(evts.map((e)=>e.login))].reduce((s,l)=>{ const ue=evts.filter((e)=>e.login===l); const days=[...new Set(ue.map((e)=>e.date))].length; return s+days*shiftHrs(ue[0]?.shiftCode||"X"); },0);
            const th=(s:number)=>s>0?(s/3600).toFixed(1):"0";
            const tp=(s:number)=>totalS>0?Math.round((s/totalS)*100):0;
            const otS=totalS>availableS?totalS-availableS:0, shortS=totalS<availableS?availableS-totalS:0, unkS=Math.max(0,shortS-idleS);
            return{users,totalHrs:th(totalS),availableHrs:th(availableS),directHrs:th(directS),indirectHrs:th(indirectS),idleHrs:th(idleS),innovationHrs:th(innoS),otHrs:th(otS),unknownHrs:th(unkS),directPct:tp(directS),indirectPct:tp(indirectS),idlePct:tp(idleS),innovationPct:tp(innoS)};
          };
          const dodStats=dodDates.map((d)=>calcStats(allEvents.filter((e)=>e.endTime&&e.date===d&&(bmMile==="ALL"||e.mile===bmMile))));
          const wowStats=wowWeeks.map((w)=>calcStats(allEvents.filter((e)=>e.endTime&&dbWeekDates(w).includes(e.date)&&(bmMile==="ALL"||e.mile===bmMile))));
          const ytdYear=new Date().getFullYear().toString();
          const ytdEvts=allEvents.filter((e)=>e.endTime&&e.date.startsWith(ytdYear)&&(bmMile==="ALL"||e.mile===bmMile));
          const ytdHC=[...new Set(ytdEvts.map((e)=>e.login))].length;
          const ytdTot=ytdEvts.reduce((a,e)=>a+dbEvtSecs(e),0);
          const ytdDir=ytdEvts.filter((e)=>e.functionType==="Direct").reduce((a,e)=>a+dbEvtSecs(e),0);
          const ytdInd=ytdEvts.filter((e)=>["In-Direct","Indirect","Break"].includes(e.functionType)).reduce((a,e)=>a+dbEvtSecs(e),0);
          const ytdIdl=ytdEvts.filter((e)=>e.functionType==="Idle"||e.scope==="Idle / No Task").reduce((a,e)=>a+dbEvtSecs(e),0);
          const ytdIno=ytdEvts.filter((e)=>e.functionType==="Innovation"||e.scope.includes("Initiative")).reduce((a,e)=>a+dbEvtSecs(e),0);
          const th=(s:number)=>s>0?(s/3600).toFixed(1):"0";
          const fmtD=(d:string)=>new Date(d+"T00:00:00").toLocaleDateString("en-GB",{day:"numeric",month:"short"});
          const pctBg=(v:number,t:number,inv=false)=>v===0?"transparent":(!inv?v>=t:v<=t)?"#dcfce7":"#fee2e2";
          const pctFg=(v:number,t:number,inv=false)=>v===0?DB_TEXT:(!inv?v>=t:v<=t)?"#166534":"#991b1b";
          const thS:React.CSSProperties={padding:"6px 10px",fontSize:11,fontWeight:700,color:"#fff",textAlign:"center" as const,whiteSpace:"nowrap" as const,borderRight:"1px solid rgba(255,255,255,0.2)"};
          const aTh:React.CSSProperties={padding:"6px 10px",fontSize:11,fontWeight:700,color:"#fff",textAlign:"left" as const,background:"#2563eb",borderRight:"1px solid rgba(255,255,255,0.2)",minWidth:110};
          const cS:React.CSSProperties={padding:"5px 10px",fontSize:11,textAlign:"center" as const,borderRight:`1px solid ${DB_BORDER}`,borderBottom:`1px solid ${DB_BORDER}`,color:DB_TEXT};
          const aC:React.CSSProperties={padding:"5px 10px",fontSize:11,fontWeight:600,color:DB_TEXT,borderRight:`1px solid ${DB_BORDER}`,borderBottom:`1px solid ${DB_BORDER}`,background:"#f8f9ff",whiteSpace:"nowrap" as const};
          const tC:React.CSSProperties={padding:"5px 10px",fontSize:11,fontWeight:700,textAlign:"center" as const,borderRight:`1px solid ${DB_BORDER}`,borderBottom:`1px solid ${DB_BORDER}`,background:"#fef9c3",color:"#854d0e"};
          return (
            <>
              <div style={{ display:"flex", alignItems:"center", background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ background:"#fca5a5", padding:"18px 28px", fontSize:22, fontWeight:800, color:"#7f1d1d", minWidth:140, textAlign:"center" as const }}>Mile</div>
                <div style={{ flex:1 }}><select style={{ width:"100%", border:"none", fontSize:22, fontWeight:800, color:"#1e3a5f", padding:"18px 20px", outline:"none", background:"transparent", cursor:"pointer" }} value={bmMile} onChange={(e)=>setBmMile(e.target.value)}><option value="ALL">ALL</option>{MILES.map(m=><option key={m}>{m}</option>)}</select></div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:10 }}>
                {[
                  {bg:"#2563eb",c:"#fff",label:`YTD HC · ${bmMile==="ALL"?"ALL":bmMile}`,val:String(ytdHC),sub:"associates tracked"},
                  {bg:"#dcfce7",c:"#15803d",label:"Total Direct Hrs YTD",val:th(ytdDir),sub:`${ytdTot>0?Math.round((ytdDir/ytdTot)*100):0}% of total`},
                  {bg:"#dbeafe",c:"#1d4ed8",label:"Total In-Direct Hrs YTD",val:th(ytdInd),sub:`${ytdTot>0?Math.round((ytdInd/ytdTot)*100):0}% of total`},
                  {bg:"#f1f5f9",c:"#64748b",label:"Total Idle Hrs YTD",val:th(ytdIdl),sub:`${ytdTot>0?Math.round((ytdIdl/ytdTot)*100):0}% of total`},
                  {bg:"#faf5ff",c:"#9333ea",label:"Total Invention Hrs YTD",val:th(ytdIno),sub:`${ytdTot>0?Math.round((ytdIno/ytdTot)*100):0}% of total`},
                ].map(({bg,c,label,val,sub})=>(
                  <div key={label} style={{ background:bg, borderRadius:8, padding:"12px 16px", textAlign:"center" as const }}>
                    <div style={{ fontSize:11, fontWeight:600, color:c, marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:22, fontWeight:900, color:c }}>{val}</div>
                    <div style={{ fontSize:10, color:c, marginTop:2, opacity:0.8 }}>{sub}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>
                {/* DOD */}
                <div style={{ flex:2, background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#2563eb", padding:"8px 14px" }}>
                    <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>DOD</span>
                    <div style={{ display:"flex", gap:6 }}>
                      <button style={{ ...dbNavBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={()=>setDodOffset(x=>x-1)}>‹</button>
                      <button style={{ ...dbNavBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={()=>setDodOffset(x=>Math.min(x+1,0))} disabled={dodOffset===0}>›</button>
                    </div>
                  </div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead><tr style={{ background:"#2563eb" }}><th style={aTh}>Attributes</th>{dodDates.map(d=><th key={d} style={thS}>{fmtD(d)}</th>)}</tr></thead>
                      <tbody>
                        <tr><td style={aC}>Total HC</td>{dodStats.map((s,i)=><td key={i} style={cS}>{s.users}</td>)}</tr>
                        <tr><td style={{ ...aC, background:"#eff6ff", color:"#1e40af" }}>Available Hrs.</td>{dodStats.map((s,i)=><td key={i} style={{ ...cS, background:"#f8fbff", fontWeight:600 }}>{s.availableHrs}</td>)}</tr>
                        <tr><td style={aC}>Total Working Hrs.</td>{dodStats.map((s,i)=><td key={i} style={cS}>{s.totalHrs}</td>)}</tr>
                        <tr><td style={aC}>Direct Hrs.</td>{dodStats.map((s,i)=><td key={i} style={cS}>{s.directHrs}</td>)}</tr>
                        <tr><td style={aC}>In-Direct Hrs.</td>{dodStats.map((s,i)=><td key={i} style={cS}>{s.indirectHrs}</td>)}</tr>
                        <tr><td style={aC}>Idle Hrs.</td>{dodStats.map((s,i)=><td key={i} style={cS}>{s.idleHrs}</td>)}</tr>
                        <tr><td style={aC}>Invention hrs</td>{dodStats.map((s,i)=><td key={i} style={cS}>{s.innovationHrs}</td>)}</tr>
                        <tr style={{ background:"#f0f4ff" }}><td colSpan={9} style={{ height:8, padding:0, borderBottom:`1px solid ${DB_BORDER}` }} /></tr>
                        <tr><td style={{ ...aC, background:"#fff7ed", color:"#c2410c" }}>OT Hrs.</td>{dodStats.map((s,i)=>{ const h=parseFloat(s.otHrs)>0; return <td key={i} style={{ ...cS, background:h?"#fee2e2":"transparent", color:h?"#991b1b":"#94a3b8", fontWeight:h?700:400 }}>{h?`+${s.otHrs}`:"—"}</td>; })}<td style={{ ...tC, background:"#fff7ed", color:"#c2410c", fontSize:9 }}>Excess</td></tr>
                        <tr><td style={{ ...aC, background:"#faf5ff", color:"#7e22ce" }}>Unknown</td>{dodStats.map((s,i)=>{ const h=parseFloat(s.unknownHrs)>0; return <td key={i} style={{ ...cS, background:h?"#faf5ff":"transparent", color:h?"#7e22ce":"#94a3b8", fontWeight:h?700:400 }}>{h?`-${s.unknownHrs}`:"—"}</td>; })}<td style={{ ...tC, background:"#faf5ff", color:"#7e22ce", fontSize:9 }}>Shortfall</td></tr>
                        <tr style={{ background:"#f0f4ff" }}><td colSpan={9} style={{ height:8, padding:0, borderBottom:`1px solid ${DB_BORDER}` }} /></tr>
                        <tr><td style={aC}>Direct Hrs.</td>{dodStats.map((s,i)=><td key={i} style={{ ...cS, background:pctBg(s.directPct,T_DIR), color:pctFg(s.directPct,T_DIR), fontWeight:700 }}>{s.directPct}%</td>)}<td style={tC}>Target<br/>{T_DIR}%</td></tr>
                        <tr><td style={aC}>In-Direct Hrs.</td>{dodStats.map((s,i)=><td key={i} style={{ ...cS, background:pctBg(s.indirectPct,T_IND,true), color:pctFg(s.indirectPct,T_IND,true), fontWeight:700 }}>{s.indirectPct}%</td>)}<td style={tC}>{T_IND}%</td></tr>
                        <tr><td style={aC}>Idle Hrs.</td>{dodStats.map((s,i)=><td key={i} style={{ ...cS, background:pctBg(s.idlePct,T_IDL,true), color:pctFg(s.idlePct,T_IDL,true), fontWeight:700 }}>{s.idlePct}%</td>)}<td style={tC}>{T_IDL}%</td></tr>
                        <tr><td style={aC}>Invention hrs</td>{dodStats.map((s,i)=><td key={i} style={{ ...cS, background:pctBg(s.innovationPct,T_INO,true), color:pctFg(s.innovationPct,T_INO,true), fontWeight:700 }}>{s.innovationPct}%</td>)}<td style={tC}>{T_INO}%</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                {/* WOW */}
                <div style={{ flex:1, background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#0f766e", padding:"8px 14px" }}>
                    <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>WOW</span>
                    <div style={{ display:"flex", gap:6 }}>
                      <button style={{ ...dbNavBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={()=>setWowOffset(x=>x-1)}>‹</button>
                      <button style={{ ...dbNavBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={()=>setWowOffset(x=>Math.min(x+1,0))} disabled={wowOffset===0}>›</button>
                    </div>
                  </div>
                  <div style={{ overflowX:"auto" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                      <thead><tr style={{ background:"#0f766e" }}><th style={{ ...aTh, background:"#0f766e" }}>Attributes</th>{wowWeeks.map(w=><th key={w} title={wkRange(w)} style={{ ...thS, background:"#0f766e" }}>{wkLabel(w)}</th>)}</tr></thead>
                      <tbody>
                        <tr><td style={aC}>Total HC</td>{wowStats.map((s,i)=><td key={i} style={cS}>{s.users}</td>)}</tr>
                        <tr><td style={{ ...aC, background:"#eff6ff", color:"#1e40af" }}>Available Hrs.</td>{wowStats.map((s,i)=><td key={i} style={{ ...cS, background:"#f8fbff", fontWeight:600 }}>{s.availableHrs}</td>)}</tr>
                        <tr><td style={aC}>Total Working Hrs.</td>{wowStats.map((s,i)=><td key={i} style={cS}>{s.totalHrs}</td>)}</tr>
                        <tr><td style={aC}>Direct Hrs.</td>{wowStats.map((s,i)=><td key={i} style={cS}>{s.directHrs}</td>)}</tr>
                        <tr><td style={aC}>In-Direct Hrs.</td>{wowStats.map((s,i)=><td key={i} style={cS}>{s.indirectHrs}</td>)}</tr>
                        <tr><td style={aC}>Idle Hrs.</td>{wowStats.map((s,i)=><td key={i} style={cS}>{s.idleHrs}</td>)}</tr>
                        <tr><td style={aC}>Invention hrs</td>{wowStats.map((s,i)=><td key={i} style={cS}>{s.innovationHrs}</td>)}</tr>
                        <tr style={{ background:"#f0f4ff" }}><td colSpan={5} style={{ height:8, padding:0, borderBottom:`1px solid ${DB_BORDER}` }} /></tr>
                        <tr><td style={{ ...aC, background:"#fff7ed", color:"#c2410c" }}>OT Hrs.</td>{wowStats.map((s,i)=>{ const h=parseFloat(s.otHrs)>0; return <td key={i} style={{ ...cS, background:h?"#fee2e2":"transparent", color:h?"#991b1b":"#94a3b8", fontWeight:h?700:400 }}>{h?`+${s.otHrs}`:"—"}</td>; })}</tr>
                        <tr><td style={{ ...aC, background:"#faf5ff", color:"#7e22ce" }}>Unknown</td>{wowStats.map((s,i)=>{ const h=parseFloat(s.unknownHrs)>0; return <td key={i} style={{ ...cS, background:h?"#faf5ff":"transparent", color:h?"#7e22ce":"#94a3b8", fontWeight:h?700:400 }}>{h?`-${s.unknownHrs}`:"—"}</td>; })}</tr>
                        <tr style={{ background:"#f0f4ff" }}><td colSpan={5} style={{ height:8, padding:0, borderBottom:`1px solid ${DB_BORDER}` }} /></tr>
                        <tr><td style={aC}>Direct Hrs.</td>{wowStats.map((s,i)=><td key={i} style={{ ...cS, background:pctBg(s.directPct,T_DIR), color:pctFg(s.directPct,T_DIR), fontWeight:700 }}>{s.directPct}%</td>)}</tr>
                        <tr><td style={aC}>In-Direct Hrs.</td>{wowStats.map((s,i)=><td key={i} style={{ ...cS, background:pctBg(s.indirectPct,T_IND,true), color:pctFg(s.indirectPct,T_IND,true), fontWeight:700 }}>{s.indirectPct}%</td>)}</tr>
                        <tr><td style={aC}>Idle Hrs.</td>{wowStats.map((s,i)=><td key={i} style={{ ...cS, background:pctBg(s.idlePct,T_IDL,true), color:pctFg(s.idlePct,T_IDL,true), fontWeight:700 }}>{s.idlePct}%</td>)}</tr>
                        <tr><td style={aC}>Invention hrs</td>{wowStats.map((s,i)=><td key={i} style={{ ...cS, background:pctBg(s.innovationPct,T_INO,true), color:pctFg(s.innovationPct,T_INO,true), fontWeight:700 }}>{s.innovationPct}%</td>)}</tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              {/* Performers N-1 */}
              {(()=>{
                // N-1 = always last calendar week, fixed — not tied to WOW navigation
                const N1_OFFSET = -1;
                const n1Dates = dbWeekDates(N1_OFFSET);
                const n1Evts  = allEvents.filter((e)=>e.endTime&&n1Dates.includes(e.date)&&(bmMile==="ALL"||e.mile===bmMile));

                // ISO week number for N-1
                const n1WeekNum = (()=>{
                  const d    = new Date(n1Dates[0]+"T00:00:00");
                  const jan4 = new Date(d.getFullYear(),0,4);
                  const sow  = new Date(jan4); sow.setDate(jan4.getDate()-((jan4.getDay()+6)%7));
                  return Math.round((d.getTime()-sow.getTime())/(7*24*3600*1000))+1;
                })();
                const n1Label = `Wk ${n1WeekNum} (${n1Dates[0]} – ${n1Dates[6]})`;

                // No fallback — strictly N-1 week only
                const useEvts  = n1Evts;
                const useLabel = n1Label;

                if (useEvts.length === 0) return (
                  <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"20px", textAlign:"center" as const, color:DB_MUTED, fontSize:12 }}>
                    No data for N-1 · {n1Label}. Once associates clock time last week this section will populate.
                  </div>
                );

                const us=[...new Set(useEvts.map((e)=>e.login))].map((login)=>{
                  const ue=useEvts.filter((e)=>e.login===login);
                  const tot=ue.reduce((a,e)=>a+dbEvtSecs(e),0);
                  const p=(s:number)=>tot>0?Math.round((s/tot)*100):0;
                  const directS   = ue.filter((e)=>e.functionType==="Direct").reduce((a,e)=>a+dbEvtSecs(e),0);
                  const indirectS = ue.filter((e)=>["In-Direct","Indirect","Break"].includes(e.functionType)||["Drills","Huddle","Handover","Learning","Rebuttals"].includes(e.scope)).reduce((a,e)=>a+dbEvtSecs(e),0);
                  const idleS     = ue.filter((e)=>e.functionType==="Idle"||e.scope==="Idle / No Task").reduce((a,e)=>a+dbEvtSecs(e),0);
                  return{ login, directPct:p(directS), indirectPct:p(indirectS), idlePct:p(idleS) };
                }).filter((u)=>u.directPct+u.indirectPct+u.idlePct > 0 || useEvts.some((e)=>e.login===u.login));
                // Need at least 1 user to show performers
                if(us.length < 1) return (
                  <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"20px", textAlign:"center" as const, color:DB_MUTED, fontSize:12 }}>
                    No activity data found for {useLabel}.
                  </div>
                );
                const topN=(arr:typeof us,key:keyof typeof us[0],asc:boolean,n=3)=>[...arr].sort((a,b)=>asc?(a[key] as number)-(b[key] as number):(b[key] as number)-(a[key] as number)).slice(0,n);
                type CD={key:keyof typeof us[0];label:string;topC:string;botC:string;topBg:string};
                const cols:CD[]=[{key:"directPct",label:"Direct",topC:"#166534",botC:"#991b1b",topBg:"#dcfce7"},{key:"indirectPct",label:"In-Direct",topC:"#1e40af",botC:"#92400e",topBg:"#dbeafe"},{key:"idlePct",label:"Idle",topC:"#374151",botC:"#991b1b",topBg:"#f1f5f9"}];
                const PCard=({emoji,users,col,borderColor,bg}:{emoji:string;users:typeof us;col:CD;borderColor:string;bg:string})=>(
                  <div style={{ flex:1, background:bg, border:`1.5px solid ${borderColor}`, borderRadius:10, padding:"12px 14px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:borderColor, marginBottom:8 }}>{emoji} {col.label}</div>
                    {users.map((u,i)=>(
                      <div key={u.login} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                        <div style={{ width:20, height:20, borderRadius:"50%", background:borderColor, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"#fff", flexShrink:0 }}>{i+1}</div>
                        <div style={{ flex:1, fontSize:12, fontWeight:600, color:DB_TEXT }}>{u.login}</div>
                        <div style={{ fontSize:13, fontWeight:800, color:borderColor }}>{u[col.key] as number}%</div>
                      </div>
                    ))}
                  </div>
                );
                return (
                  <div style={{ display:"flex", gap:14 }}>
                    <div style={{ flex:1, background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"16px 18px" }}>
                      <div style={{ fontSize:12, fontWeight:800, color:"#15803d", marginBottom:12 }}>🏆 Top Performers <span style={{ fontSize:10, color:DB_MUTED, fontWeight:400 }}>R&R · {useLabel}</span></div>
                      <div style={{ display:"flex", gap:10 }}>{cols.map((col)=><PCard key={col.key} emoji="🥇" users={topN(us,col.key,col.key==="directPct"?false:true)} col={col} borderColor={col.topC} bg={col.topBg} />)}</div>
                    </div>
                    <div style={{ flex:1, background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"16px 18px" }}>
                      <div style={{ fontSize:12, fontWeight:800, color:"#dc2626", marginBottom:12 }}>📋 Needs Coaching <span style={{ fontSize:10, color:DB_MUTED, fontWeight:400 }}>Bottom Performers · {useLabel}</span></div>
                      <div style={{ display:"flex", gap:10 }}>{cols.map((col)=><PCard key={col.key} emoji="⚠️" users={topN(us,col.key,col.key==="directPct"?true:false)} col={col} borderColor={col.botC} bg="#fff8f8" />)}</div>
                    </div>
                  </div>
                );
              })()}
            </>
          );
        })()}

        {/* ☕ BREAKS */}
        {tab==="breaks" && (()=>{
          const BREAK_TARGET_SECS = 30 * 60; // 30 min target
          const BREAK_TOLERANCE   = 5  * 60; // ±5 min grace

          // All break events in the filtered range
          const breakEvts = filteredEvents.filter((e)=>e.scope==="Break"&&e.endTime);

          // Per-user summary
          const breakUsers = allLogins.filter((l)=>completedFiltered.some((e)=>e.login===l)).map((login)=>{
            const ue  = completedFiltered.filter((e)=>e.login===login);
            const days= [...new Set(ue.map((e)=>e.date))].length;
            const userBreakEvts = breakEvts.filter((e)=>e.login===login);
            const breakSessions = userBreakEvts.length;
            const totalBreakS   = userBreakEvts.reduce((a,e)=>a+dbEvtSecs(e),0);
            const avgBreakPerDay= days>0?Math.round(totalBreakS/days):0;
            const avgPerSession = breakSessions>0?Math.round(totalBreakS/breakSessions):0;
            const status = avgBreakPerDay===0?"none"
              : avgBreakPerDay < BREAK_TARGET_SECS - BREAK_TOLERANCE ? "short"
              : avgBreakPerDay > BREAK_TARGET_SECS + BREAK_TOLERANCE ? "over"
              : "ok";
            return { login, days, breakSessions, totalBreakS, avgBreakPerDay, avgPerSession, status };
          });

          const onTarget = breakUsers.filter((u)=>u.status==="ok").length;
          const short    = breakUsers.filter((u)=>u.status==="short").length;
          const over     = breakUsers.filter((u)=>u.status==="over").length;
          const noBreak  = breakUsers.filter((u)=>u.status==="none").length;

          const bgMap   :Record<string,string>={ok:"#f0fdf4",short:"#fff7ed",over:"#eff6ff",none:"#f8fafc"};
          const colorMap:Record<string,string>={ok:"#166534",short:"#c2410c",over:"#1d4ed8",none:"#94a3b8"};
          const labelMap:Record<string,string>={ok:"✓ On Target",short:"↓ Less than 25m",over:"↑ More than 35m",none:"— No Break"};

          // Export break log
          const exportBreakLog = () => {
            const headers=["Date","Login","Mile","Shift","Break Start","Break End","Duration (sec)","Duration (min)"];
            const rows=breakEvts.map((e)=>[
              e.date, e.login, e.mile, e.shiftCode,
              e.startTime?new Date(e.startTime).toLocaleString():"",
              e.endTime?new Date(e.endTime).toLocaleString():"",
              dbEvtSecs(e), Math.round(dbEvtSecs(e)/60)
            ]);
            const csv=[headers,...rows].map((r)=>r.map((v)=>`"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
            const url=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
            const a=document.createElement("a"); a.href=url; a.download=`TEMPO_BreakLog_${filterFrom}_${filterTo}.csv`; a.click(); URL.revokeObjectURL(url);
          };

          return (
            <>
              {/* Filters */}
              <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"14px 20px", display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" as const }}>
                {[ {label:"Mile",el:<select style={dbSel} value={filterMile} onChange={(e)=>setFilterMile(e.target.value)}><option value="ALL">All Miles</option>{MILES.map(m=><option key={m}>{m}</option>)}</select>}, {label:"From",el:<input type="date" style={dbSel} value={filterFrom} onChange={(e)=>setFilterFrom(e.target.value)} />}, {label:"To",el:<input type="date" style={dbSel} value={filterTo} onChange={(e)=>setFilterTo(e.target.value)} />}, {label:"Login",el:<input style={dbSel} placeholder="All users" value={filterLogin} onChange={(e)=>setFilterLogin(e.target.value)} />} ].map(({label,el})=>(
                  <div key={label}><div style={{ fontSize:10, fontWeight:700, color:DB_MUTED, letterSpacing:1, marginBottom:4, textTransform:"uppercase" as const }}>{label}</div>{el}</div>
                ))}
                <div style={{ marginLeft:"auto", alignSelf:"flex-end" as const }}>
                  <button onClick={exportBreakLog} style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:12, fontWeight:700, cursor:"pointer" }}>📊 Export Break Log</button>
                </div>
              </div>

              {/* Summary stat cards */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:12 }}>
                {[
                  {label:"Total Break Sessions",val:String(breakEvts.length),color:"#2563eb"},
                  {label:"✓ On Target",val:String(onTarget),color:"#166534"},
                  {label:"↓ Less than 25m",val:String(short),color:"#c2410c"},
                  {label:"↑ More than 35m",val:String(over),color:"#1d4ed8"},
                  {label:"— No Break",val:String(noBreak),color:"#94a3b8"},
                ].map(({label,val,color})=>(
                  <div key={label} style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:10, padding:"14px 16px", borderLeft:`4px solid ${color}` }}>
                    <div style={{ fontSize:10, color:DB_MUTED, fontWeight:600, letterSpacing:1, textTransform:"uppercase" as const, marginBottom:4 }}>{label}</div>
                    <div style={{ fontSize:26, fontWeight:900, color }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Per-user adherence summary */}
              <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"16px 22px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:DB_TEXT }}>☕ Break Adherence Summary</div>
                  <span style={{ fontSize:11, color:DB_MUTED }}>Target: 30 min/day · ±5 min tolerance</span>
                  <div style={{ marginLeft:"auto", display:"flex", gap:14, fontSize:10 }}>
                    <span style={{ color:"#166534" }}>✓ 25–35 min avg</span>
                    <span style={{ color:"#c2410c" }}>↓ &lt;25 min avg</span>
                    <span style={{ color:"#1d4ed8" }}>↑ &gt;35 min avg</span>
                    <span style={{ color:"#94a3b8" }}>— No break recorded</span>
                  </div>
                </div>
                {breakUsers.length===0
                  ? <div style={{ color:DB_MUTED, fontSize:12 }}>No data for selected range</div>
                  : <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ background:"#f8f9ff" }}>
                        {["Login","Active Days","Break Sessions","Total Break","Avg/Day","Avg/Session","Status","Adherence Bar"].map(h=>(
                          <th key={h} style={{ padding:"7px 10px", fontWeight:700, fontSize:10, color:DB_MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${DB_BORDER}`, textAlign:"left" as const, whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...breakUsers].sort((a,b)=>{
                        const order={ok:0,short:1,over:2,none:3};
                        return order[a.status as keyof typeof order]-order[b.status as keyof typeof order] || b.avgBreakPerDay-a.avgBreakPerDay;
                      }).map((u)=>{
                        const barPct=Math.min(100,Math.round((u.avgBreakPerDay/(45*60))*100));
                        const targetPct=Math.round((BREAK_TARGET_SECS/(45*60))*100); // 67%
                        return (
                          <tr key={u.login} style={{ background:bgMap[u.status], borderBottom:`1px solid #f0f4ff` }}>
                            <td style={{ ...dbTd, fontWeight:700, color:DB_ACCENT }}>{u.login}</td>
                            <td style={dbTd}>{u.days}</td>
                            <td style={dbTd}>{u.breakSessions}</td>
                            <td style={dbTd}>{u.totalBreakS>0?formatDuration(u.totalBreakS):"—"}</td>
                            <td style={{ ...dbTd, fontWeight:700, color:colorMap[u.status] }}>{u.avgBreakPerDay>0?formatDuration(u.avgBreakPerDay):"—"}</td>
                            <td style={dbTd}>{u.avgPerSession>0?formatDuration(u.avgPerSession):"—"}</td>
                            <td style={dbTd}>
                              <span style={{ background:colorMap[u.status]+"22", color:colorMap[u.status], borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" as const }}>
                                {labelMap[u.status]}
                              </span>
                            </td>
                            <td style={{ ...dbTd, minWidth:160 }}>
                              <div style={{ position:"relative" as const, height:10, background:"#e8eaf0", borderRadius:5 }}>
                                <div style={{ height:"100%", width:`${barPct}%`, background:colorMap[u.status], borderRadius:5, transition:"width 0.5s" }} />
                                {/* 30 min target line */}
                                <div style={{ position:"absolute" as const, top:0, bottom:0, left:`${targetPct}%`, width:2, background:"#374151", borderRadius:1 }} title="30 min target" />
                              </div>
                              <div style={{ fontSize:9, color:DB_MUTED, marginTop:2 }}>{Math.round(u.avgBreakPerDay/60)}m avg/day</div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                }
              </div>

              {/* Mile-wise Break Compliance — DOD & WOW */}
              {(() => {
                // compliance% = users with on-target break / total active users on that date·mile
                const getMileBreakStats = (dates: string[]) => {
                  const activeMiles = filterMile === "ALL" ? MILES : [filterMile];
                  return activeMiles.map((mile) => {
                    const dateStats = dates.map((date) => {
                      const dayEvts   = allEvents.filter((e) => e.endTime && e.date === date && e.mile === mile);
                      const users     = [...new Set(dayEvts.map((e) => e.login))];
                      if (!users.length) return null;
                      const onT = users.filter((login) => {
                        const breakS = dayEvts.filter((e) => e.login === login && e.scope === "Break").reduce((a, e) => a + dbEvtSecs(e), 0);
                        return breakS >= BREAK_TARGET_SECS - BREAK_TOLERANCE && breakS <= BREAK_TARGET_SECS + BREAK_TOLERANCE;
                      }).length;
                      const compliance = Math.round((onT / users.length) * 100);
                      return { users: users.length, onTarget: onT, compliance };
                    });
                    return { mile, dateStats };
                  }).filter((ms) => ms.dateStats.some((d) => d !== null));
                };

                const dodDates   = Array.from({ length: 7 }, (_, i) => dbDayStr(dodOffset - i));
                const wowWeeksB  = [wowOffset, wowOffset - 1, wowOffset - 2];
                const wkLabelB   = (w: number) => {
                  const d   = new Date(dbWeekDates(w)[0] + "T00:00:00");
                  const jan4 = new Date(d.getFullYear(), 0, 4);
                  const sow  = new Date(jan4); sow.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
                  return `Wk ${Math.round((d.getTime() - sow.getTime()) / (7 * 24 * 3600 * 1000)) + 1}`;
                };
                const fmtD       = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });

                const getMileBreakWeek = (weeks: number[]) => {
                  const activeMiles = filterMile === "ALL" ? MILES : [filterMile];
                  return activeMiles.map((mile) => {
                    const wkStats = weeks.map((w) => {
                      const dates   = dbWeekDates(w);
                      const wkEvts  = allEvents.filter((e) => e.endTime && dates.includes(e.date) && e.mile === mile);
                      const users   = [...new Set(wkEvts.map((e) => e.login))];
                      if (!users.length) return null;
                      const onT = users.filter((login) => {
                        const userDays = [...new Set(wkEvts.filter((e) => e.login === login).map((e) => e.date))].length;
                        const breakS  = wkEvts.filter((e) => e.login === login && e.scope === "Break").reduce((a, e) => a + dbEvtSecs(e), 0);
                        const avgDay  = userDays > 0 ? breakS / userDays : 0;
                        return avgDay >= BREAK_TARGET_SECS - BREAK_TOLERANCE && avgDay <= BREAK_TARGET_SECS + BREAK_TOLERANCE;
                      }).length;
                      return { users: users.length, onTarget: onT, compliance: Math.round((onT / users.length) * 100) };
                    });
                    return { mile, wkStats };
                  }).filter((ms) => ms.wkStats.some((w) => w !== null));
                };

                const dodMiles = getMileBreakStats(dodDates);
                const wowMiles = getMileBreakWeek(wowWeeksB);

                if (!dodMiles.length && !wowMiles.length) return null;

                const complianceBg = (pct: number) =>
                  pct === 0 ? "transparent" : pct >= 80 ? "#dcfce7" : pct >= 50 ? "#fef9c3" : "#fee2e2";
                const complianceFg = (pct: number) =>
                  pct === 0 ? DB_MUTED : pct >= 80 ? "#166534" : pct >= 50 ? "#92400e" : "#991b1b";

                const thCom: React.CSSProperties = { padding:"6px 10px", fontSize:11, fontWeight:700, color:"#fff", textAlign:"center" as const, whiteSpace:"nowrap" as const, borderRight:"1px solid rgba(255,255,255,0.2)" };
                const aTh2: React.CSSProperties  = { padding:"6px 10px", fontSize:11, fontWeight:700, color:"#fff", textAlign:"left" as const, background:"#d97706", borderRight:"1px solid rgba(255,255,255,0.2)", minWidth:80 };
                const cS2: React.CSSProperties   = { padding:"5px 10px", fontSize:11, textAlign:"center" as const, borderRight:`1px solid ${DB_BORDER}`, borderBottom:`1px solid ${DB_BORDER}`, color:DB_TEXT, fontWeight:700 };
                const aC2: React.CSSProperties   = { padding:"5px 10px", fontSize:11, fontWeight:700, color:"#92400e", borderRight:`1px solid ${DB_BORDER}`, borderBottom:`1px solid ${DB_BORDER}`, background:"#fffbeb" };

                return (
                  <div style={{ display:"flex", gap:16, alignItems:"flex-start" }}>

                    {/* DOD compliance */}
                    <div style={{ flex:2, background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#d97706", padding:"8px 14px" }}>
                        <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>☕ Break Compliance — DOD</span>
                        <div style={{ display:"flex", gap:6 }}>
                          <button style={{ ...dbNavBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={() => setDodOffset(x => x - 1)}>‹</button>
                          <button style={{ ...dbNavBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={() => setDodOffset(x => Math.min(x + 1, 0))} disabled={dodOffset === 0}>›</button>
                        </div>
                      </div>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead>
                            <tr style={{ background:"#d97706" }}>
                              <th style={aTh2}>Mile</th>
                              {dodDates.map(d => <th key={d} style={{ ...thCom, background:"#d97706" }}>{fmtD(d)}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {dodMiles.length === 0
                              ? <tr><td colSpan={8} style={{ padding:"16px", textAlign:"center", color:DB_MUTED, fontSize:12 }}>No data</td></tr>
                              : dodMiles.map(({ mile, dateStats }) => (
                                <tr key={mile}>
                                  <td style={aC2}>{mile}</td>
                                  {dateStats.map((s, i) => (
                                    <td key={i} style={{ ...cS2, background: s ? complianceBg(s.compliance) : "transparent", color: s ? complianceFg(s.compliance) : DB_MUTED }}>
                                      {s ? `${s.compliance}%` : "—"}
                                      {s && <div style={{ fontSize:9, fontWeight:400, color:DB_MUTED }}>{s.onTarget}/{s.users}</div>}
                                    </td>
                                  ))}
                                </tr>
                              ))
                            }
                          </tbody>
                        </table>
                      </div>
                      <div style={{ padding:"6px 14px", fontSize:10, color:DB_MUTED, borderTop:`1px solid ${DB_BORDER}` }}>
                        🟢 ≥80% compliant &nbsp; 🟡 50–79% &nbsp; 🔴 &lt;50% &nbsp; · Compliance = users with avg break 25–35 min that day
                      </div>
                    </div>

                    {/* WOW compliance */}
                    <div style={{ flex:1, background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", background:"#92400e", padding:"8px 14px" }}>
                        <span style={{ color:"#fff", fontSize:13, fontWeight:800 }}>☕ Break Compliance — WOW</span>
                        <div style={{ display:"flex", gap:6 }}>
                          <button style={{ ...dbNavBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={() => setWowOffset(x => x - 1)}>‹</button>
                          <button style={{ ...dbNavBtn, background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid rgba(255,255,255,0.3)" }} onClick={() => setWowOffset(x => Math.min(x + 1, 0))} disabled={wowOffset === 0}>›</button>
                        </div>
                      </div>
                      <div style={{ overflowX:"auto" }}>
                        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                          <thead>
                            <tr style={{ background:"#92400e" }}>
                              <th style={{ ...aTh2, background:"#92400e" }}>Mile</th>
                              {wowWeeksB.map(w => <th key={w} style={{ ...thCom, background:"#92400e" }}>{wkLabelB(w)}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {wowMiles.length === 0
                              ? <tr><td colSpan={4} style={{ padding:"16px", textAlign:"center", color:DB_MUTED, fontSize:12 }}>No data</td></tr>
                              : wowMiles.map(({ mile, wkStats }) => (
                                <tr key={mile}>
                                  <td style={aC2}>{mile}</td>
                                  {wkStats.map((s, i) => (
                                    <td key={i} style={{ ...cS2, background: s ? complianceBg(s.compliance) : "transparent", color: s ? complianceFg(s.compliance) : DB_MUTED }}>
                                      {s ? `${s.compliance}%` : "—"}
                                      {s && <div style={{ fontSize:9, fontWeight:400, color:DB_MUTED }}>{s.onTarget}/{s.users}</div>}
                                    </td>
                                  ))}
                                </tr>
                              ))
                            }
                          </tbody>
                        </table>
                      </div>
                      <div style={{ padding:"6px 14px", fontSize:10, color:DB_MUTED, borderTop:`1px solid ${DB_BORDER}` }}>
                        Weekly avg break per user vs 30 min target
                      </div>
                    </div>

                  </div>
                );
              })()}

              {/* Detailed break log */}
              <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden" }}>
                <div style={{ position:"sticky", top:0, zIndex:10, background:DB_WHITE, borderBottom:`1px solid ${DB_BORDER}`, padding:"12px 20px", display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:DB_TEXT }}>Break Log</span>
                  <span style={{ background:"#eff6ff", color:DB_ACCENT, borderRadius:10, padding:"1px 8px", fontSize:11, fontWeight:600 }}>{breakEvts.length} sessions</span>
                  <span style={{ fontSize:11, color:DB_MUTED, marginLeft:4 }}>{filterFrom} → {filterTo}</span>
                </div>
                <div style={{ overflowX:"auto" }}>
                  <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                    <thead>
                      <tr style={{ background:"#f8f9ff" }}>
                        {["#","Date","Login","Mile","Shift","Break Start","Break End","Duration","vs Target"].map(h=>(
                          <th key={h} style={{ position:"sticky", top:0, background:"#f8f9ff", padding:"7px 10px", fontWeight:700, fontSize:10, color:DB_MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${DB_BORDER}`, textAlign:"left" as const, whiteSpace:"nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {breakEvts.length===0
                        ? <tr><td colSpan={9} style={{ padding:"24px", textAlign:"center", color:DB_MUTED }}>No break events in selected range</td></tr>
                        : [...breakEvts]
                          .sort((a,b)=>new Date(b.startTime).getTime()-new Date(a.startTime).getTime())
                          .map((e,idx)=>{
                            const sec=dbEvtSecs(e);
                            const diff=sec-BREAK_TARGET_SECS;
                            const diffLabel=diff===0?"= 30m":diff>0?`+${Math.round(diff/60)}m`:`${Math.round(diff/60)}m`;
                            const diffColor=Math.abs(diff)<=BREAK_TOLERANCE?"#166534":diff<0?"#c2410c":"#1d4ed8";
                            return (
                              <tr key={e.id} style={{ borderBottom:`1px solid #f0f4ff`, background:idx%2===0?"#fff":"#f8faff" }}>
                                <td style={{ ...dbTd, color:DB_MUTED, fontWeight:700 }}>{idx+1}</td>
                                <td style={dbTd}>{e.date}</td>
                                <td style={{ ...dbTd, fontWeight:700, color:DB_ACCENT }}>{e.login}</td>
                                <td style={dbTd}>{e.mile}</td>
                                <td style={dbTd}><span style={{ background:"#eff6ff", color:DB_ACCENT, borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{e.shiftCode}</span></td>
                                <td style={{ ...dbTd, fontVariantNumeric:"tabular-nums" }}>{e.startTime?formatTime(e.startTime):"—"}</td>
                                <td style={{ ...dbTd, fontVariantNumeric:"tabular-nums" }}>{e.endTime?formatTime(e.endTime):"—"}</td>
                                <td style={{ ...dbTd, fontWeight:600 }}>{sec?formatDuration(sec):"—"}</td>
                                <td style={dbTd}>
                                  <span style={{ background:diffColor+"22", color:diffColor, borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>
                                    {diffLabel}
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          );
        })()}

        {/* LIVE LOG */}
        {tab==="livelog" && (<>
          <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"14px 20px", display:"flex", gap:16, alignItems:"flex-end", flexWrap:"wrap" as const }}>
            {[ {label:"Mile",el:<select style={dbSel} value={filterMile} onChange={(e)=>setFilterMile(e.target.value)}><option value="ALL">All Miles</option>{MILES.map(m=><option key={m}>{m}</option>)}</select>}, {label:"From",el:<input type="date" style={dbSel} value={filterFrom} onChange={(e)=>setFilterFrom(e.target.value)} />}, {label:"To",el:<input type="date" style={dbSel} value={filterTo} onChange={(e)=>setFilterTo(e.target.value)} />}, {label:"Login",el:<input style={dbSel} placeholder="All users" value={filterLogin} onChange={(e)=>setFilterLogin(e.target.value)} />} ].map(({label,el})=>(
              <div key={label}><div style={{ fontSize:10, fontWeight:700, color:DB_MUTED, letterSpacing:1, marginBottom:4, textTransform:"uppercase" as const }}>{label}</div>{el}</div>
            ))}
            <button onClick={()=>dbExportCSV(filteredEvents,`TEMPO_Log_${filterFrom}_${filterTo}.csv`)} style={{ background:"#16a34a", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:12, fontWeight:700, cursor:"pointer", alignSelf:"flex-end" as const }}>📊 Export CSV</button>
          </div>
          <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, overflow:"hidden", display:"flex", flexDirection:"column" as const }}>
            {/* Sticky heading */}
            <div style={{ flexShrink:0, background:DB_WHITE, borderBottom:`1px solid ${DB_BORDER}`, padding:"12px 20px", display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:13, fontWeight:700, color:DB_TEXT }}>Live Log</span>
              <span style={{ background:"#eff6ff", color:DB_ACCENT, borderRadius:10, padding:"1px 8px", fontSize:11, fontWeight:600 }}>{filteredEvents.length} events</span>
            </div>
            {/* Scrollable table */}
            <div style={{ overflowX:"auto", overflowY:"auto", maxHeight:"calc(100vh - 320px)" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#f8f9ff" }}>
                    {["Date","Login","Mile","Shift","Scope","Type","In","Out","Duration","Note"].map((h)=>(
                      <th key={h} style={{ position:"sticky", top:0, zIndex:5, background:"#f8f9ff", padding:"7px 10px", fontWeight:700, fontSize:10, color:DB_MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${DB_BORDER}`, textAlign:"left" as const, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.length===0 ? <tr><td colSpan={10} style={{ padding:"24px", textAlign:"center", color:DB_MUTED }}>No events</td></tr>
                  : filteredEvents.slice(0,300).map((e)=>{
                    const sec=dbEvtSecs(e), ft=e.functionType==="Indirect"||e.functionType==="Break"?"In-Direct":e.functionType;
                    const ftC=ft==="Direct"?"#22c55e":ft==="In-Direct"?"#3b82f6":ft==="Idle"?"#94a3b8":ft==="OT"?"#dc2626":"#f59e0b";
                    return (
                      <tr key={e.id} style={{ borderBottom:`1px solid #f0f4ff` }}>
                        <td style={dbTd}>{e.date}</td><td style={{ ...dbTd, fontWeight:700, color:DB_ACCENT }}>{e.login}</td><td style={dbTd}>{e.mile}</td>
                        <td style={dbTd}><span style={{ background:"#eff6ff", color:DB_ACCENT, borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:700 }}>{e.shiftCode}</span></td>
                        <td style={dbTd}><DbScopeBadge scope={e.scope} /></td>
                        <td style={dbTd}><span style={{ background:ftC+"22", color:ftC, borderRadius:4, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{ft}</span></td>
                        <td style={{ ...dbTd, fontVariantNumeric:"tabular-nums" }}>{e.startTime?formatTime(e.startTime):"—"}</td>
                        <td style={{ ...dbTd, fontVariantNumeric:"tabular-nums" }}>{e.endTime?formatTime(e.endTime):"—"}</td>
                        <td style={{ ...dbTd, fontWeight:600 }}>{sec?formatDuration(sec):"—"}</td>
                        <td style={{ ...dbTd, color:DB_MUTED, maxWidth:140, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" as const }}>{e.note||""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>)}

        {/* PERFORMANCE */}
        {tab==="performance" && <PerformanceTab allEvents={allEvents} />}

        {/* MANAGERS */}
        {tab==="managers" && role==="owner" && (
          <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"22px 24px" }}>
            <div style={{ fontSize:13, fontWeight:700, color:DB_TEXT, marginBottom:4 }}>Manager Access Control</div>
            <div style={{ fontSize:12, color:DB_MUTED, marginBottom:16 }}>Owner: <span style={{ color:"#f59e0b", fontWeight:700 }}>{OWNER}</span> &nbsp;·&nbsp; Add manager logins with a password.</div>
            <div style={{ background:"#f8f9ff", border:`1px solid ${DB_BORDER}`, borderRadius:10, padding:"14px 16px", marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:600, color:DB_TEXT, marginBottom:10 }}>Add New Manager</div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" as const }}>
                <div style={{ flex:1, minWidth:120 }}>
                  <div style={{ fontSize:10, color:DB_MUTED, marginBottom:3 }}>ALIAS</div>
                  <input style={dbSel} placeholder="Amazon alias" value={newAlias} onChange={(e)=>{ setNewAlias(e.target.value); setNewPassErr(""); }} />
                </div>
                <div style={{ flex:1, minWidth:120 }}>
                  <div style={{ fontSize:10, color:DB_MUTED, marginBottom:3 }}>PASSWORD</div>
                  <input type="password" style={dbSel} placeholder="Set a password" value={newPass} onChange={(e)=>{ setNewPass(e.target.value); setNewPassErr(""); }} onKeyDown={(e)=>e.key==="Enter"&&handleAddMgr()} />
                </div>
                <div style={{ alignSelf:"flex-end" as const }}><button onClick={handleAddMgr} style={{ background:"#2563eb", color:"#fff", border:"none", borderRadius:8, padding:"8px 18px", fontSize:12, fontWeight:700, cursor:"pointer" }}>Add Manager</button></div>
              </div>
              {newPassErr && <div style={{ fontSize:11, color:"#ef4444", marginTop:6 }}>⚠ {newPassErr}</div>}
            </div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead><tr style={{ background:"#f8f9ff" }}>{["Alias","Role","Action"].map(h=><th key={h} style={{ padding:"7px 12px", fontWeight:700, fontSize:10, color:DB_MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${DB_BORDER}`, textAlign:"left" as const }}>{h}</th>)}</tr></thead>
              <tbody>
                <tr style={{ borderBottom:`1px solid #f0f4ff` }}>
                  <td style={{ ...dbTd, fontWeight:700, color:DB_ACCENT }}>{OWNER}</td>
                  <td style={dbTd}><span style={{ background:"#fef9c3", color:"#854d0e", borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>OWNER</span></td>
                  <td style={dbTd}><span style={{ fontSize:10, color:DB_MUTED }}>Protected</span></td>
                </tr>
                {mgrs.map((cred)=>(
                  <tr key={cred.login} style={{ borderBottom:`1px solid #f0f4ff` }}>
                    <td style={{ ...dbTd, fontWeight:700, color:DB_ACCENT }}>{cred.login}</td>
                    <td style={dbTd}><span style={{ background:"#eff6ff", color:DB_ACCENT, borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700 }}>MANAGER</span></td>
                    <td style={dbTd}><button onClick={()=>handleRemoveMgr(cred.login)} style={{ background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca", borderRadius:6, padding:"3px 10px", fontSize:11, fontWeight:600, cursor:"pointer" }}>Remove</button></td>
                  </tr>
                ))}
                {mgrs.length===0 && <tr><td colSpan={3} style={{ padding:"16px", textAlign:"center", color:DB_MUTED, fontSize:12 }}>No managers added yet</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        {tab==="managers" && role==="manager" && (
          <div style={{ background:DB_WHITE, border:`1px solid ${DB_BORDER}`, borderRadius:12, padding:"22px 24px", textAlign:"center" as const }}>
            <div style={{ fontSize:32, marginBottom:8 }}>🔒</div>
            <div style={{ fontSize:14, fontWeight:700, color:DB_TEXT }}>Owner Access Only</div>
            <div style={{ fontSize:12, color:DB_MUTED, marginTop:4 }}>Only prdmano can manage manager accounts.</div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ background:DB_WHITE, borderTop:`1px solid ${DB_BORDER}`, padding:"8px 24px", display:"flex", justifyContent:"space-between", fontSize:10, color:DB_MUTED, flexShrink:0 }}>
        <span>iCMRS · Created by prdmano</span>
        <span>TEMPO Dashboard · {today}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
type ToolState = "idle" | "clocked_in" | "on_break" | "on_drill" | "on_huddle" | "clocked_out";

export default function TempoFrame() {
  // ── Auth — Midway (Amazon internal) ──
  const [currentUser, setCurrentUser] = useState<string>(() => getStoredUser());
  // Show embedded dashboard instead of tool
  const [showDashboard, setShowDashboard] = useState(false);
  const isManagerUser = !!currentUser && (
    currentUser === OWNER || getManagerCreds().some((c) => c.login === currentUser)
  );

  const [authState, setAuthState]     = useState<"login" | "ready">(
    () => (getStoredUser() ? "ready" : "login")
  );
  const [aliasInput, setAliasInput] = useState("");
  const [aliasError, setAliasError] = useState("");

  const handleMidwayLogin = () => {
    const a = aliasInput.trim().toLowerCase().replace(/\s+/g, "");
    if (!a) { setAliasError("Enter your Amazon alias (e.g. prdmano)"); return; }
    // Basic Amazon alias validation: 3–20 alphanumeric chars
    if (!/^[a-z0-9]{2,20}$/.test(a)) {
      setAliasError("Enter a valid Amazon alias (letters and numbers only)");
      return;
    }
    setStoredUser(a);
    setCurrentUser(a);
    setAuthState("ready");
  };

  // ── Core state ──
  const [toolState,     setToolState]     = useState<ToolState>("idle");
  // Shift is loaded from daily lock on mount — once confirmed it cannot change for the day
  const [selectedShift, setSelectedShift] = useState<ShiftKey | "">(() => getDailyShift(getStoredUser()) as ShiftKey | "");
  const [selectedMile,  setSelectedMile]  = useState<string>(MILES[0]);
  const [selectedScope, setSelectedScope] = useState<string>(USER_SCOPES[0].value);
  const [shiftAvail,    setShiftAvail]    = useState(() => getShiftAvailability(SHIFTS));
  const [todayEvents,   setTodayEvents]   = useState<TimeEvent[]>([]);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);

  // True if a shift has been confirmed for today (locks the shift cards permanently)
  const shiftConfirmedToday = !!getDailyShift(currentUser);

  // ── Timer ──
  const [timerSecs, setTimerSecs] = useState(0);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const appOpenRef  = useRef<Date>(new Date());
  const idleIdRef   = useRef<string | null>(null);

  // ── Modals ──
  const [modal, setModal] = useState<null
    | { type: "scope_confirm" }
    | { type: "late_reason" }
    | { type: "ot_reason" }
    | { type: "lock_screen_return"; lockedSecs: number; prevScope: string }
    | { type: "lp_investigation"; eventId: string; date: string; mile: string }
  >(null);
  const [lateReason,        setLateReason]        = useState("");
  const [otReason,          setOtReason]          = useState("");
  const [otMinutes,         setOtMinutes]         = useState(0);
  const [lockReturnReason,  setLockReturnReason]  = useState("");
  const [lpInvCount,        setLpInvCount]        = useState("");
  const [lpInvValue,        setLpInvValue]        = useState("");
  const [lpInvCpp,          setLpInvCpp]          = useState("");
  // Scope active before lock — needed for resume
  const preLockScopeRef  = useRef<string>("");
  const lockIdleEventRef = useRef<string | null>(null); // id of the open "Lock Screen" event

  // ── Manual entry ──
  

  // ── Dev mode (hidden — triple-click iCMRS logo to reveal Clear Today) ──
  const [devMode,       setDevMode]       = useState(false);
  const [devClickCount, setDevClickCount] = useState(0);

  // ── Export ──
  const [exportFrom, setExportFrom] = useState(getTodayStr());
  const [exportTo,   setExportTo]   = useState(getTodayStr());

  const today = getTodayStr();

  // ── Activity log date navigation (per-day history) ──
  const [viewDate, setViewDate] = useState(today);

  const isViewingToday = viewDate === today;

  const viewEvents = isViewingToday
    ? todayEvents
    : getEventsForDate(currentUser, viewDate);

  const refreshEvents = useCallback(() => {
    if (currentUser) setTodayEvents(getEventsForDate(currentUser, today));
  }, [currentUser, today]);

  useEffect(() => { refreshEvents(); }, [refreshEvents]);
  useEffect(() => {
    setShiftAvail(getShiftAvailability(SHIFTS));
    const t = setInterval(() => setShiftAvail(getShiftAvailability(SHIFTS)), 60000);
    return () => clearInterval(t);
  }, []);

  // ── recordIdleGapAfterClockOut ─────────────────────────────────────────────
  // Given a previous clock-out snapshot and a "now" time, records all idle
  // events that should cover the gap. Two cases:
  //
  //  A) Clock-out was BEFORE shift end:
  //       clock-out → shift-end  →  "Early Log Out" (Idle)
  //       shift-end → now        →  "Idle / No Task" (Idle, note: Between tasks)
  //                                 — only if now > shiftEnd and gap ≥ 60 s
  //
  //  B) Clock-out was AT or AFTER shift end (or shift = X):
  //       clock-out → now        →  "Idle / No Task" (Idle, note: Between tasks)
  //                                 — only if same day and gap ≥ 60 s
  //
  // Only records events for the SAME calendar date as the clock-out.
  // After recording, clears the persisted clock-out snapshot.
  // ──────────────────────────────────────────────────────────────────────────
  const recordIdleGapAfterClockOut = useCallback((
    lco: LastClockOut,
    nowISO: string,
  ) => {
    const clockOutTime = new Date(lco.time);
    const nowTime      = new Date(nowISO);
    const sh           = SHIFTS[lco.shiftCode as keyof typeof SHIFTS];

    // Helper: build a Date on the same calendar date as clockOutTime at HH:MM
    const sameDay = (hh: number, mm: number): Date => {
      const d = new Date(clockOutTime);
      d.setHours(hh, mm, 0, 0);
      return d;
    };

    let shiftEnd: Date | null = null;
    if (sh?.end) {
      const [eh, em] = sh.end.split(":").map(Number);
      shiftEnd = sameDay(eh, em);
      // Night shift (e.g. N: 22:00→06:00) — shift end is next calendar day
      if (shiftEnd <= clockOutTime) shiftEnd.setDate(shiftEnd.getDate() + 1);
    }

    const earlyLogOut =
      shiftEnd !== null &&
      clockOutTime < shiftEnd &&
      shiftEnd <= nowTime;       // shift end has already passed by now

    if (earlyLogOut && shiftEnd) {
      const earlyDur = Math.round((shiftEnd.getTime() - clockOutTime.getTime()) / 1000);
      if (earlyDur >= 60) {
        saveEvent({
          id: generateId(), date: lco.date, login: lco.login,
          mile: lco.mile, shiftCode: lco.shiftCode as import("./constants").ShiftKey,
          scope: "Early Log Out", functionType: "Idle",
          startTime: clockOutTime.toISOString(),
          endTime:   shiftEnd.toISOString(),
          duration:  earlyDur,
          note: "Early logout — not clocked back in",
        });
      }
      // Between-tasks gap: shift end → now (only on same date)
      const betweenStart = shiftEnd;
      const betweenDur   = Math.round((nowTime.getTime() - betweenStart.getTime()) / 1000);
      if (betweenDur >= 60 && nowTime.toISOString().slice(0, 10) === lco.date) {
        saveEvent({
          id: generateId(), date: lco.date, login: lco.login,
          mile: lco.mile, shiftCode: lco.shiftCode as import("./constants").ShiftKey,
          scope: "Idle / No Task", functionType: "Idle",
          startTime: betweenStart.toISOString(),
          endTime:   nowTime.toISOString(),
          duration:  betweenDur,
          note: "Between tasks",
        });
      }
    } else {
      // No early logout — just a straight between-tasks gap
      const betweenDur = Math.round((nowTime.getTime() - clockOutTime.getTime()) / 1000);
      if (betweenDur >= 60 && nowTime.toISOString().slice(0, 10) === lco.date) {
        saveEvent({
          id: generateId(), date: lco.date, login: lco.login,
          mile: lco.mile, shiftCode: lco.shiftCode as import("./constants").ShiftKey,
          scope: "Idle / No Task", functionType: "Idle",
          startTime: clockOutTime.toISOString(),
          endTime:   nowTime.toISOString(),
          duration:  betweenDur,
          note: "Between tasks",
        });
      }
    }
    clearLastClockOut();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── On mount: settle any dangling clock-out from a previous session ────────
  // If the user clocked out and then closed/refreshed the page without
  // clocking back in, record the idle gap now.
  useEffect(() => {
    if (!currentUser) return;
    const lco = getLastClockOut();
    if (!lco || lco.login !== currentUser) return;
    // Only settle for today — past days' gaps are left as-is (can't backfill reliably)
    if (lco.date !== getTodayStr()) { clearLastClockOut(); return; }
    recordIdleGapAfterClockOut(lco, new Date().toISOString());
    refreshEvents();
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Idle from app open ──
  useEffect(() => {
    if (!currentUser) return;
    idleIdRef.current = generateId();
  }, [currentUser]);

  // ── Win+L / Screen Lock detection ─────────────────────────────────────────
  // Win+L / Screen Lock detection
  // ──────────────────────────────────────────────────────────────────────────
  // Strategy: dual-method for maximum reliability on Windows
  //
  // METHOD 1 — visibilitychange (works when browser is the active window)
  //   hidden → visible with elapsed ≥ LOCK_THRESHOLD_SECS → screen lock
  //
  // METHOD 2 — Heartbeat (works even when browser is behind other windows)
  //   A setInterval writes Date.now() to localStorage every HEARTBEAT_INTERVAL_MS.
  //   On visibilitychange→visible OR window focus, we compare current time to
  //   the last heartbeat. If the gap > LOCK_THRESHOLD_SECS the heartbeat stopped
  //   → system was locked/suspended.
  //
  // Both methods call the same triggerLockDetected() handler.
  // A lockFiredRef prevents double-firing if both methods trigger together.
  // ──────────────────────────────────────────────────────────────────────────
  const LOCK_THRESHOLD_SECS    = 120;   // 2 min — filters out normal app switches
  const HEARTBEAT_INTERVAL_MS  = 20000; // write heartbeat every 20s
  const HEARTBEAT_KEY          = "tempo_heartbeat";

  const toolStateRef      = useRef<ToolState>(toolState);
  const currentEventIdRef = useRef(currentEventId);
  const currentUserRef    = useRef(currentUser);
  const selectedScopeRef  = useRef(selectedScope);
  const selectedMileRef   = useRef(selectedMile);
  const selectedShiftRef  = useRef(selectedShift);
  useEffect(() => { toolStateRef.current      = toolState;      }, [toolState]);
  useEffect(() => { currentEventIdRef.current = currentEventId; }, [currentEventId]);
  useEffect(() => { currentUserRef.current    = currentUser;    }, [currentUser]);
  useEffect(() => { selectedScopeRef.current  = selectedScope;  }, [selectedScope]);
  useEffect(() => { selectedMileRef.current   = selectedMile;   }, [selectedMile]);
  useEffect(() => { selectedShiftRef.current  = selectedShift;  }, [selectedShift]);

  const hiddenAtRef   = useRef<number | null>(null);
  const lockFiredRef  = useRef(false);  // prevents double-fire from both methods

  const triggerLockDetected = useCallback((elapsedSecs: number) => {
    if (lockFiredRef.current) return;
    lockFiredRef.current = true;
    setTimeout(() => { lockFiredRef.current = false; }, 3000); // reset after 3s

    const state = toolStateRef.current;
    const evtId = currentEventIdRef.current;
    const user  = currentUserRef.current;
    if (state !== "clocked_in" || !evtId || !user) return;

    const lockedAt = new Date(Date.now() - elapsedSecs * 1000);
    const scope    = selectedScopeRef.current;
    const mile     = selectedMileRef.current;
    const shift    = selectedShiftRef.current;
    const dateStr  = getTodayStr();

    // 1. Close the current task at the moment screen was locked
    const evts    = getEventsForDate(user, dateStr);
    const taskEvt = evts.find((e) => e.id === evtId);
    if (taskEvt && !taskEvt.endTime) {
      taskEvt.endTime  = lockedAt.toISOString();
      taskEvt.duration = Math.max(0, Math.round((lockedAt.getTime() - new Date(taskEvt.startTime).getTime()) / 1000));
      saveEvent(taskEvt);
    }

    // 2. Record Lock Screen idle event
    const lockId = generateId();
    lockIdleEventRef.current = lockId;
    preLockScopeRef.current  = scope;
    saveEvent({
      id: lockId, date: dateStr, login: user,
      mile, shiftCode: (shift || "X") as ShiftKey,
      scope: "Lock Screen", functionType: "Idle",
      startTime: lockedAt.toISOString(),
      endTime:   new Date().toISOString(),
      duration:  elapsedSecs,
      note: "Screen locked — auto detected",
    });

    // 3. Update tool state
    setCurrentEventId(null);
    stopTimer();
    setToolState("clocked_out");
    setTodayEvents(getEventsForDate(user, dateStr));

    // 4. Show return modal
    setLockReturnReason("");
    setModal({ type: "lock_screen_return", lockedSecs: elapsedSecs, prevScope: scope });
  }, []);

  useEffect(() => {
    // ── Heartbeat writer: update timestamp every 20s while page is alive ──
    const heartbeatInterval = setInterval(() => {
      try { localStorage.setItem(HEARTBEAT_KEY, String(Date.now())); } catch {}
    }, HEARTBEAT_INTERVAL_MS);

    // ── Check heartbeat gap — call on both visibilitychange→visible and focus ──
    const checkHeartbeatGap = () => {
      try {
        const last = parseInt(localStorage.getItem(HEARTBEAT_KEY) || "0");
        if (!last) return;
        const gapSecs = Math.round((Date.now() - last) / 1000);
        // Gap > threshold + one missed heartbeat interval means heartbeat stopped
        if (gapSecs >= LOCK_THRESHOLD_SECS) {
          triggerLockDetected(gapSecs);
        }
      } catch {}
    };

    // ── Method 1: visibilitychange ──
    const onHide = () => {
      hiddenAtRef.current = Date.now();
      // Write heartbeat immediately on hide so gap is accurate
      try { localStorage.setItem(HEARTBEAT_KEY, String(Date.now())); } catch {}
    };

    const onShow = () => {
      // Method 1: time-based via visibilitychange
      if (hiddenAtRef.current !== null) {
        const elapsedSecs = Math.round((Date.now() - hiddenAtRef.current) / 1000);
        hiddenAtRef.current = null;
        if (elapsedSecs >= LOCK_THRESHOLD_SECS) {
          triggerLockDetected(elapsedSecs);
          return;
        }
      }
      // Method 2: heartbeat gap check (catches cases visibilitychange missed)
      checkHeartbeatGap();
    };

    const onVisibilityChange = () => {
      if (document.hidden) onHide(); else onShow();
    };

    // ── Method 2 backup: window focus (fires when user returns after lock) ──
    const onFocus = () => { checkHeartbeatGap(); };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [triggerLockDetected]);

  // ── Confirm return from screen lock ───────────────────────────────────────
  const handleLockReturn = (reason: string) => {
    if (!currentUser) return;
    const now     = new Date();
    const dateStr = getTodayStr();
    const scope   = preLockScopeRef.current || selectedScope;

    // Parse reason for Break / Huddle / Drill keywords
    const r          = reason.trim().toLowerCase();
    const isBreakR   = r.includes("break");
    const isHuddleR  = r.includes("huddle");
    const isDrillR   = r.includes("drill");
    const detectedScope    = isBreakR ? "Break" : isHuddleR ? "Huddle" : isDrillR ? "Drills" : null;
    const detectedFnType   = detectedScope ? "In-Direct" : null;

    // 1. Update the Lock Screen event:
    //    - If a keyword was detected → reclassify its scope & functionType
    //    - Always update the note with the user's reason
    if (lockIdleEventRef.current) {
      const evts    = getEventsForDate(currentUser, dateStr);
      const lockEvt = evts.find((e) => e.id === lockIdleEventRef.current);
      if (lockEvt) {
        if (detectedScope) {
          lockEvt.scope        = detectedScope;
          lockEvt.functionType = detectedFnType!;
        }
        lockEvt.note = reason.trim()
          ? `Screen locked — ${reason.trim()}`
          : "Screen locked — auto detected";
        saveEvent(lockEvt);
      }
    }
    lockIdleEventRef.current = null;

    // 2. Resume the previous task scope as a new clock-in
    const internal = getScopeInternal(scope);
    const newId    = generateId();
    saveEvent({
      id: newId, date: dateStr, login: currentUser,
      mile: selectedMile, shiftCode: (selectedShift || "X") as ShiftKey,
      scope,
      functionType: internal === "Indirect" ? "In-Direct" : (FUNCTION_TYPES[internal] || internal),
      startTime: now.toISOString(), endTime: null, duration: 0,
    });

    // 3. Restore state
    setCurrentEventId(newId);
    setToolState("clocked_in");
    startTimer(0);
    setModal(null);
    setLockReturnReason("");
    refreshEvents();
  };

  // ── Idle ticker — runs whenever not clocked in ──
  const idleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (toolState === "idle" || toolState === "clocked_out") {
      // Reset to 0 and start counting from now
      const start = Date.now();
      setTimerSecs(0);
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      idleTimerRef.current = setInterval(() => {
        setTimerSecs(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      // Active state — idle ticker not needed (startTimer handles it)
      if (idleTimerRef.current) { clearInterval(idleTimerRef.current); idleTimerRef.current = null; }
    }
    return () => { if (idleTimerRef.current) { clearInterval(idleTimerRef.current); idleTimerRef.current = null; } };
  }, [toolState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Timer helpers ──
  const startTimer = (fromSecs = 0) => {
    setTimerSecs(fromSecs);
    if (timerRef.current) clearInterval(timerRef.current);
    const start = Date.now() - fromSecs * 1000;
    timerRef.current = setInterval(() => setTimerSecs(Math.floor((Date.now() - start) / 1000)), 1000);
  };
  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  useEffect(() => () => stopTimer(), []);

  // ── Shift helpers ──
  function getShiftMinutes(sk: ShiftKey) {
    const sh = SHIFTS[sk];
    if (!sh.start || !sh.end) return null;
    const [hh, mm] = sh.start.split(":").map(Number);
    const [eh, em] = sh.end.split(":").map(Number);
    return { startMin: hh * 60 + mm, endMin: eh * 60 + em };
  }
  function nowMinutes() { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); }

  // ── Late minutes — how many minutes past the grace window ──
  // Returns > 0 only if clocking in late (past shift start + grace period)
  function calcLateMinutes(shiftKey: ShiftKey): number {
    if (shiftKey === "X") return 0;
    const sh = SHIFTS[shiftKey];
    if (!sh.start) return 0;
    const [hh, mm] = sh.start.split(":").map(Number);
    const shiftStartMin = hh * 60 + mm;
    let diff = nowMinutes() - shiftStartMin;
    // Handle midnight wrap for night shift (N: 22:00 start)
    if (diff < -120) diff += 1440; // crossed midnight going forward
    if (diff < 0)    return 0;     // early check-in, not late
    return Math.max(0, diff - LATE_GRACE_MINUTES);
  }

  const lateMinutes = (() => {
    if (!selectedShift || selectedShift === "X") return 0;
    return calcLateMinutes(selectedShift as ShiftKey);
  })();

  // ── Field lock logic ──
  // Shift: locked for the entire calendar day once confirmed at first clock-in
  // Mile:  locked after first clock-in for the session
  // Scope: editable between tasks (after clock-out), locked only while active
  const isSessionStarted  = toolState !== "idle";
  const isCurrentlyActive = ["clocked_in","on_break","on_drill","on_huddle"].includes(toolState);
  const shiftLocked = shiftConfirmedToday;  // permanent for the day
  const mileLocked  = isSessionStarted;     // locked after first clock-in
  const scopeLocked = isCurrentlyActive;    // locked only while actively clocked in
  const missingFields: string[] = [];
  if (!selectedShift)  missingFields.push("Shift");
  if (!selectedMile)   missingFields.push("Working Mile");
  if (!selectedScope)  missingFields.push("Process Scope");

  // Break is not allowed as the first clock-in scope — must clock in on a task first
  const isBreakScope = selectedScope === "Break";
  const canClockIn = missingFields.length === 0 && !isBreakScope;

  // ── Clock In ──
  const handleClockIn = () => {
    if (!canClockIn) return;
    setModal({ type: "scope_confirm" });
  };

  const proceedClockIn = () => {
    setModal(null);

    // First clock-in of the day — check if late
    if (toolState === "idle" && selectedShift && selectedShift !== "X") {
      const late = calcLateMinutes(selectedShift as ShiftKey);
      if (late > 0) {
        setModal({ type: "late_reason" });
        return;
      }
    }

    // Subsequent clock-in after clock-out — auto-record idle gap silently, no modal
    doClockIn();
  };

  const doClockIn = (lateNote?: string) => {
    setModal(null);

    const now = new Date();

    // Lock the shift for today on first clock-in
    if (selectedShift && !getDailyShift(currentUser)) {
      setDailyShift(currentUser, selectedShift);
    }

    if (lateNote && selectedShift && selectedShift !== "X") {
      // Late clock-in: detect if reason mentions Huddle or Drill
      const reasonLower  = lateNote.toLowerCase();
      const isLateHuddle = reasonLower.includes("huddle");
      const isLateDrill  = reasonLower.includes("drill");
      const lateScope    = isLateHuddle ? "Huddle" : isLateDrill ? "Drills" : "Idle / No Task";
      const lateFnType   = isLateHuddle || isLateDrill ? "In-Direct" : "Idle";

      // Record idle from shift start → now
      const sh = SHIFTS[selectedShift as ShiftKey];
      if (sh.start) {
        const [hh, mm] = sh.start.split(":").map(Number);
        const shiftStart = new Date(now);
        shiftStart.setHours(hh, mm, 0, 0);
        if (shiftStart > now) shiftStart.setDate(shiftStart.getDate() - 1);
        const idleSecs = Math.round((now.getTime() - shiftStart.getTime()) / 1000);
        if (idleSecs > 0) {
          saveEvent({
            id: generateId(), date: today, login: currentUser,
            mile: selectedMile, shiftCode: selectedShift as ShiftKey,
            scope: lateScope, functionType: lateFnType,
            startTime: shiftStart.toISOString(), endTime: now.toISOString(),
            duration: idleSecs, note: `Late check-in: ${lateNote}`,
          });
        }
      }
    } else if (toolState === "idle" && selectedShift && selectedShift !== "X") {
      // First clock-in of the day (on time or early) — silently record any gap
      // from shift start up to now as "Idle / No Task"
      const sh = SHIFTS[selectedShift as ShiftKey];
      if (sh.start) {
        const [hh, mm] = sh.start.split(":").map(Number);
        const shiftStart = new Date(now);
        shiftStart.setHours(hh, mm, 0, 0);
        if (shiftStart > now) shiftStart.setDate(shiftStart.getDate() - 1);
        const idleSecs = Math.round((now.getTime() - shiftStart.getTime()) / 1000);
        if (idleSecs >= 60) {
          saveEvent({
            id: generateId(), date: today, login: currentUser,
            mile: selectedMile, shiftCode: selectedShift as ShiftKey,
            scope: "Idle / No Task", functionType: "Idle",
            startTime: shiftStart.toISOString(), endTime: now.toISOString(),
            duration: idleSecs, note: "Not clocked in",
          });
        }
      }
    } else if (toolState === "clocked_out") {
      // Record the idle gap since last clock-out, splitting into
      // "Early Log Out" + "Between tasks" if appropriate
      const lco = getLastClockOut();
      if (lco && lco.login === currentUser && lco.date === today) {
        recordIdleGapAfterClockOut(lco, now.toISOString());
      } else {
        // Fallback: simple gap from appOpenRef
        const idleStart = appOpenRef.current;
        const idleSecs  = Math.round((now.getTime() - idleStart.getTime()) / 1000);
        if (idleSecs >= 60) {
          saveEvent({
            id: generateId(), date: today, login: currentUser,
            mile: selectedMile, shiftCode: (selectedShift || "X") as ShiftKey,
            scope: "Idle / No Task", functionType: "Idle",
            startTime: idleStart.toISOString(), endTime: now.toISOString(),
            duration: idleSecs, note: "Between tasks",
          });
        }
      }
    } else {
      idleIdRef.current = null;
    }

    // Start the actual task event
    const evtId = generateId();
    const internalScope = getScopeInternal(selectedScope);
    saveEvent({
      id: evtId,
      date: today,
      login: currentUser,
      mile: selectedMile,
      shiftCode: (selectedShift || "X") as ShiftKey,
      scope: selectedScope,
      functionType: internalScope === "Indirect" ? "In-Direct" : (FUNCTION_TYPES[internalScope] || internalScope),
      startTime: now.toISOString(),
      endTime: null,
      duration: 0,
      note: lateNote ? `Late clock-in: ${lateNote}` : undefined,
    });
    setCurrentEventId(evtId);
    setToolState("clocked_in");
    startTimer(0);
    refreshEvents();
  };

  // ── Clock Out ──
  const handleClockOut = () => {
    if (!currentEventId) return;
    const now = new Date();

    // Finalise the current running event
    const allEvts = getEventsForDate(currentUser, today);
    const evt = allEvts.find((e) => e.id === currentEventId);
    if (evt) {
      evt.endTime  = now.toISOString();
      evt.duration = Math.round((now.getTime() - new Date(evt.startTime).getTime()) / 1000);
      saveEvent(evt);
    }

    // Shift standard hours: G = 9 hrs, X = custom (skip OT), all others = 8 hrs
    const updatedEvts = getEventsForDate(currentUser, today);
    const totalWorkedSecs = updatedEvts
      .filter((e) => e.endTime)
      .reduce((sum, e) => sum + Math.round((new Date(e.endTime!).getTime() - new Date(e.startTime).getTime()) / 1000), 0);
    const stdSecs = selectedShift === "G" ? 9 * 3600 : 8 * 3600;
    const otSecs = selectedShift === "X"
      ? 0
      : Math.max(0, totalWorkedSecs - stdSecs - OT_GRACE_MINUTES * 60);

    setCurrentEventId(null);
    stopTimer();
    setToolState("clocked_out");
    refreshEvents();

    // Persist clock-out so idle can be recorded even if the page is closed
    setLastClockOut({
      login:     currentUser,
      date:      today,
      time:      now.toISOString(),
      shiftCode: selectedShift || "X",
      mile:      selectedMile,
    });

    // If the clocked-out scope was LP, ask for investigation details first
    if (evt && evt.scope === "LP") {
      setLpInvCount(""); setLpInvValue("");
      setModal({ type: "lp_investigation", eventId: evt.id, date: evt.date, mile: evt.mile });
      return;
    }

    if (otSecs > 0) {
      setOtMinutes(otSecs);
      setModal({ type: "ot_reason" });
      return;
    }

    // Restart idle tracking
    idleIdRef.current  = generateId();
    appOpenRef.current = now;
  };

  // ── Generic sub-event start (break/drill/huddle) ──
  // Uses a single timestamp so current task closes and new one opens at the exact same moment
  const startSubEvent = (scope: string, fnType: string, nextState: ToolState) => {
    const now = new Date();

    // 1. Close the currently running task event at this exact moment
    if (currentEventId) {
      const evts = getEventsForDate(currentUser, today);
      const evt  = evts.find((e) => e.id === currentEventId);
      if (evt) {
        evt.endTime  = now.toISOString();
        evt.duration = Math.round((now.getTime() - new Date(evt.startTime).getTime()) / 1000);
        saveEvent(evt);
      }
    }

    // 2. Start the new sub-event (break/drill/huddle) from the same timestamp
    const newId = generateId();
    saveEvent({
      id: newId,
      date: today,
      login: currentUser,
      mile: selectedMile,
      shiftCode: (selectedShift || "X") as ShiftKey,
      scope,
      functionType: fnType,
      startTime: now.toISOString(),
      endTime: null,
      duration: 0,
    });

    // 3. Reset timer from 0 for the new event
    setCurrentEventId(newId);
    setToolState(nextState);
    startTimer(0);
    refreshEvents();
  };

  const endSubEvent = () => {
    if (!currentEventId) return;
    const now = new Date();

    // 1. Close the sub-event (break/drill/huddle) at this exact moment
    const evts = getEventsForDate(currentUser, today);
    const evt  = evts.find((e) => e.id === currentEventId);
    if (evt) {
      evt.endTime  = now.toISOString();
      evt.duration = Math.round((now.getTime() - new Date(evt.startTime).getTime()) / 1000);
      saveEvent(evt);
    }

    // 2. Resume the task from the same timestamp
    const newId = generateId();
    const internalScope = getScopeInternal(selectedScope);
    saveEvent({
      id: newId,
      date: today,
      login: currentUser,
      mile: selectedMile,
      shiftCode: (selectedShift || "X") as ShiftKey,
      scope: selectedScope,
      functionType: internalScope === "Indirect" ? "In-Direct" : (FUNCTION_TYPES[internalScope] || internalScope),
      startTime: now.toISOString(),
      endTime: null,
      duration: 0,
    });

    // 3. Reset timer from 0 for the resumed task
    setCurrentEventId(newId);
    setToolState("clocked_in");
    startTimer(0);
    refreshEvents();
  };

  // ── Manual entry ──
  // ── Export ──
  const handleExport = () => {
    const evts = getEventsForUser(currentUser).filter((e) => e.date >= exportFrom && e.date <= exportTo);
    const headers = ["Date","Login","Mile","Shift","Scope","Function Type","In","Out","Duration (sec)","Status","Note","Manual"];
    const rows = evts.map((e) => {
      const st = getStatusBadge(e.scope, e.note);
      return [e.date, e.login, e.mile, e.shiftCode, e.scope, e.functionType,
        e.startTime ? formatTime(e.startTime) : "", e.endTime ? formatTime(e.endTime) : "",
        e.duration, st.text, e.note || "", e.isManual ? "Yes" : "No"];
    });
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a   = document.createElement("a"); a.href = url; a.download = `TEMPO_${currentUser}_${exportFrom}_${exportTo}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  // ── Summaries (based on viewed date) ──
  // Always derive duration from ISO timestamps to handle any legacy data
  const evtSecs = (e: { startTime: string; endTime: string | null }) =>
    e.endTime ? Math.round((new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 1000) : 0;

  const completedEvents = viewEvents.filter((e) => e.endTime);
  const totalSecs = completedEvents.reduce((a, e) => a + evtSecs(e), 0);

  const scopeMap: Record<string, number> = {};
  completedEvents.forEach((e) => { scopeMap[e.scope] = (scopeMap[e.scope] || 0) + evtSecs(e); });

  const ftMap: Record<string, number> = {};
  completedEvents.forEach((e) => {
    const ft = (e.functionType === "Break" || e.functionType === "Indirect") ? "In-Direct" : e.functionType;
    ftMap[ft] = (ftMap[ft] || 0) + evtSecs(e);
  });

  const scopeEntries  = Object.entries(scopeMap).sort((a, b) => b[1] - a[1]);
  const ftEntries     = Object.entries(ftMap).sort((a, b) => b[1] - a[1]);
  const scopeTotal    = scopeEntries.reduce((a, [, v]) => a + v, 0);
  const ftTotal       = ftEntries.reduce((a, [, v]) => a + v, 0);

  const scopeDonut: DonutSlice[] = scopeEntries.map(([k, v]) => ({ label: k, value: v, color: SCOPE_COLORS[k] || "#888" }));
  const ftDonut: DonutSlice[]    = ftEntries.map(([k, v]) => {
    const c = k === "Direct" ? "#22c55e" : k === "In-Direct" || k === "Indirect" || k === "Break" ? "#3b82f6" : k === "Idle" ? "#94a3b8" : k === "OT" ? "#dc2626" : "#f59e0b";
    return { label: k, value: v, color: c };
  });

  // ── Sorted log with idle gaps (based on viewed date) ──
  const sortedLog = [...viewEvents].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  const logRows: (TimeEvent & { _isGap?: boolean })[] = [];
  sortedLog.forEach((e, i) => {
    if (i > 0) {
      const prev = sortedLog[i - 1];
      if (prev.endTime) {
        const gapSecs = Math.round((new Date(e.startTime).getTime() - new Date(prev.endTime).getTime()) / 1000);
        if (gapSecs > 60) {
          logRows.push({ id: `gap_${i}`, date: e.date, login: currentUser, mile: e.mile, shiftCode: e.shiftCode, scope: "Idle / No Task", functionType: "Idle", startTime: prev.endTime, endTime: e.startTime, duration: gapSecs, _isGap: true });
        }
      }
    }
    logRows.push(e);
  });

  const isActive     = ["clocked_in","on_break","on_drill","on_huddle"].includes(toolState);
  const currentEvt   = currentEventId ? todayEvents.find((e) => e.id === currentEventId) : null;

  const shiftDisplay = selectedShift
    ? `${selectedShift} ${SHIFTS[selectedShift as ShiftKey]?.start ?? ""}${SHIFTS[selectedShift as ShiftKey]?.end ? " — " + SHIFTS[selectedShift as ShiftKey].end : ""}`
    : "";
  const shiftHrsLabel = selectedShift === "G" ? "9:00 working hrs"
    : selectedShift === "X" ? "Custom hrs"
    : "8:00 working hrs";

  // ── Auth screens ──
  if (authState === "login") return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100vh", background:"#f0f4ff", gap:20 }}>
      {/* TEMPO branding */}
      <div style={{ textAlign:"center" }}>
        <div style={{ background: NAVBAR, color:"#fff", borderRadius:8, padding:"6px 20px", fontSize:18, fontWeight:900, letterSpacing:4, display:"inline-block" }}>TEMPO</div>
        <div style={{ fontSize:11, color: MUTED, marginTop:6, letterSpacing:1.5, textTransform:"uppercase" as const }}>
          Time Efficiency Monitoring &amp; Performance Optimization
        </div>
      </div>

      {/* Midway login card */}
      <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:14, padding:"28px 32px", width:340, boxShadow:"0 4px 24px #0002" }}>
        {/* Midway badge */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
          <div style={{ width:36, height:36, borderRadius:"50%", background:"#FF9900", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <span style={{ fontSize:18 }}>🔐</span>
          </div>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:"#1a1a2e" }}>Amazon Midway Sign-In</div>
            <div style={{ fontSize:10, color: MUTED }}>Internal use only · iCMRS TEMPO</div>
          </div>
        </div>

        <div style={{ fontSize:12, color:"#374151", marginBottom:6 }}>Amazon Alias</div>
        <div style={{ position:"relative" as const, marginBottom: aliasError ? 6 : 16 }}>
          <input
            style={{ width:"100%", border:`1.5px solid ${aliasError ? "#ef4444" : BORDER}`, borderRadius:8, padding:"10px 12px", fontSize:14, outline:"none", boxSizing:"border-box" as const, color:"#1a1a2e" }}
            placeholder="e.g. prdmano"
            value={aliasInput}
            onChange={(e) => { setAliasInput(e.target.value); setAliasError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleMidwayLogin()}
            autoFocus
          />
        </div>
        {aliasError && (
          <div style={{ fontSize:11, color:"#ef4444", marginBottom:12, display:"flex", alignItems:"center", gap:4 }}>
            ⚠ {aliasError}
          </div>
        )}

        <button
          onClick={handleMidwayLogin}
          style={{ width:"100%", background:"#FF9900", color:"#fff", border:"none", borderRadius:8, padding:"11px 0", fontSize:14, fontWeight:800, cursor:"pointer", letterSpacing:0.5 }}>
          Sign In with Midway
        </button>

        <div style={{ fontSize:10, color: MUTED, marginTop:12, textAlign:"center" as const, lineHeight:1.5 }}>
          By signing in you confirm you are an Amazon associate.<br />
          Your activity will be tracked per iCMRS TEMPO guidelines.
        </div>
      </div>

      {/* Footer */}
      <div style={{ fontSize:10, color: MUTED, opacity:0.6 }}>iCMRS · Created by prdmano</div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // MAIN LAYOUT
  // ─────────────────────────────────────────────────────────────────────────────

  // Show embedded dashboard
  if (showDashboard) {
    return <TempoDashboardEmbed onClose={() => setShowDashboard(false)} />;
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", fontFamily:"'Segoe UI',Arial,sans-serif", background: BG_RIGHT, overflow:"hidden" }}>

      {/* ── Top Navbar ── */}
      <div style={{ background: NAVBAR, color:"#fff", display:"flex", alignItems:"center", padding:"0 20px", height:48, flexShrink:0, gap:16, borderBottom:"2px solid #1d4ed8" }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ background:"#fff", color: NAVBAR, borderRadius:4, padding:"2px 10px", fontWeight:900, fontSize:14, letterSpacing:2 }}>TEMPO</div>
          <div style={{ display:"flex", flexDirection:"column", lineHeight:1.1 }}>
            <span style={{ fontSize:11, fontWeight:600 }}>Time Efficiency Monitoring &amp; Productivity Optimization</span>
            <span style={{ fontSize:9, color:"#bfdbfe" }}>My Time Tracker</span>
          </div>
        </div>
        <div style={{ flex:1 }} />
        <button style={{ background:"transparent", color:"#fff", border:"1px solid #93c5fd", borderRadius:6, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>My Tasks</button>
        {isManagerUser && (
          isActive
            ? <div title="Dashboard locked while clocked in"
                style={{ background:"rgba(255,255,255,0.05)", color:"#6b89c0", border:"1px solid #3a5a9a", borderRadius:6, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"not-allowed", opacity:0.5, userSelect:"none" as const }}>
                🔒 Dashboard
              </div>
            : <button onClick={() => setShowDashboard(true)}
                style={{ background:"rgba(255,255,255,0.15)", color:"#fff", border:"1px solid #93c5fd", borderRadius:6, padding:"5px 14px", fontSize:12, fontWeight:600, cursor:"pointer" }}>
                📊 Dashboard
              </button>
        )}
        <div style={{ display:"flex", alignItems:"center", gap:8, background:"#1d4ed8", borderRadius:20, padding:"4px 12px 4px 6px" }}>
          <div style={{ width:28, height:28, borderRadius:"50%", background:"#3b82f6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff" }}>
            {currentUser?.[0]?.toUpperCase() || "?"}
          </div>
          <div style={{ lineHeight:1.2 }}>
            <div style={{ fontSize:11, fontWeight:700 }}>{currentUser || "—"}</div>
            <div style={{ fontSize:9, color:"#bfdbfe", letterSpacing:1 }}>ASSOCIATE</div>
          </div>
        </div>
      </div>

      {/* ── Body (left + right) ── */}
      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>

        {/* ════════ LEFT PANEL ════════ */}
        <div style={{ width:270, minWidth:270, background: BG_LEFT, borderRight:`1px solid ${BORDER}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* ── Scrollable top section (only shown when not clocked in) ── */}
          {!isSessionStarted && (
            <div style={{ overflowY:"auto", padding:"14px 14px 0", flexShrink:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#1a1a2e", marginBottom:10 }}>What are you working on?</div>

              {/* Shift selector */}
              <div style={{ fontSize:10, fontWeight:700, color: MUTED, letterSpacing:1.2, marginBottom:8, textTransform:"uppercase" as const }}>
                Shift
                {shiftLocked && <span style={{ color:"#22c55e", fontWeight:600, fontSize:9, letterSpacing:0, marginLeft:6 }}>✓ Locked for today</span>}
              </div>
              <div style={{ display:"flex", flexWrap:"wrap" as const, gap:6, marginBottom:8, pointerEvents: shiftLocked ? "none" : "auto", opacity: shiftLocked ? 0.7 : 1 }}>
                {(Object.keys(SHIFTS) as ShiftKey[]).map((k) => (
                  <ShiftCard key={k} shiftKey={k} selected={selectedShift === k} available={shiftLocked ? selectedShift === k : !!shiftAvail[k]} onClick={() => !shiftLocked && setSelectedShift(k)} />
                ))}
              </div>
              {shiftLocked && (
                <div style={{ fontSize:10, color:"#16a34a", background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:6, padding:"4px 10px", marginBottom:8, textAlign:"center" as const }}>
                  {selectedShift} Shift selected for today · cannot be changed
                </div>
              )}
              {selectedShift && !shiftLocked && (
                <div style={{ fontSize:11, color: MUTED, marginBottom:10, textAlign:"center" as const }}>
                  <span style={{ background:"#f0f4ff", borderRadius:5, padding:"3px 10px", color:ACCENT, fontWeight:600 }}>
                    {shiftDisplay} &nbsp;·&nbsp; {shiftHrsLabel}
                  </span>
                </div>
              )}

              {/* Working Mile */}
              <div style={{ fontSize:10, fontWeight:700, color: MUTED, letterSpacing:1.2, marginBottom:4, textTransform:"uppercase" as const }}>Working Mile</div>
              <select
                style={{ width:"100%", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 10px", fontSize:13, marginBottom:12, outline:"none", background:"#fff", color:"#1a1a2e", cursor:"pointer" }}
                value={selectedMile} onChange={(e) => setSelectedMile(e.target.value)}>
                {MILES.map((m) => <option key={m}>{m}</option>)}
              </select>

              {/* Process Scope */}
              <div style={{ fontSize:10, fontWeight:700, color: MUTED, letterSpacing:1.2, marginBottom:4, textTransform:"uppercase" as const }}>Process Scope</div>
              <select
                style={{ width:"100%", border:`1px solid ${BORDER}`, borderRadius:8, padding:"8px 10px", fontSize:13, marginBottom:12, outline:"none", background:"#fff", color:"#1a1a2e", cursor:"pointer" }}
                value={selectedScope} onChange={(e) => setSelectedScope(e.target.value)}>
                {SCOPE_GROUPS.map(({ group, scopes }) => (
                  <optgroup key={group} label={`— ${group} —`}>
                    {scopes.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {/* ── After clock-in: compact session pill ── */}
          {isSessionStarted && (
            <div style={{ padding:"10px 14px 0", flexShrink:0 }}>
              <div style={{ background:"#f0f4ff", border:`1px solid #c7d8f8`, borderRadius:10, padding:"8px 12px" }}>
                <div style={{ fontSize:10, color:MUTED, letterSpacing:1, textTransform:"uppercase" as const, marginBottom:4 }}>Current Session</div>
                {toolState === "clocked_out" ? (
                  /* clocked_out: compact inline selectors */
                  <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                    <select
                      style={{ flex:"0 0 auto", border:`1px solid ${BORDER}`, borderRadius:6, padding:"4px 6px", fontSize:11, fontWeight:700, outline:"none", background:"#fff", color:"#1e40af", cursor:"pointer", maxWidth:74 }}
                      value={selectedMile} onChange={(e) => setSelectedMile(e.target.value)}>
                      {MILES.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select
                      style={{ flex:1, border:`1px solid ${BORDER}`, borderRadius:6, padding:"4px 6px", fontSize:11, outline:"none", background:"#fff", color:"#1a1a2e", cursor:"pointer", minWidth:0 }}
                      value={selectedScope} onChange={(e) => setSelectedScope(e.target.value)}>
                      {SCOPE_GROUPS.map(({ group, scopes }) => (
                        <optgroup key={group} label={`— ${group} —`}>
                          {scopes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ) : (
                  /* active: read-only pill */
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:"#1a1a2e" }}>{selectedMile} · {selectedScope}</div>
                    <div style={{ fontSize:11, color:MUTED }}>{shiftDisplay}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Timer block — fixed, no scroll ── */}
          <div style={{ padding:"10px 14px 0", flexShrink:0 }}>
            {(() => {
              const isBreak  = toolState === "on_break";
              const isDrill  = toolState === "on_drill";
              const isHuddle = toolState === "on_huddle";
              const isSub    = isBreak || isDrill || isHuddle;
              const isOut    = toolState === "clocked_out";

              const subLabel = isBreak ? "On Break" : isDrill ? "On Drill" : isHuddle ? "On Huddle" : null;
              const subIcon  = isBreak ? "☕" : isDrill ? "🔔" : isHuddle ? "🗣️" : null;

              const timerColor = isSub
                ? (isBreak ? "#d97706" : isDrill ? "#1d4ed8" : "#15803d")
                : isActive ? GREEN
                : lateMinutes > 0 ? "#c2410c"
                : isOut ? "#64748b"
                : "#1a3a6b";

              const bgColor = isSub
                ? (isBreak ? "#fffbeb" : isDrill ? "#eff6ff" : "#f0fdf4")
                : isActive ? "#f0fdf4"
                : lateMinutes > 0 ? "#fff7ed"
                : isOut ? "#f8fafc"
                : "#f0f4ff";

              const borderColor = isSub
                ? (isBreak ? "#fde68a" : isDrill ? "#bfdbfe" : "#bbf7d0")
                : isActive ? "#bbf7d0"
                : lateMinutes > 0 ? "#fed7aa"
                : isOut ? "#e2e8f0"
                : "#c7d8f8";

              return (
                <div style={{ background: bgColor, border:`1.5px solid ${borderColor}`, borderRadius:14, padding:"14px 12px 10px", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:timerColor, letterSpacing:1, textTransform:"uppercase" as const }}>
                    {isSub    ? `${subIcon} ${subLabel}`
                     : isActive ? "● In Progress"
                     : isOut   ? "✓ Clocked Out"
                     :           "● Idle"}
                  </div>
                  <div style={{ fontSize:12, fontWeight:600, color:"#1a1a2e", marginTop:2 }}>
                    {isSub    ? subLabel
                     : isActive ? `${selectedMile} — ${selectedScope}`
                     : isOut   ? `${selectedMile} · ${selectedShift} Shift`
                     :           "Not clocked in"}
                  </div>
                  {(isActive || isSub) && currentEvt && (
                    <div style={{ fontSize:10, color:MUTED }}>Started {formatTime(currentEvt.startTime)}</div>
                  )}
                  <div style={{ fontSize:56, fontWeight:800, color:timerColor, fontVariantNumeric:"tabular-nums", letterSpacing:2, lineHeight:1.1, margin:"6px 0 2px" }}>
                    {formatTimer(timerSecs)}
                  </div>
                  <div style={{ fontSize:10, color:MUTED, letterSpacing:0.5 }}>
                    {isSub    ? `${subLabel} duration`
                     : isActive ? "Task duration"
                     : isOut   ? "Idle since clock out"
                     :           "Idle since app open"}
                  </div>
                  {!isActive && !isSub && lateMinutes > 0 && (
                    <div style={{ marginTop:4, fontSize:11, color:"#c2410c", fontWeight:600 }}>
                      ⏰ {lateMinutes}m late for {selectedShift} Shift
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* ── Buttons — fill remaining space equally ── */}
          <div style={{ flex:1, padding:"10px 14px", display:"flex", flexDirection:"column", gap:8, minHeight:0 }}>
            {/* Clock In */}
            {(toolState === "idle" || toolState === "clocked_out") && (
              <>
                <button onClick={handleClockIn} disabled={!canClockIn}
                  style={{ flex:1, background: canClockIn ? GREEN : "#d1d5db", color: canClockIn ? "#fff" : "#9ca3af", border:"none", borderRadius:10, fontSize:16, fontWeight:800, cursor: canClockIn ? "pointer" : "not-allowed", display:"flex", alignItems:"center", justifyContent:"center", gap:8, transition:"background 0.2s" }}>
                  <span style={{ fontSize:18 }}>▶</span> Clock In
                </button>
                {!canClockIn && (
                  <div style={{ fontSize:11, color:"#ef4444", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:7, padding:"6px 10px", lineHeight:1.5, flexShrink:0 }}>
                    {isBreakScope
                      ? <>Cannot start with <b>Break</b> — select a task scope.</>
                      : <>Please select: <b>{missingFields.join(", ")}</b></>
                    }
                  </div>
                )}
              </>
            )}

            {/* Clock Out */}
            {toolState === "clocked_in" && (
              <button onClick={handleClockOut}
                style={{ flex:1, background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:3 }}>
                <span style={{ fontSize:22 }}>⏹</span>
                <span>Clock Out</span>
              </button>
            )}

            {/* Start Break */}
            {toolState === "clocked_in" && (
              <button onClick={() => startSubEvent("Break","In-Direct","on_break")}
                style={{ flex:1, background:"#fffbeb", color:"#d97706", border:"1px solid #fde68a", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:3 }}>
                <span style={{ fontSize:22 }}>☕</span>
                <span>Start Break</span>
              </button>
            )}
            {toolState === "on_break" && (
              <button onClick={endSubEvent}
                style={{ flex:1, background:"#fffbeb", color:"#d97706", border:"2px solid #fbbf24", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:3 }}>
                <span style={{ fontSize:22 }}>☕</span>
                <span>End Break</span>
              </button>
            )}

            {/* Drill */}
            {toolState === "clocked_in" && (
              <button onClick={() => startSubEvent("Drills","In-Direct","on_drill")}
                style={{ flex:1, background:"#eff6ff", color:"#1d4ed8", border:"1px solid #bfdbfe", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:3 }}>
                <span style={{ fontSize:22 }}>🔔</span>
                <span>Drill</span>
              </button>
            )}
            {toolState === "on_drill" && (
              <button onClick={endSubEvent}
                style={{ flex:1, background:"#eff6ff", color:"#1d4ed8", border:"2px solid #3b82f6", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:3 }}>
                <span style={{ fontSize:22 }}>🔔</span>
                <span>End Drill</span>
              </button>
            )}

            {/* Huddle */}
            {toolState === "clocked_in" && (
              <button onClick={() => startSubEvent("Huddle","In-Direct","on_huddle")}
                style={{ flex:1, background:"#f0fdf4", color:"#15803d", border:"1px solid #bbf7d0", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:3 }}>
                <span style={{ fontSize:22 }}>🗣️</span>
                <span>Huddle</span>
              </button>
            )}
            {toolState === "on_huddle" && (
              <button onClick={endSubEvent}
                style={{ flex:1, background:"#f0fdf4", color:"#15803d", border:"2px solid #22c55e", borderRadius:10, fontSize:15, fontWeight:700, cursor:"pointer", display:"flex", flexDirection:"column" as const, alignItems:"center", justifyContent:"center", gap:3 }}>
                <span style={{ fontSize:22 }}>🗣️</span>
                <span>End Huddle</span>
              </button>
            )}
          </div>

          {/* iCMRS logo */}
          <div style={{ padding:"8px 14px", borderTop:`1px solid ${BORDER}`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
            {/* Triple-click iCMRS logo to reveal dev clear button */}
            <div style={{ display:"flex", alignItems:"center", gap:8, opacity:0.45, cursor:"default", userSelect:"none" as const }}
              onClick={() => setDevClickCount((n) => {
                const next = n + 1;
                if (next >= 3) { setDevMode(true); return 0; }
                return next;
              })}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"#e8eaf0", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:MUTED }}>iC</div>
              <div>
                <div style={{ fontSize:11, color:MUTED, fontWeight:700 }}>iCMRS</div>
                <div style={{ fontSize:9, color:MUTED }}>Created by prdmano</div>
              </div>
            </div>
            {/* DEV: only visible after triple-click on logo */}
            {devMode && (
              <button
                onClick={() => {
                  if (!window.confirm("Delete all records for today and reset? This cannot be undone.")) return;
                  const raw = localStorage.getItem("tempo_events");
                  if (raw) {
                    const all = JSON.parse(raw);
                    const filtered = all.filter((e: { date: string; login: string }) => !(e.date === today && e.login === currentUser));
                    localStorage.setItem("tempo_events", JSON.stringify(filtered));
                  }
                  clearDailyShift();
                  setToolState("idle");
                  setCurrentEventId(null);
                  setTimerSecs(0);
                  setTodayEvents([]);
                  setSelectedShift("");
                  setSelectedMile(MILES[0]);
                  setSelectedScope(USER_SCOPES[0].value);
                  stopTimer();
                  setDevMode(false);
                }}
                style={{ fontSize:10, color:"#ef4444", background:"none", border:"1px solid #fecaca", borderRadius:5, padding:"3px 8px", cursor:"pointer", opacity:0.7 }}>
                🗑 Clear Today
              </button>
            )}
          </div>
        </div>

        {/* ════════ RIGHT PANEL ════════ */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>

          {/* Fixed top section — header + charts (no scroll) */}
          <div style={{ padding:"16px 22px 0", flexShrink:0, display:"flex", flexDirection:"column", gap:14 }}>

          {/* Header */}
          <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between" }}>
            <div style={{ fontSize:18, fontWeight:800, color:"#1a1a2e" }}>
              {isViewingToday ? "Today's Overview" : `Overview — ${new Date(viewDate + "T00:00:00").toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}`}
            </div>
            <div style={{ fontSize:18, fontWeight:800, color:"#1a1a2e" }}>{formatDur(totalSecs)}</div>
          </div>

          {/* Charts row — Function Type (stacked) + Scope (bars + donut) */}
          <div style={{ display:"flex", gap:14 }}>

            {/* Time by Function Type — stacked bar */}
            <div style={{ flex:"0 0 42%", background:"#fff", border:`1px solid ${BORDER}`, borderRadius:12, padding:"14px 18px" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#1a1a2e", marginBottom:4 }}>
                Time by Function Type
                <span style={{ fontSize:10, color:MUTED, fontWeight:400, marginLeft:6 }}>{formatDur(totalSecs)}</span>
              </div>
              {ftEntries.length === 0
                ? <div style={{ color:MUTED, fontSize:12, marginTop:8 }}>No data yet</div>
                : <StackedBar
                    total={ftTotal}
                    slices={ftEntries.map(([k, v]) => ({
                      label: k,
                      value: v,
                      color: k === "Direct" ? "#22c55e" : k === "In-Direct" || k === "Indirect" || k === "Break" ? "#3b82f6" : k === "Idle" ? "#94a3b8" : k === "OT" ? "#dc2626" : "#a78bfa",
                    }))}
                  />
              }
            </div>

            {/* Time by Scope — horizontal bars + big donut */}
            <div style={{ flex:1, background:"#fff", border:`1px solid ${BORDER}`, borderRadius:12, padding:"14px 18px" }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#1a1a2e", marginBottom:10 }}>
                Time by Scope
                <span style={{ fontSize:10, color:MUTED, fontWeight:400, marginLeft:6 }}>{formatDur(totalSecs)}</span>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:16 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  {scopeEntries.length === 0
                    ? <div style={{ color:MUTED, fontSize:12 }}>No data yet</div>
                    : scopeEntries.map(([k, v]) => (
                        <BarRow key={k} label={getScopeLabel(k)} value={v} total={scopeTotal} color={SCOPE_COLORS[k] || "#888"} />
                      ))}
                </div>
                <DonutChart slices={scopeDonut} size={160} />
              </div>
            </div>

          </div>

          </div>{/* end fixed top section */}

          {/* Scrollable bottom section — Activity Log only */}
          <div style={{ flex:1, overflowY:"auto", padding:"0 22px 16px", marginTop:14 }}>

          {/* Activity Log */}
          <div style={{ background:"#fff", border:`1px solid ${BORDER}`, borderRadius:12, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {/* Sticky heading row */}
            <div style={{ position:"sticky", top:0, zIndex:10, background:"#fff", borderBottom:`1px solid ${BORDER}`, borderRadius:"12px 12px 0 0", padding:"12px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap" as const, gap:8 }}>
              {/* Left: title + event count */}
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:13, fontWeight:700, color:"#1a1a2e" }}>Activity Log</span>
                <span style={{ background:"#f0f4ff", color: ACCENT, borderRadius:12, padding:"1px 8px", fontSize:11, fontWeight:600 }}>{logRows.length} events</span>
              </div>

              {/* Right: per-day date navigation + export */}
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                {/* Prev day */}
                <button
                  onClick={() => {
                    const d = new Date(viewDate); d.setDate(d.getDate() - 1);
                    setViewDate(d.toISOString().slice(0, 10));
                  }}
                  style={{ background:"#f0f4ff", color: ACCENT, border:`1px solid ${BORDER}`, borderRadius:6, width:28, height:28, fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>
                  ‹
                </button>

                {/* Date label */}
                <div style={{ fontSize:12, fontWeight:700, color:"#1a1a2e", minWidth:90, textAlign:"center" as const }}>
                  {isViewingToday
                    ? "Today"
                    : new Date(viewDate + "T00:00:00").toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" })}
                </div>

                {/* Next day — disabled if already on today */}
                <button
                  onClick={() => {
                    const d = new Date(viewDate); d.setDate(d.getDate() + 1);
                    const next = d.toISOString().slice(0, 10);
                    if (next <= today) setViewDate(next);
                  }}
                  disabled={isViewingToday}
                  style={{ background: isViewingToday ? "#f3f4f6" : "#f0f4ff", color: isViewingToday ? "#d1d5db" : ACCENT, border:`1px solid ${BORDER}`, borderRadius:6, width:28, height:28, fontSize:14, cursor: isViewingToday ? "not-allowed" : "pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700 }}>
                  ›
                </button>

                {/* Go to today shortcut */}
                {!isViewingToday && (
                  <button onClick={() => setViewDate(today)}
                    style={{ background:"#f0f4ff", color: ACCENT, border:`1px solid ${BORDER}`, borderRadius:6, padding:"4px 10px", fontSize:11, fontWeight:600, cursor:"pointer" }}>
                    Today
                  </button>
                )}

                {/* Export for the viewed date */}
                <button onClick={() => {
                  const evts = getEventsForUser(currentUser).filter((e) => e.date === viewDate);
                  const headers = ["#","Date","Login","Mile","Shift","Scope","Function Type","In","Out","Duration (sec)","Status","Note","Manual"];
                  const rows = evts.map((e, idx) => {
                    const st = getStatusBadge(e.scope, e.note);
                    return [idx + 1, e.date, e.login, e.mile, e.shiftCode, e.scope, e.functionType,
                      e.startTime ? formatTime(e.startTime) : "", e.endTime ? formatTime(e.endTime) : "",
                      e.duration, st.text, e.note || "", e.isManual ? "Yes" : "No"];
                  });
                  const csv = [headers, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
                  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                  const a = document.createElement("a"); a.href = url; a.download = `TEMPO_${currentUser}_${viewDate}.csv`; a.click(); URL.revokeObjectURL(url);
                }}
                  style={{ background:"#166534", color:"#fff", border:"none", borderRadius:7, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                  📊 Export
                </button>
              </div>
            </div>{/* end sticky heading */}

            <div style={{ overflowX:"auto", overflowY:"visible" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
                <thead>
                  <tr style={{ background:"#f8f9ff" }}>
                    {["#","Shift","Mile","Scope","Type","In","Out","Duration","Status","Reason"].map((h) => (
                      <th key={h} style={{ position:"sticky", top:0, zIndex:5, background:"#f8f9ff", padding:"7px 10px", fontWeight:700, fontSize:10, color:MUTED, textTransform:"uppercase" as const, letterSpacing:0.8, borderBottom:`1px solid ${BORDER}`, textAlign:"left" as const, whiteSpace:"nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logRows.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding:"20px", textAlign:"center", color:MUTED, fontSize:12 }}>No events for {isViewingToday ? "today" : viewDate}</td></tr>
                  ) : logRows.map((e, rowIdx) => {
                    const isGap  = !!(e as TimeEvent & { _isGap?: boolean })._isGap;
                    // Normalise: "Indirect", "Break" (legacy) → "In-Direct"
                    const internalFt = (e.functionType === "Indirect" || e.functionType === "Break") ? "In-Direct" : e.functionType;
                    const typeBadge  = TYPE_BADGE[internalFt] || TYPE_BADGE["Idle"];
                    const statusBadge = getStatusBadge(e.scope, e.note);
                    const shiftColor = SHIFT_COLORS[e.shiftCode] || "#888";
                    const rowBg = isGap ? "#fafbff" : e.scope === "Break" ? "#fffbeb" : e.scope === "Idle / No Task" || e.scope === "Idle" ? "#f8faff" : "#fff";
                    return (
                      <tr key={e.id} style={{ background: rowBg, opacity: isGap ? 0.65 : 1 }}>
                        {/* # event number */}
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8`, color: MUTED, fontSize:11, fontWeight:700, textAlign:"center" as const }}>
                          {isGap ? "—" : rowIdx + 1}
                        </td>
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8` }}>
                          <div style={{ width:22, height:22, borderRadius:"50%", background: shiftColor, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"#fff" }}>
                            {e.shiftCode}
                          </div>
                        </td>
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8`, fontSize:11, color:"#374151" }}>{e.mile}</td>
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8`, fontSize:11, color:"#374151" }}>{getScopeLabel(e.scope)}</td>
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8` }}>
                          <span style={{ background: typeBadge.bg, color: typeBadge.color, borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:700, whiteSpace:"nowrap" }}>{internalFt}</span>
                        </td>
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8`, fontSize:11, color:"#374151", fontVariantNumeric:"tabular-nums" }}>{formatTime(e.startTime)}</td>
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8`, fontSize:11, color:"#374151", fontVariantNumeric:"tabular-nums" }}>{e.endTime ? formatTime(e.endTime) : "—"}</td>
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8`, fontSize:11, fontWeight:600, color: isGap ? MUTED : "#1a1a2e" }}>
                          {e.endTime
                            ? formatDur(Math.round((new Date(e.endTime).getTime() - new Date(e.startTime).getTime()) / 1000))
                            : "—"}
                        </td>
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8` }}>
                          <span style={{ background: statusBadge.bg, color: statusBadge.color, borderRadius:5, padding:"2px 8px", fontSize:10, fontWeight:600, whiteSpace:"nowrap" }}>{statusBadge.text}</span>
                        </td>
                        <td style={{ padding:"6px 10px", borderBottom:`1px solid #f0f2f8`, fontSize:10, color: MUTED }}>{e.note || ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </div>{/* end scrollable activity log section */}
        </div>
      </div>

      {/* ── Modals ── */}
      {modal?.type === "scope_confirm" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}>
          <div style={{ background:"#fff", borderRadius:14, padding:28, width:340, boxShadow:"0 8px 40px #0003" }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#1a1a2e", marginBottom:4 }}>Confirm Before Clock In</div>
            <div style={{ fontSize:12, color:MUTED, marginBottom:16 }}>Please verify your selections are correct.</div>
            <div style={{ background:"#f8f9ff", borderRadius:8, padding:"10px 14px", marginBottom:16, display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ fontSize:12 }}><b>Shift:</b> {selectedShift || "Not selected"} {selectedShift && SHIFTS[selectedShift as ShiftKey]?.start ? `· ${SHIFTS[selectedShift as ShiftKey].start} – ${SHIFTS[selectedShift as ShiftKey].end}` : ""}</div>
              <div style={{ fontSize:12 }}><b>Mile:</b> {selectedMile}</div>
              <div style={{ fontSize:12 }}><b>Scope:</b> {getScopeLabel(selectedScope)}</div>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => setModal(null)} style={{ flex:1, background:"#f0f2f8", color:"#1a1a2e", border:"none", borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:700, cursor:"pointer" }}>Edit</button>
              <button onClick={proceedClockIn} style={{ flex:2, background: GREEN, color:"#fff", border:"none", borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:700, cursor:"pointer" }}>Confirm Clock In</button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "late_reason" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}>
          <div style={{ background:"#fff", borderRadius:14, padding:28, width:380, boxShadow:"0 8px 40px #0003" }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#c2410c", marginBottom:6 }}>⏰ Late Check-In Detected</div>
            <div style={{ background:"#fff7ed", border:"1px solid #fed7aa", borderRadius:8, padding:"10px 14px", marginBottom:14 }}>
              <div style={{ fontSize:13, color:"#92400e", fontWeight:600 }}>
                You are clocking in <b>{lateMinutes} minute{lateMinutes !== 1 ? "s" : ""} late</b> for {selectedShift} Shift
              </div>
              <div style={{ fontSize:11, color:"#b45309", marginTop:3 }}>
                Shift starts {SHIFTS[selectedShift as ShiftKey]?.start} · Grace period: {LATE_GRACE_MINUTES} min
              </div>
            </div>

            <div style={{ fontSize:12, color:MUTED, marginBottom:6 }}>What were you doing before clocking in?</div>

            {/* Quick-select for common late reasons */}
            <div style={{ display:"flex", gap:8, marginBottom:10 }}>
              <button onClick={() => setLateReason("Huddle")}
                style={{ flex:1, background: lateReason === "Huddle" ? "#1d4ed8" : "#eff6ff", color: lateReason === "Huddle" ? "#fff" : "#1d4ed8", border:"1px solid #bfdbfe", borderRadius:8, padding:"7px 0", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                🗣️ Huddle
              </button>
              <button onClick={() => setLateReason("Drill")}
                style={{ flex:1, background: lateReason === "Drill" ? "#ff7043" : "#fff3ef", color: lateReason === "Drill" ? "#fff" : "#c2410c", border:"1px solid #fecaca", borderRadius:8, padding:"7px 0", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                🔔 Drill
              </button>
              <button onClick={() => setLateReason("")}
                style={{ flex:1, background: (!lateReason || (lateReason !== "Huddle" && lateReason !== "Drill")) ? "#f1f5f9" : "#f8fafc", color:"#475569", border:"1px solid #e2e8f0", borderRadius:8, padding:"7px 0", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                Other
              </button>
            </div>

            <input
              style={{ width:"100%", border:`1px solid ${BORDER}`, borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", boxSizing:"border-box" as const, marginBottom:6 }}
              placeholder="e.g. Traffic, Huddle, Drill, Personal reason..."
              value={lateReason}
              onChange={(e) => setLateReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lateReason.trim() && doClockIn(lateReason)}
              autoFocus
            />

            {/* Live preview of what scope will be recorded */}
            {lateReason.trim() && (() => {
              const r = lateReason.toLowerCase();
              const scope = r.includes("huddle") ? "Huddle" : r.includes("drill") ? "Drills" : "Idle / No Task";
              const color = scope === "Huddle" ? "#1d4ed8" : scope === "Drills" ? "#ff7043" : "#475569";
              const bg    = scope === "Huddle" ? "#eff6ff" : scope === "Drills" ? "#fff3ef" : "#f1f5f9";
              return (
                <div style={{ background: bg, border:`1px solid ${color}33`, borderRadius:7, padding:"6px 10px", marginBottom:6, fontSize:11 }}>
                  Late period will be recorded as: <span style={{ color, fontWeight:700 }}>{scope}</span>
                </div>
              );
            })()}

            {!lateReason.trim() && (
              <div style={{ fontSize:11, color:"#ef4444", marginBottom:6 }}>Reason is required to proceed.</div>
            )}

            <div style={{ fontSize:11, color:MUTED, marginBottom:16 }}>
              The period from shift start to now will be auto-saved with the detected scope.
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { setModal(null); setLateReason(""); }}
                style={{ flex:1, background:"#f0f2f8", color:"#1a1a2e", border:"none", borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Cancel
              </button>
              <button onClick={() => { if (!lateReason.trim()) return; doClockIn(lateReason); }}
                style={{ flex:2, background: lateReason.trim() ? "#c2410c" : "#d1d5db", color:"#fff", border:"none", borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:700, cursor: lateReason.trim() ? "pointer" : "not-allowed" }}>
                Confirm Clock In
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.type === "ot_reason" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}>
          <div style={{ background:"#fff", borderRadius:14, padding:28, width:360, boxShadow:"0 8px 40px #0003" }}>
            <div style={{ fontSize:16, fontWeight:800, color:"#7c2d12", marginBottom:6 }}>⏱ Overtime Detected</div>
            <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, padding:"10px 14px", marginBottom:14 }}>
              <div style={{ fontSize:13, color:"#991b1b", fontWeight:600 }}>
                You have worked <b>{formatDuration(otMinutes)}</b> beyond {selectedShift === "G" ? "9" : "8"} hours today
              </div>
              <div style={{ fontSize:11, color:"#b91c1c", marginTop:3 }}>
                Total worked: {formatDuration(
                  todayEvents.filter((e) => e.endTime).reduce((s, e) => s + Math.round((new Date(e.endTime!).getTime() - new Date(e.startTime).getTime()) / 1000), 0)
                )} · Standard shift: {selectedShift === "G" ? "9h" : "8h"} · Grace: {OT_GRACE_MINUTES} min
              </div>
            </div>
            <div style={{ fontSize:12, color:MUTED, marginBottom:8 }}>Please provide a reason for the overtime. This will be recorded in the log.</div>
            <input
              style={{ width:"100%", border:`1px solid ${BORDER}`, borderRadius:8, padding:"9px 10px", fontSize:13, outline:"none", boxSizing:"border-box" as const, marginBottom:6 }}
              placeholder="e.g. Pending task, Team support, Backlog clearance..."
              value={otReason}
              onChange={(e) => setOtReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && otReason.trim()) {
                   saveEvent({ id: generateId(), date: today, login: currentUser, mile: selectedMile, shiftCode: (selectedShift || "X") as ShiftKey, scope: "OT", functionType: "OT", startTime: new Date().toISOString(), endTime: new Date().toISOString(), duration: otMinutes, note: otReason });
                   refreshEvents(); setModal(null); setOtReason("");
                   clearLastClockOut(); idleIdRef.current = generateId(); appOpenRef.current = new Date();
                }
              }}
              autoFocus
            />
            {!otReason.trim() && (
              <div style={{ fontSize:11, color:"#ef4444", marginBottom:8 }}>Reason is required to proceed.</div>
            )}
            <div style={{ fontSize:11, color:MUTED, marginBottom:16 }}>Overtime duration will be recorded as OT in the activity log.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={() => { setModal(null); setOtReason(""); clearLastClockOut(); idleIdRef.current = generateId(); appOpenRef.current = new Date(); }}
                style={{ flex:1, background:"#f0f2f8", color:"#1a1a2e", border:"none", borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Skip
              </button>
              <button onClick={() => {
                if (!otReason.trim()) return;
                saveEvent({ id: generateId(), date: today, login: currentUser, mile: selectedMile, shiftCode: (selectedShift || "X") as ShiftKey, scope: "OT", functionType: "OT", startTime: new Date().toISOString(), endTime: new Date().toISOString(), duration: otMinutes, note: otReason });
                refreshEvents(); setModal(null); setOtReason("");
                clearLastClockOut(); idleIdRef.current = generateId(); appOpenRef.current = new Date();
              }} style={{ flex:2, background: otReason.trim() ? "#dc2626" : "#d1d5db", color:"#fff", border:"none", borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:700, cursor: otReason.trim() ? "pointer" : "not-allowed" }}>
                Confirm OT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Screen Lock Return Modal ── */}
      {modal?.type === "lock_screen_return" && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}>
          <div style={{ background:"#fff", borderRadius:16, padding:28, width:420, boxShadow:"0 8px 48px #0004" }}>

            {/* Header */}
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <div style={{ width:44, height:44, borderRadius:"50%", background:"#fff7ed", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>🔒</div>
              <div>
                <div style={{ fontSize:16, fontWeight:800, color:"#1a1a2e" }}>Screen was locked</div>
                <div style={{ fontSize:11, color:MUTED, marginTop:2 }}>
                  Locked for <b style={{ color:"#92400e" }}>{formatDuration(modal.lockedSecs)}</b>
                </div>
              </div>
            </div>

            {/* Lock period summary — updates live based on detected keyword */}
            {(() => {
              const r       = lockReturnReason.trim().toLowerCase();
              const detected = r.includes("break") ? "Break"
                             : r.includes("huddle") ? "Huddle"
                             : r.includes("drill")  ? "Drills"
                             : null;
              const badgeColor = detected === "Break"  ? "#d97706"
                               : detected === "Huddle" ? "#1d4ed8"
                               : detected === "Drills" ? "#ff7043"
                               : "#c2410c";
              const badgeBg    = detected === "Break"  ? "#fffbeb"
                               : detected === "Huddle" ? "#eff6ff"
                               : detected === "Drills" ? "#fff3ef"
                               : "#ffedd5";
              const badgeLabel = detected ?? "Lock Screen";
              const typeLabel  = detected ? "In-Direct" : "Idle";
              return (
                <div style={{ background: detected ? "#f0fdf4" : "#fff7ed", border:`1px solid ${detected ? "#bbf7d0" : "#fed7aa"}`, borderRadius:10, padding:"10px 14px", marginBottom:14, transition:"background 0.2s" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
                    <span style={{ fontSize:11, color: detected ? "#15803d" : "#92400e", fontWeight:700 }}>
                      {detected ? "RECLASSIFIED AS" : "LOCK SCREEN RECORDED"}
                    </span>
                    <div style={{ display:"flex", gap:6 }}>
                      <span style={{ background: badgeBg, color: badgeColor, borderRadius:5, padding:"1px 8px", fontSize:10, fontWeight:700 }}>{badgeLabel}</span>
                      <span style={{ background:"#f1f5f9", color:"#475569", borderRadius:5, padding:"1px 8px", fontSize:10, fontWeight:600 }}>{typeLabel}</span>
                    </div>
                  </div>
                  <div style={{ fontSize:22, fontWeight:800, color: detected ? "#22c55e" : "#fb923c" }}>{formatDuration(modal.lockedSecs)}</div>
                  <div style={{ fontSize:10, color:MUTED, marginTop:2 }}>
                    Will resume: <span style={{ color:"#1a1a2e", fontWeight:600 }}>{selectedMile} — {modal.prevScope || selectedScope}</span>
                  </div>
                </div>
              );
            })()}

            {/* Quick-pick buttons */}
            <div style={{ display:"flex", gap:8, marginBottom:10 }}>
              {[
                { label:"☕ Break",  val:"Break"  },
                { label:"🗣️ Huddle", val:"Huddle" },
                { label:"🔔 Drill",  val:"Drill"  },
              ].map(({ label, val }) => {
                const active = lockReturnReason.toLowerCase().includes(val.toLowerCase());
                return (
                  <button key={val}
                    onClick={() => setLockReturnReason(val)}
                    style={{ flex:1, background: active ? "#f0fdf4" : "#f8fafc", color: active ? "#15803d" : "#475569",
                      border:`1px solid ${active ? "#86efac" : "#e2e8f0"}`, borderRadius:8, padding:"6px 0",
                      fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Reason input */}
            <div style={{ fontSize:12, color:"#374151", fontWeight:600, marginBottom:6 }}>
              Reason for lock / absence <span style={{ color:MUTED, fontWeight:400 }}>(optional)</span>
            </div>
            <input
              style={{ width:"100%", border:`1.5px solid ${BORDER}`, borderRadius:8, padding:"9px 12px", fontSize:13, outline:"none", boxSizing:"border-box" as const, marginBottom:16, color:"#1a1a2e" }}
              placeholder="e.g. Break, Huddle, Drill, Personal..."
              value={lockReturnReason}
              onChange={(e) => setLockReturnReason(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLockReturn(lockReturnReason)}
              autoFocus
            />

            {/* Actions */}
            <div style={{ display:"flex", gap:10 }}>
              <button
                onClick={() => handleLockReturn("")}
                style={{ flex:1, background:"#f0f2f8", color:"#475569", border:"none", borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:700, cursor:"pointer" }}>
                Skip &amp; Resume
              </button>
              <button
                onClick={() => handleLockReturn(lockReturnReason)}
                style={{ flex:2, background: GREEN, color:"#fff", border:"none", borderRadius:8, padding:"10px 0", fontSize:13, fontWeight:800, cursor:"pointer" }}>
                ▶ Resume {modal.prevScope || selectedScope}
              </button>
            </div>

            <div style={{ fontSize:10, color:MUTED, marginTop:10, textAlign:"center" as const }}>
              Lock screen period has been recorded. Clicking Resume starts a new clock-in.
            </div>
          </div>
        </div>
      )}

      {modal?.type === "lp_investigation" && (() => {
        const INR_TO_USD   = 0.011;
        const planRow      = LP_PLAN_DATA.find(r => r.mile === modal.mile);
        const perPersonHrs    = planRow ? planRow.hrsRequired / planRow.plannedHC : null;
        const perPersonInvTgt = perPersonHrs ? Math.ceil(perPersonHrs / 3) : null;

        const invNum    = parseInt(lpInvCount)  || 0;
        const invINR    = parseFloat(lpInvValue) || 0;
        const cppINR    = parseFloat(lpInvCpp)   || 0;
        const invUSD    = parseFloat((invINR  * INR_TO_USD).toFixed(2));
        const cppUSD    = parseFloat((cppINR  * INR_TO_USD).toFixed(2));

        const invMet   = perPersonInvTgt !== null && invNum >= perPersonInvTgt;
        const invPct   = perPersonInvTgt ? Math.min(Math.round(invNum / perPersonInvTgt * 100), 100) : 0;
        const invColor = invNum === 0 ? MUTED : invMet ? GREEN : invPct >= 70 ? "#d97706" : "#dc2626";

        // All three fields required
        const canSave  = invNum > 0 && invINR > 0 && cppINR > 0;

        const handleSubmitInv = () => {
          if (!canSave) return;
          saveLPInvestigation({ eventId: modal.eventId, login: currentUser, date: modal.date, mile: modal.mile, noOfInv: invNum, valueUSD: invUSD, cppValueUSD: cppUSD });
          setModal(null); setLpInvCount(""); setLpInvValue(""); setLpInvCpp("");
          idleIdRef.current = generateId(); appOpenRef.current = new Date();
        };

        // Shared INR field style
        const inrInputStyle = (active: boolean, color: string): React.CSSProperties => ({
          width:"100%", border:`2px solid ${active ? color : BORDER}`, borderRadius:10,
          padding:"10px 12px", fontSize:20, fontWeight:800, outline:"none",
          boxSizing:"border-box" as const, color:"#1a1a2e", textAlign:"center" as const,
          background: active ? "#fffbeb" : "#fff", transition:"border-color 0.2s",
        });

        const InrConversion = ({ inr, color }: { inr: number; color: string }) => inr > 0 ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" as const, marginTop:5, padding:"4px 10px", background:"#f0f9ff", borderRadius:6, border:"1px solid #bae6fd" }}>
            <span style={{ fontSize:10, color:"#0369a1", fontWeight:700 }}>= USD</span>
            <span style={{ fontSize:13, fontWeight:900, color }}>${(inr * INR_TO_USD).toFixed(2)}</span>
            <span style={{ fontSize:10, color:MUTED }}>₹1 = $0.011</span>
          </div>
        ) : null;

        return (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}>
            <div style={{ background:"#fff", borderRadius:16, padding:28, width:440, boxShadow:"0 8px 48px #0004" }}>

              {/* Header */}
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
                <div style={{ width:44, height:44, borderRadius:"50%", background:"#f0fdf4", display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, flexShrink:0 }}>🔍</div>
                <div>
                  <div style={{ fontSize:16, fontWeight:800, color:"#1a1a2e" }}>LP Session Complete</div>
                  <div style={{ fontSize:11, color:MUTED, marginTop:2 }}>
                    <span style={{ background:"#eff6ff", color:"#1e40af", borderRadius:4, padding:"1px 7px", fontSize:10, fontWeight:700 }}>{modal.mile}</span>
                    &nbsp;·&nbsp;<b style={{ color:"#1a1a2e" }}>{currentUser}</b>&nbsp;·&nbsp;{modal.date}
                  </div>
                </div>
              </div>

              {/* ── Investigations — WITH target ── */}
              <div style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between" as const, alignItems:"center", marginBottom:6 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:"#374151" }}>Investigations completed</div>
                  {perPersonInvTgt !== null && (
                    <div style={{ background:"#eff6ff", color:"#1e40af", borderRadius:6, padding:"2px 10px", fontSize:11, fontWeight:700 }}>Target: {perPersonInvTgt}</div>
                  )}
                </div>
                <input
                  type="number" min="0"
                  style={{ width:"100%", border:`2px solid ${invNum > 0 ? invColor : BORDER}`, borderRadius:10, padding:"10px 12px", fontSize:26, fontWeight:800, outline:"none", boxSizing:"border-box" as const, color:"#1a1a2e", textAlign:"center" as const, transition:"border-color 0.2s" }}
                  placeholder="0"
                  value={lpInvCount}
                  onChange={(e) => setLpInvCount(e.target.value)}
                  autoFocus
                />
                {perPersonInvTgt !== null && invNum > 0 && (
                  <div style={{ marginTop:6 }}>
                    <div style={{ display:"flex", justifyContent:"space-between" as const, marginBottom:3 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:invColor }}>
                        {invMet ? "✓ Target met!" : invPct >= 70 ? "⚠ Almost there" : "✗ Below target"}
                      </span>
                      <span style={{ fontSize:11, fontWeight:700, color:invColor }}>{invNum} / {perPersonInvTgt}</span>
                    </div>
                    <div style={{ height:5, background:"#e5e7eb", borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:"100%", width:`${invPct}%`, background:invColor, borderRadius:3, transition:"width 0.3s" }} />
                    </div>
                  </div>
                )}
              </div>

              {/* ── Two value fields side by side ── */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>

                {/* Intervene Value */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                    Intervene Value
                    <span style={{ background:"#fef9c3", color:"#854d0e", borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:700 }}>₹</span>
                  </div>
                  <input
                    type="number" min="0" step="1"
                    style={inrInputStyle(invINR > 0, "#d97706")}
                    placeholder="₹ 0"
                    value={lpInvValue}
                    onChange={(e) => setLpInvValue(e.target.value)}
                  />
                  <InrConversion inr={invINR} color="#d97706" />
                </div>

                {/* CPP Raised Value */}
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:"#374151", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                    CPP Raised Value
                    <span style={{ background:"#fce7f3", color:"#9d174d", borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:700 }}>₹</span>
                  </div>
                  <input
                    type="number" min="0" step="1"
                    style={inrInputStyle(cppINR > 0, "#9d174d")}
                    placeholder="₹ 0"
                    value={lpInvCpp}
                    onChange={(e) => setLpInvCpp(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmitInv()}
                  />
                  <InrConversion inr={cppINR} color="#9d174d" />
                </div>
              </div>

              {/* Combined USD summary strip */}
              {(invINR > 0 || cppINR > 0) && (
                <div style={{ display:"flex", gap:8, marginBottom:14 }}>
                  {invINR > 0 && (
                    <div style={{ flex:1, background:"#fffbeb", border:"1px solid #fde68a", borderRadius:8, padding:"6px 10px", textAlign:"center" as const }}>
                      <div style={{ fontSize:9, fontWeight:700, color:"#854d0e", textTransform:"uppercase" as const, letterSpacing:0.8 }}>Intervene</div>
                      <div style={{ fontSize:15, fontWeight:900, color:"#d97706" }}>${invUSD.toFixed(2)}</div>
                    </div>
                  )}
                  {cppINR > 0 && (
                    <div style={{ flex:1, background:"#fdf2f8", border:"1px solid #fbcfe8", borderRadius:8, padding:"6px 10px", textAlign:"center" as const }}>
                      <div style={{ fontSize:9, fontWeight:700, color:"#9d174d", textTransform:"uppercase" as const, letterSpacing:0.8 }}>CPP Raised</div>
                      <div style={{ fontSize:15, fontWeight:900, color:"#9d174d" }}>${cppUSD.toFixed(2)}</div>
                    </div>
                  )}
                  {invINR > 0 && cppINR > 0 && (
                    <div style={{ flex:1, background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:8, padding:"6px 10px", textAlign:"center" as const }}>
                      <div style={{ fontSize:9, fontWeight:700, color:"#166534", textTransform:"uppercase" as const, letterSpacing:0.8 }}>Total</div>
                      <div style={{ fontSize:15, fontWeight:900, color:"#166534" }}>${(invUSD + cppUSD).toFixed(2)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Validation hint */}
              {!canSave && (
                <div style={{ marginBottom:10, padding:"7px 12px", background:"#fef2f2", border:"1px solid #fecaca", borderRadius:8, fontSize:11, color:"#dc2626", fontWeight:600, textAlign:"center" as const }}>
                  {[invNum === 0 && "investigations count", invINR === 0 && "Intervene Value", cppINR === 0 && "CPP Raised Value"].filter(Boolean).join(" · ") + " required"}
                </div>
              )}

              {/* Save */}
              <button
                onClick={handleSubmitInv}
                disabled={!canSave}
                style={{ width:"100%", background: canSave ? GREEN : "#d1d5db", color: canSave ? "#fff" : "#9ca3af", border:"none", borderRadius:8, padding:"13px 0", fontSize:14, fontWeight:800, cursor: canSave ? "pointer" : "not-allowed", transition:"background 0.2s" }}>
                ✓ Save & Continue
              </button>
            </div>
          </div>
        );
      })()}



    </div>
  );
}
