import { TimeEvent, OWNER, OWNER_PASSWORD } from "./constants";

const STORAGE_KEY   = "tempo_events";
const USER_KEY      = "tempo_current_user";
const MANAGERS_KEY  = "tempo_managers";   // [{ login, password }]
const SHIFT_KEY     = "tempo_daily_shift";

// ── Simple hash (not cryptographic — used only for basic obfuscation) ─────────
export function hashPassword(pw: string): string {
  let h = 0;
  for (let i = 0; i < pw.length; i++) {
    h = Math.imul(31, h) + pw.charCodeAt(i) | 0;
  }
  return h.toString(36);
}

export function getStoredUser(): string {
  return localStorage.getItem(USER_KEY) || "";
}

export function setStoredUser(login: string) {
  localStorage.setItem(USER_KEY, login);
}

// Manager credentials: [{ login, passwordHash }]
interface ManagerCred { login: string; passwordHash: string; }

export function getManagerCreds(): ManagerCred[] {
  try {
    const raw = localStorage.getItem(MANAGERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function setManagerCreds(creds: ManagerCred[]) {
  localStorage.setItem(MANAGERS_KEY, JSON.stringify(creds));
}

export function addManagerCred(login: string, password: string) {
  const creds = getManagerCreds();
  const idx = creds.findIndex((c) => c.login === login);
  const entry = { login: login.toLowerCase().trim(), passwordHash: hashPassword(password) };
  if (idx >= 0) creds[idx] = entry; else creds.push(entry);
  setManagerCreds(creds);
}

export function removeManagerCred(login: string) {
  setManagerCreds(getManagerCreds().filter((c) => c.login !== login));
}

export function verifyDashboardLogin(login: string, password: string): "owner" | "manager" | null {
  const l = login.toLowerCase().trim();
  // Owner check
  if (l === OWNER && password === OWNER_PASSWORD) return "owner";
  // Manager check
  const creds = getManagerCreds();
  const cred  = creds.find((c) => c.login === l);
  if (cred && cred.passwordHash === hashPassword(password)) return "manager";
  return null;
}

// Legacy getManagers (kept for any remaining references)
export function getManagers(): string[] {
  return getManagerCreds().map((c) => c.login);
}
export function setManagers(_managers: string[]) { /* no-op — use addManagerCred */ }

export function getAllEvents(): TimeEvent[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveEvent(event: TimeEvent) {
  const events = getAllEvents();
  const idx = events.findIndex((e) => e.id === event.id);
  if (idx >= 0) {
    events[idx] = event;
  } else {
    events.push(event);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
}

export function getEventsForUser(login: string): TimeEvent[] {
  return getAllEvents().filter((e) => e.login === login);
}

export function getEventsForDate(login: string, date: string): TimeEvent[] {
  return getEventsForUser(login).filter((e) => e.date === date);
}

export function getTodayStr(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

// ── Daily shift lock ──────────────────────────────────────────────────────────
// Once a user selects and clocks in with a shift for a given date, it is stored
// and cannot be changed for the rest of that calendar day.
export function getDailyShift(login: string): string {
  try {
    const raw = localStorage.getItem(SHIFT_KEY);
    if (!raw) return "";
    const { login: l, date, shift } = JSON.parse(raw);
    if (l === login && date === getTodayStr()) return shift as string;
  } catch { /* */ }
  return "";
}

export function setDailyShift(login: string, shift: string) {
  localStorage.setItem(SHIFT_KEY, JSON.stringify({
    login, date: getTodayStr(), shift,
  }));
}

export function clearDailyShift() {
  localStorage.removeItem(SHIFT_KEY);
}

// ── Last clock-out persistence ────────────────────────────────────────────
// Stores the clock-out snapshot so idle gaps can be recorded even after
// the user closes / refreshes the page without clocking back in.
const LAST_CLOCKOUT_KEY = "tempo_last_clockout";

export interface LastClockOut {
  login:     string;
  date:      string;       // YYYY-MM-DD (the date the clock-out happened)
  time:      string;       // ISO timestamp of the clock-out
  shiftCode: string;       // e.g. "G"
  mile:      string;
}

export function setLastClockOut(data: LastClockOut) {
  try { localStorage.setItem(LAST_CLOCKOUT_KEY, JSON.stringify(data)); } catch {}
}

export function getLastClockOut(): LastClockOut | null {
  try {
    const raw = localStorage.getItem(LAST_CLOCKOUT_KEY);
    return raw ? (JSON.parse(raw) as LastClockOut) : null;
  } catch { return null; }
}

export function clearLastClockOut() {
  try { localStorage.removeItem(LAST_CLOCKOUT_KEY); } catch {}
}

// ── LP Investigation Records ──────────────────────────────────────────────────
// Stored separately from TimeEvents — keyed by eventId (the LP clock-out event id)
const LP_INV_KEY = "tempo_lp_investigations";

export interface LPInvestigation {
  eventId:      string;   // matches the LP TimeEvent id
  login:        string;
  date:         string;   // YYYY-MM-DD
  mile:         string;
  noOfInv:      number;   // number of investigations done
  valueUSD:     number;   // intervene value (USD, converted from INR)
  cppValueUSD:  number;   // CPP raised value (USD, converted from INR)
}

export function getAllLPInvestigations(): LPInvestigation[] {
  try {
    const raw = localStorage.getItem(LP_INV_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveLPInvestigation(inv: LPInvestigation) {
  const all = getAllLPInvestigations();
  const idx = all.findIndex((r) => r.eventId === inv.eventId);
  if (idx >= 0) all[idx] = inv; else all.push(inv);
  localStorage.setItem(LP_INV_KEY, JSON.stringify(all));
}

export function getLPInvestigationsForDate(login: string, date: string): LPInvestigation[] {
  return getAllLPInvestigations().filter((r) => r.login === login && r.date === date);
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function toHHMM(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

export function getShiftAvailability(
  shifts: Record<string, { start: string | null; end: string | null }>
): Record<string, boolean> {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const result: Record<string, boolean> = {};

  for (const [key, shift] of Object.entries(shifts)) {
    if (key === "X") {
      result[key] = true;
      continue;
    }
    if (!shift.start) {
      result[key] = true;
      continue;
    }

    const [sh, sm] = shift.start.split(":").map(Number);
    const [eh, em] = (shift.end || "23:59").split(":").map(Number);
    const startMin = sh * 60 + sm;
    let endMin = eh * 60 + em;

    // Night shift crosses midnight
    if (endMin < startMin) {
      // Available from startMin to midnight + 0 to endMin next day
      // Simplified: available if nowMinutes >= startMin - 60 OR nowMinutes <= endMin + 60
      const available =
        nowMinutes >= startMin - 60 || nowMinutes <= endMin + 60;
      result[key] = available;
    } else {
      result[key] = nowMinutes >= startMin - 60 && nowMinutes <= endMin + 60;
    }
  }

  return result;
}
