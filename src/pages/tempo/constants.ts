// TEMPO Constants
export const OWNER          = "prdmano";
export const OWNER_PASSWORD = "Pradeep@123";  // owner login password

export const SHIFTS = {
  G:  { label: "G Shift (General)", start: "09:00", end: "18:00" },  // 09:00 AM – 06:00 PM, 9 hrs
  M:  { label: "M Shift",           start: "06:00", end: "14:00" },  // 8 hrs
  M2: { label: "M2 Shift",          start: "07:00", end: "15:00" },  // 07:00 AM – 03:00 PM, 8 hrs
  E:  { label: "E Shift",           start: "14:30", end: "22:30" },  // 02:30 PM – 10:30 PM, 8 hrs
  N:  { label: "N Shift",           start: "22:00", end: "06:00" },  // 10:00 PM – 06:00 AM, 8 hrs
  X:  { label: "X Shift (Custom)",  start: null,    end: null    },  // User-defined
};

export const MILES = [
  "ATS", "FC", "JPOPS", "SGOPS", "AUOPS",
  "GSF", "RCP", "SIG", "SM", "INTACT", "AM"
];

export const PROCESS_SCOPES = [
  "Direct",
  "Indirect",
  "Innovation",
  "Drills",
  "Huddle",
  "Break",
  "Idle",
  "OT",
];

export const FUNCTION_TYPES: Record<string, string> = {
  Direct: "Direct",
  Indirect: "Indirect",
  Innovation: "Innovation",
  Drills: "Indirect",
  Huddle: "Indirect",
  Break: "In-Direct",
  Idle: "Idle",
  OT: "OT",
};

export const SCOPE_COLORS: Record<string, string> = {
  // Direct group
  "LP":                               "#22c55e",
  "Audit":                            "#16a34a",
  "Shift Managing":                   "#15803d",
  "IDS/Alarm monitoring":             "#4ade80",
  "Major MO":                         "#86efac",
  "Report":                           "#bbf7d0",
  "TT":                               "#166534",
  "Critical Observations":            "#14532d",
  Direct:                             "#22c55e",
  // In-Direct group
  "Break":                            "#f59e0b",
  "Handover":                         "#3b82f6",
  "Huddle":                           "#1d4ed8",
  "Learning":                         "#60a5fa",
  "Rebuttals":                        "#93c5fd",
  Indirect:                           "#3b82f6",
  // Innovation group
  "New Initiative/C2CMRS/Other develop": "#9333ea",
  Innovation:                         "#9333ea",
  // Idle group
  "Idle / No Task":                   "#94a3b8",
  "Early Log Out":                    "#f87171",
  "Lock Screen":                      "#fb923c",
  Idle:                               "#94a3b8",
  // Other
  Drills:                             "#ff7043",
  OT:                                 "#e53935",
  "In-Direct":                        "#3b82f6",
};

export const LATE_GRACE_MINUTES = 15;
export const OT_GRACE_MINUTES = 15;

export type ShiftKey = keyof typeof SHIFTS;

export interface TimeEvent {
  id: string;
  date: string; // YYYY-MM-DD
  login: string;
  mile: string;
  shiftCode: ShiftKey;
  scope: string;
  functionType: string;
  startTime: string; // ISO
  endTime: string | null; // ISO
  duration: number; // seconds
  note?: string;
  isManual?: boolean;
}
