import { useEffect, useRef, useCallback, useState } from "react";
import * as d3 from "d3";
import { feature } from "topojson-client";
import {
  LayoutDashboard, Calendar, CheckSquare, MessageSquare,
  Moon, Users, Search, Globe, Bell, Hash, Smile, Paperclip,
  Image as ImageIcon, CheckCircle2, Circle, Languages, Sparkles,
  ChevronLeft, ChevronRight, Plus, X, RefreshCw, ArrowRight,
} from "lucide-react";
import glyphToday from "./assets/constellation/glyph_today.svg";
import nebulaBg from "./assets/community/nebula.jpg";
import geminiPatternBg from "./assets/community/gemini_pattern.png";
import geminiIcon from "./assets/community/gemini_icon.svg";
import searchIcon from "./assets/community/search_icon.svg";
import todayDots from "./assets/community/today_dots.svg";
import todayPill from "./assets/community/today_pill.svg";
import starPlain from "./assets/community/star_plain.svg";
import satStar from "./assets/community/sat_star.svg";
import satIcon from "./assets/community/sat_icon.svg";
import satDots from "./assets/community/sat_dots.svg";
import satPill from "./assets/community/sat_pill.svg";
import chevronLeft from "./assets/community/chevron_left.svg";
import chevronRight from "./assets/community/chevron_right.svg";
import missionStar from "./assets/community/mission_star.svg";
import missionStarDim from "./assets/community/mission_star_dim.svg";
import missionCheck from "./assets/community/mission_check.svg";
import foldIcon from "./assets/community/fold_icon.svg";
import coworkAvatarActive from "./assets/community/cowork_avatar_active.svg";
import coworkAvatarEnded from "./assets/community/cowork_avatar_ended.svg";
import smalltalkMara from "./assets/community/smalltalk_mara.jpg";
import smalltalkKenji from "./assets/community/smalltalk_kenji.jpg";
import smileyIcon from "./assets/community/smiley_icon.svg";

// ── Types ─────────────────────────────────────────────────────────────────────

type Person = {
  initials: string; name: string; dept: string; online: boolean;
  offset: string; time: string; workHours: string;
};
type Marker = { id: string; name: string; lat: number; lon: number; color: string; members: Person[] };
type V3 = [number, number, number];

// ── Globe data — 100 cities, each with a generated team roster ────────────────
//
// Deterministic PRNG so the roster is stable across reloads (no flicker on
// hot-reload / repeat visits) without hand-authoring ~100+ people.

function mulberry32(seed: number) {
  return function rand() {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
function slugify(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Marker colour now encodes real working-hours status, not a random mix:
//  #FFF4A1 = active   — local time is within the 09:00-18:00 workday
//  #373E4E = inactive — outside working hours, OR randomly on leave
// Reference viewer is a Korean (KST) teammate at 09:15 — matches the header clock.
const ACTIVE_COLOR = "#FFF4A1";
const INACTIVE_COLOR = "#373E4E";
const INACTIVE_HOVER_COLOR = "#C2C9E7"; // hover highlight, inactive markers only
const ON_LEAVE_CHANCE = 0.15; // a few people are on leave even during their working hours

function computeActive(rand: () => number, tz: { time: string }): boolean {
  const localHour = parseInt(tz.time.split(":")[0], 10);
  const withinWorkHours = localHour >= 9 && localHour < 18;
  const onLeave = rand() < ON_LEAVE_CHANCE;
  return withinWorkHours && !onLeave;
}

// Rough local time, relative to a fixed reference (Korea/Japan, UTC+9, 09:15 —
// matches the header clock). Not timezone-accurate, just plausible for a demo.
function tzFor(lon: number) {
  const REF_UTC = 9;
  const cityUTC = Math.round(lon / 15);
  let diff = cityUTC - REF_UTC;
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  const totalMin = 9 * 60 + 15 + diff * 60;
  const norm = ((totalMin % 1440) + 1440) % 1440;
  const time = `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
  const offset = diff === 0 ? "±0h" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}h`;
  return { offset, time };
}

const FIRST_NAMES = [
  "Marcus", "Priya", "Aria", "Noah", "Grace", "Oliver", "Elise", "Felix", "Liam", "Sofia",
  "Ken", "Yuki", "Mei", "Hana", "Diego", "Lucas", "Emma", "Ava", "Mason", "Ethan",
  "Zoe", "Ivy", "Leo", "Nina", "Omar", "Sara", "Ali", "Chen", "Wei", "Ravi",
  "Anika", "Tom", "Jack", "Ella", "Ruby", "Max", "Sam", "Kai", "Nora", "Iris",
];
const DEPTS = ["Finance", "People", "Design", "Product", "Engineering", "Marketing", "Sales", "Support", "Data", "Legal", "Ops"];
const WORK_HOURS = ["09:00-18:00", "10:00-19:00", "08:00-17:00", "09:30-18:30", "11:00-20:00"];

function makePerson(rand: () => number, tz: { offset: string; time: string }, active: boolean): Person {
  const name = FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)];
  const dept = DEPTS[Math.floor(rand() * DEPTS.length)];
  const initials = (name[0] + (name[1] ?? "")).toUpperCase();
  const workHours = WORK_HOURS[Math.floor(rand() * WORK_HOURS.length)];
  return { initials, name, dept, online: active, offset: tz.offset, time: tz.time, workHours };
}

// [name, lat, lon] — a broad global spread so the globe reads as a real network.
const CITY_SEED: [string, number, number][] = [
  ["Tokyo", 35.7, 139.7], ["Osaka", 34.7, 135.5], ["Seoul", 37.6, 127.0], ["Busan", 35.1, 129.0],
  ["Beijing", 39.9, 116.4], ["Shanghai", 31.2, 121.5], ["Shenzhen", 22.5, 114.1], ["Guangzhou", 23.1, 113.3],
  ["Hong Kong", 22.3, 114.2], ["Taipei", 25.0, 121.6], ["Singapore", 1.4, 103.8], ["Kuala Lumpur", 3.1, 101.7],
  ["Bangkok", 13.8, 100.5], ["Jakarta", -6.2, 106.8], ["Manila", 14.6, 121.0], ["Ho Chi Minh City", 10.8, 106.7],
  ["Hanoi", 21.0, 105.8], ["Sydney", -33.9, 151.2], ["Melbourne", -37.8, 145.0], ["Brisbane", -27.5, 153.0],
  ["Perth", -31.9, 115.9], ["Auckland", -36.8, 174.8], ["Wellington", -41.3, 174.8], ["Mumbai", 19.1, 72.9],
  ["Delhi", 28.6, 77.2], ["Bangalore", 13.0, 77.6], ["Chennai", 13.1, 80.3], ["Hyderabad", 17.4, 78.5],
  ["Kolkata", 22.6, 88.4], ["Colombo", 6.9, 79.9], ["Dhaka", 23.8, 90.4], ["Karachi", 24.9, 67.0],
  ["Islamabad", 33.7, 73.0], ["Dubai", 25.2, 55.3], ["Abu Dhabi", 24.5, 54.4], ["Riyadh", 24.7, 46.7],
  ["Doha", 25.3, 51.5], ["Tel Aviv", 32.1, 34.8], ["Istanbul", 41.0, 28.9], ["Ankara", 39.9, 32.9],
  ["London", 51.5, -0.1], ["Manchester", 53.5, -2.2], ["Dublin", 53.3, -6.3], ["Paris", 48.9, 2.3],
  ["Lyon", 45.8, 4.8], ["Berlin", 52.5, 13.4], ["Munich", 48.1, 11.6], ["Frankfurt", 50.1, 8.7],
  ["Hamburg", 53.6, 10.0], ["Amsterdam", 52.4, 4.9], ["Rotterdam", 51.9, 4.5], ["Brussels", 50.8, 4.4],
  ["Zurich", 47.4, 8.5], ["Geneva", 46.2, 6.1], ["Vienna", 48.2, 16.4], ["Prague", 50.1, 14.4],
  ["Warsaw", 52.2, 21.0], ["Budapest", 47.5, 19.0], ["Madrid", 40.4, -3.7], ["Barcelona", 41.4, 2.2],
  ["Lisbon", 38.7, -9.1], ["Porto", 41.2, -8.6], ["Rome", 41.9, 12.5], ["Milan", 45.5, 9.2],
  ["Stockholm", 59.3, 18.1], ["Oslo", 59.9, 10.7], ["Copenhagen", 55.7, 12.6], ["Helsinki", 60.2, 24.9],
  ["Athens", 38.0, 23.7], ["Moscow", 55.8, 37.6], ["Kyiv", 50.5, 30.5], ["Cairo", 30.0, 31.2],
  ["Lagos", 6.5, 3.4], ["Nairobi", -1.3, 36.8], ["Johannesburg", -26.2, 28.0], ["Cape Town", -33.9, 18.4],
  ["Casablanca", 33.6, -7.6], ["Accra", 5.6, -0.2], ["Addis Ababa", 9.0, 38.7], ["New York", 40.7, -74.0],
  ["Los Angeles", 34.1, -118.2], ["San Francisco", 37.8, -122.4], ["Seattle", 47.5, -121.5], ["Chicago", 41.9, -87.6],
  ["Boston", 42.4, -71.1], ["Austin", 30.3, -97.7], ["Denver", 39.7, -105.0], ["Miami", 25.8, -80.2],
  ["Toronto", 43.7, -79.4], ["Vancouver", 49.3, -123.1], ["Montreal", 45.5, -73.6], ["Mexico City", 19.4, -99.1],
  ["Guadalajara", 20.7, -103.3], ["Sao Paulo", -23.6, -46.6], ["Rio de Janeiro", -22.9, -43.2], ["Buenos Aires", -34.6, -58.4],
  ["Santiago", -33.4, -70.6], ["Bogota", 4.7, -74.1], ["Lima", -12.0, -77.0], ["Montevideo", -34.9, -56.2],
];

// A few well-known hubs get bigger rosters; everything else is randomised 1-6.
const MEMBER_COUNT_OVERRIDES: Record<string, number> = {
  tokyo: 8, vancouver: 21, singapore: 12, london: 15, "new-york": 18, seoul: 10,
};
// Keep the original Figma reference person exactly as designed.
const MEMBER_OVERRIDES: Record<string, Partial<Person>> = {
  tokyo: { name: "Mika", dept: "Finance", initials: "MI", workHours: "10:00-19:00" },
  // The one night-owl on the whole globe: Marcus (Paris) pulling overtime.
  paris: { name: "Marcus", dept: "Finance", initials: "MC", online: true, workHours: "09:00-18:00" },
};
// Real-world local time overrides (accounting for actual UTC offset / DST),
// used where tzFor()'s rough ±15°-per-hour approximation isn't accurate enough
// to matter — right now just Paris, since it's called out by name in the UI.
// Paris is CEST (UTC+2) in August; Korea is fixed UTC+9 → 7h behind Korea.
const TZ_OVERRIDES: Record<string, { offset: string; time: string }> = {
  paris: { offset: "−7h", time: "02:15" },
};
const OVERTIME_ID = "paris";

const MARKERS: Marker[] = CITY_SEED.map(([name, lat, lon]) => {
  const id = slugify(name);
  const rand = mulberry32(hashStr(id));
  const tz = TZ_OVERRIDES[id] ?? tzFor(lon);
  const active = computeActive(rand, tz); // draw before the roster so member counts stay unaffected
  // The single night-owl: Marcus in Paris lights up yellow like an active
  // city, but only he is actually online — the rest of the Paris team sleeps.
  const isOvertimeCity = id === OVERTIME_ID;
  const color = active || isOvertimeCity ? ACTIVE_COLOR : INACTIVE_COLOR;
  const count = MEMBER_COUNT_OVERRIDES[id] ?? 1 + Math.floor(rand() * 6);
  const members: Person[] = Array.from({ length: count }, (_, i) =>
    makePerson(rand, tz, active || (isOvertimeCity && i === 0))
  );
  if (MEMBER_OVERRIDES[id]) members[0] = { ...members[0], ...MEMBER_OVERRIDES[id] };
  return { id, name, lat, lon, color, members };
});

// Day/night terminator — the "subsolar" meridian is wherever local time is
// 12:00 noon right now, derived from the same reference used everywhere else
// (Korea/KST, currently 09:15). Used to paint a soft day↔night gradient
// across the globe so "active" countries visually sit on the lit side.
const REF_UTC_OFFSET = 9;
const REF_LOCAL_MIN = 9 * 60 + 15; // 09:15
const SUBSOLAR_LON = (REF_UTC_OFFSET + (720 - REF_LOCAL_MIN) / 60) * 15;
const NIGHT_CENTER: [number, number] = [SUBSOLAR_LON + 180, 0];

// ── Globe constants ───────────────────────────────────────────────────────────

// γ = 23.5° is Earth's axial tilt — never changes, ever.
const AXIAL_TILT = 23.5;

// Initial view centred on Asia-Pacific; tilt baked in.
const INITIAL_ROTATION: V3 = [-127, -15, AXIAL_TILT];

const AUTO_ROTATE_SPEED = 0.0405; // °/frame — idle drift, 35% faster than 0.03 (reverted from the 45% step)
const FRICTION = 0.88;           // inertia decay after release

// Base radius — 30% smaller than the original 920 px full-bleed design.
// Scroll wheel zooms zoomRef which scales this at runtime.
const BASE_RADIUS = 644;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 2.2;

// ── UI sub-components ─────────────────────────────────────────────────────────

function Avatar({ initials, color = "#4D9FFF", size = 28, online = false }: {
  initials: string; color?: string; size?: number; online?: boolean;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex items-center justify-center rounded-xl text-[9px] font-bold w-full h-full"
        style={{ background: `${color}22`, border: `1px solid ${color}44`, color }}
      >
        {initials}
      </div>
      {online && (
        <div
          className="absolute rounded-full border border-[#070d1a]"
          style={{ width: 8, height: 8, background: "#4ade80", bottom: -1, right: -1 }}
        />
      )}
    </div>
  );
}

// Hover card shown when pointing at a city marker on the globe.
// Mirrors Figma node 799:93862 — gradient card + "Send DM" CTA.
function PersonCard({ m }: { m: Marker }) {
  const p = m.members[0];
  const extra = m.members.length - 1;
  return (
    <div
      className="flex flex-col items-start gap-[10px] rounded-[13px] border p-4"
      style={{ width: 210, borderColor: "#505256", background: "linear-gradient(180deg, #222631 0%, #151920 100%)" }}
    >
      <div className="flex items-center gap-3 border-l-2 border-transparent pl-[2px]">
        <div className="relative shrink-0" style={{ width: 28, height: 28 }}>
          <div
            className="flex h-full w-full items-center justify-center rounded-xl text-[10px] font-semibold"
            style={{ background: "rgba(194,201,231,0.13)", border: "1px solid rgba(194,201,231,0.27)", color: "#c2c9e7" }}
          >
            {p.initials}
          </div>
          {p.online && (
            <div
              className="absolute rounded-full border"
              style={{ width: 8, height: 8, background: "#4ade80", borderColor: "#070d1a", right: -1, bottom: -1 }}
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <div className="flex items-center gap-1 whitespace-nowrap">
            <span className="text-[14px] font-bold text-[#e8edf8] tracking-[-0.28px]">{p.name}</span>
            <span className="text-[12px] text-[#55585f]">{p.dept}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[12px] text-[#55585f]">{m.name}</span>
            <span
              className="rounded-full text-[10px] font-bold text-[#55585f]"
              style={{ background: "#252932", padding: "0 4px", lineHeight: "16px" }}
            >
              {p.offset}
            </span>
          </div>
        </div>
      </div>
      <div className="flex w-full flex-col gap-[7px]">
        <div className="text-[38px] font-medium leading-none text-[#e8edf8]">{p.time}</div>
        <div className="flex w-full items-start justify-between text-[12px] tracking-[-0.24px] text-[#cecece]">
          <span>Working hour</span>
          <span>{p.workHours}</span>
        </div>
        {extra > 0 && (
          <div className="text-[10px] font-semibold" style={{ color: "#5a7099" }}>
            +{extra} more in {m.name}
          </div>
        )}
      </div>
      <div className="flex w-full items-center justify-center rounded-full" style={{ background: "#b4d1f3", padding: "6px 16px" }}>
        <span className="text-[16px] font-semibold" style={{ color: "#0d1a14" }}>Send DM</span>
      </div>
    </div>
  );
}

function UserCircle({ fill = "white", size = 32 }: { fill?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect x="0.5" y="0.5" width="31" height="31" rx="15.5" fill={fill} stroke="#595761" />
      <path
        d="M16 16C17.933 16 19.5 14.433 19.5 12.5C19.5 10.567 17.933 9 16 9C14.067 9 12.5 10.567 12.5 12.5C12.5 14.433 14.067 16 16 16ZM16 17.5C13.33 17.5 8 18.84 8 21.5V23H24V21.5C24 18.84 18.67 17.5 16 17.5Z"
        fill="#595761"
      />
    </svg>
  );
}

// Small colored avatar chip used in the Golden Window bar. Mirrors Figma's
// header avatar stack (node 813:26275) — each person gets a distinct tint.
function Chip({ initials, bg, color }: { initials: string; bg: string; color: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border-2 border-white shrink-0"
      style={{ width: 28, height: 28, background: bg, marginRight: -6 }}
    >
      <span className="text-[10px] font-semibold" style={{ color }}>{initials}</span>
    </div>
  );
}

const GOLDEN_LEFT = [
  { initials: "AC", bg: "#00b296", color: "#ffffff" },
  { initials: "HL", bg: "#fff4a1", color: "#222631" },
  { initials: "YP", bg: "#b4d1f3", color: "#0a0f15" },
  { initials: "AC", bg: "#fad4ea", color: "#0a0f15" },
];
const GOLDEN_RIGHT = [
  { initials: "VE", bg: "#00b296", color: "#ffffff" },
  { initials: "WL", bg: "#fff4a1", color: "#222631" },
];

// Live KST clock (minutes since midnight, fractional for smooth animation).
function useKstMinutes() {
  const [minutes, setMinutes] = useState(() => kstMinutesNow());
  useEffect(() => {
    const id = setInterval(() => setMinutes(kstMinutesNow()), 1000);
    return () => clearInterval(id);
  }, []);
  return minutes;
}
function kstMinutesNow() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul", hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute") + get("second") / 60;
}

const WORK_START_MIN = 9 * 60; // 09:00
const WORK_END_MIN = 18 * 60; // 18:00

function GoldenWindowBar() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nowMin = useKstMinutes();
  // Bar starts full at 09:00 and shrinks from the right edge, hitting 0 width at 18:00.
  const elapsed = Math.min(Math.max(nowMin - WORK_START_MIN, 0), WORK_END_MIN - WORK_START_MIN);
  const rightInset = (elapsed / (WORK_END_MIN - WORK_START_MIN)) * 100;

  // Opens on hover; once open, only closes when the user clicks outside it.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="flex-1 min-w-0" style={{ pointerEvents: "auto" }}>
      <div className="flex justify-between px-0 mb-1">
        {["09:00", "12:00", "15:00", "18:00"].map((t) => (
          <span key={t} className="text-[13px] text-[#797979]" style={{ fontFamily: "Inter, sans-serif" }}>{t}</span>
        ))}
      </div>
      <div ref={wrapRef} className="relative h-12 rounded-full bg-[#131820] border border-[#303644]">
        <div
          className="absolute top-0 h-full bg-white rounded-full flex items-center justify-between px-6 overflow-hidden cursor-pointer"
          style={{ left: "0%", right: `${rightInset}%`, transition: "right 1s linear" }}
          onMouseEnter={() => setOpen(true)}
        >
          <div className="flex items-center">
            {GOLDEN_LEFT.map((c, i) => <Chip key={i} {...c} />)}
            <div
              className="flex items-center justify-center rounded-full text-white text-[10px] font-semibold border-2 border-white shrink-0"
              style={{ width: 28, height: 28, background: "#00b296" }}
            >
              +5
            </div>
          </div>
          <span className="text-[#797979] text-[16px] font-semibold mx-4 whitespace-nowrap" style={{ fontFamily: "SUIT, Inter, sans-serif" }}>
            Golden Window
          </span>
          <div className="flex items-center">
            {GOLDEN_RIGHT.map((c, i) => <Chip key={i} {...c} />)}
          </div>
        </div>
        {open && <ActiveTeamMembersPopover />}
      </div>
    </div>
  );
}

// Hover popover on the Golden Window bar — mirrors Figma "Active Team Members"
// (node 575:44021): reuses the same roster shown in RightSidebar's Time Zone list.
function ActiveTeamMembersPopover() {
  return (
    <div
      className="absolute rounded-[20px] border border-[#2b2c2d] overflow-hidden flex flex-col"
      style={{
        top: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", width: 313, maxHeight: 420,
        background: "#1a1b1d", boxShadow: "0 16px 40px rgba(0,0,0,0.5)", zIndex: 40,
      }}
    >
      <div className="border-b border-[rgba(77,159,255,0.12)] px-4 py-4 shrink-0">
        <span className="text-white text-[16px] font-semibold" style={{ fontFamily: "Inter, sans-serif" }}>Active Team Members</span>
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col">
        {TZ_MEMBERS.map((m, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[rgba(77,159,255,0.06)]">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar initials={m.initials} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} online={true} />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[14px] font-semibold text-[#e8edf8]" style={{ fontFamily: "Inter, sans-serif" }}>{m.name}</span>
                  <span className="text-[12px] text-[#55585f]" style={{ fontFamily: "Inter, sans-serif" }}>{m.dept}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[12px] text-[#55585f]" style={{ fontFamily: "Inter, sans-serif" }}>{m.city}</span>
                  <span className="text-[10px] text-[#55585f] font-semibold px-1.5 rounded-full" style={{ background: "#252932", lineHeight: "16px" }}>{m.offset}</span>
                </div>
              </div>
            </div>
            <span className="text-[24px] font-bold text-[#e8edf8] shrink-0" style={{ fontFamily: "Inter, sans-serif" }}>{m.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type View = "dashboard" | "chat" | "calendar" | "while-asleep" | "community";

const NAV_ITEMS: { icon: typeof LayoutDashboard; label: string; view: View | null; badge: string | null }[] = [
  { icon: LayoutDashboard, label: "Dashboard",    view: "dashboard",    badge: null },
  { icon: Calendar,        label: "Calendar",     view: "calendar",     badge: null },
  { icon: CheckSquare,     label: "Task List",    view: null,           badge: null },
  { icon: MessageSquare,   label: "Work Chat",    view: "chat",         badge: null },
  { icon: Moon,            label: "While Asleep", view: "while-asleep", badge: "3"  },
  { icon: Users,           label: "Community",    view: "community",   badge: null },
];

// Shared app chrome — mirrors Figma node 813:26275 (yellow logo, coloured
// Golden Window avatar stack, notification bell).
function Header() {
  return (
    <header
      className="absolute top-0 left-0 right-0 flex items-end gap-3 p-4"
      style={{
        height: 112, // matches Figma (813:26275) — was 80, clipping the time-label row above the Golden Window bar
        background: "rgba(4,7,14,0.60)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(43,44,45,0.5)",
        zIndex: 30,
        pointerEvents: "none",
      }}
    >
      <div className="flex items-center gap-2.5 shrink-0" style={{ width: 208 }}>
        <div className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 28, height: 28, background: "#FFF4A1" }}>
          <Globe size={16} color="#222631" strokeWidth={2} />
        </div>
        <span className="text-[14px] font-semibold text-[#e8edf8] tracking-tight">서비스명</span>
      </div>

      <GoldenWindowBar />

      <div className="flex items-center gap-3 shrink-0" style={{ width: 272 }}>
        <div
          className="flex flex-1 items-center gap-2 px-4 rounded-full border"
          style={{ height: 48, background: "#131820", borderColor: "#303644" }}
        >
          <span className="text-[16px] text-[#e0e5eb]">17 June</span>
          <div style={{ width: 1, height: 16, background: "rgba(255,255,255,0.2)" }} />
          <span className="text-[16px] text-[#e0e5eb]">09:15 (KST)</span>
        </div>
        <div
          className="flex items-center justify-center rounded-full border shrink-0"
          style={{ width: 48, height: 48, background: "#131820", borderColor: "#303644" }}
        >
          <Bell size={20} color="#bfc7d4" strokeWidth={1.8} />
        </div>
      </div>
    </header>
  );
}

function LeftSidebar({ view, onNavigate }: { view: View; onNavigate: (v: View) => void }) {
  return (
    <aside
      className="absolute flex flex-col rounded-[20px] border border-[#2b2c2d] overflow-hidden"
      style={{
        top: 128, left: 16, bottom: 16, width: 208,
        background: "rgba(26,27,29,0.92)",
        backdropFilter: "blur(16px)",
        zIndex: 20,
        pointerEvents: "auto",
      }}
    >
      <nav className="flex-1 flex flex-col gap-0.5 p-3 pt-4">
        {NAV_ITEMS.map(({ icon: Icon, label, view: itemView, badge }) => {
          const active = itemView !== null && itemView === view;
          return (
            <button
              key={label}
              onClick={() => itemView && onNavigate(itemView)}
              disabled={!itemView}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl w-full text-left transition-colors"
              style={{
                background: active ? "rgba(158,168,208,0.1)" : "transparent",
                border: active ? "1px solid rgba(158,168,208,0.25)" : "1px solid transparent",
                color: active ? "#faffdd" : "#657084",
                cursor: itemView ? "pointer" : "default",
              }}
            >
              <Icon size={16} strokeWidth={1.8} />
              <span className="flex-1 text-[14px] font-semibold tracking-tight" style={{ fontFamily: "Inter, sans-serif" }}>
                {label}
              </span>
              {badge && (
                <span className="flex items-center justify-center rounded-full text-white text-[10px] font-semibold" style={{ width: 16, height: 16, background: "#657084" }}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="border-t border-[rgba(194,201,231,0.12)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar initials="AC" online={true} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-[14px] font-semibold text-[#e8edf8]" style={{ fontFamily: "Inter, sans-serif" }}>Aria</span>
              <span className="text-[12px] text-[#55585f]" style={{ fontFamily: "Inter, sans-serif" }}>Korea</span>
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[12px] text-[#55585f]" style={{ fontFamily: "Inter, sans-serif" }}>KST</span>
              <span className="text-[10px] text-[#55585f] font-semibold px-1 rounded-full" style={{ background: "#252932", lineHeight: "16px" }}>
                16:22
              </span>
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-[#05df72] shrink-0" />
        </div>
      </div>
    </aside>
  );
}

// Mirrors Figma node 813:26278 — the full Time Zone roster.
const TZ_MEMBERS = [
  { initials: "AC", name: "Aria",     dept: "Design",      city: "Vancouver",   offset: "+16h", time: "09:15" },
  { initials: "MI", name: "Mika",     dept: "Finance",     city: "Tokyo",       offset: "±0h",  time: "09:15" },
  { initials: "PR", name: "Priya",    dept: "People",      city: "New York",    offset: "−13h", time: "20:15" },
  { initials: "AC", name: "Aria",     dept: "Design",      city: "Vancouver",   offset: "−16h", time: "17:15" },
  { initials: "LI", name: "Lina",     dept: "Data",        city: "Singapore",   offset: "−1h",  time: "08:15" },
  { initials: "PR", name: "Priya",    dept: "People",      city: "London",      offset: "−9h",  time: "00:15" },
  { initials: "KT", name: "Kenji",    dept: "Product",     city: "Osaka",       offset: "±0h",  time: "09:15" },
  { initials: "ML", name: "Mei",      dept: "Data",        city: "Shanghai",    offset: "−1h",  time: "08:15" },
  { initials: "RS", name: "Raj",      dept: "Operations",  city: "Mumbai",      offset: "−4h",  time: "05:45" },
  { initials: "EV", name: "Elena",    dept: "Design",      city: "Moscow",      offset: "−6h",  time: "03:15" },
  { initials: "AK", name: "Anna",     dept: "People",      city: "Stockholm",   offset: "−7h",  time: "02:15" },
  { initials: "AO", name: "Amara",    dept: "Marketing",   city: "Lagos",       offset: "−8h",  time: "01:15" },
  { initials: "KA", name: "Kwame",    dept: "Support",     city: "Accra",       offset: "−9h",  time: "00:15" },
  { initials: "LR", name: "Lucas",    dept: "Finance",     city: "São Paulo",   offset: "−12h", time: "21:15" },
  { initials: "LO", name: "Liam",     dept: "Engineering", city: "Toronto",     offset: "−13h", time: "20:15" },
  { initials: "IG", name: "Isabella", dept: "Legal",       city: "Mexico City", offset: "−14h", time: "19:15" },
];
const AVATAR_COLORS = ["#4D9FFF", "#8b7fe8", "#00b296", "#e07bc4", "#f2a94e", "#4ecdc4"];

const ACTIVE_REGIONS = [
  { city: "Seoul",     time: "16:21", tz: "KST", color: "#4ade80", textColor: "#4d9fff" },
  { city: "New York",  time: "09:21", tz: "CET", color: "#4ade80", textColor: "#00d4b4" },
  { city: "Vancouver", time: "12:51", tz: "IST", color: "#4ade80", textColor: "#a78bfa" },
  { city: "Tokyo",     time: "16:21", tz: "JST", color: "#4ade80", textColor: "#f472b6" },
];

function RightSidebar() {
  return (
    <aside
      className="absolute flex flex-col rounded-[20px] border border-[#2b2c2d] overflow-hidden"
      style={{
        top: 128, right: 16, bottom: 16, width: 272,
        background: "rgba(26,27,29,0.92)",
        backdropFilter: "blur(16px)",
        zIndex: 20,
        pointerEvents: "auto",
      }}
    >
      <div className="border-b border-[rgba(77,159,255,0.12)] px-4 py-4">
        <span className="text-white text-[16px] font-semibold" style={{ fontFamily: "Inter, sans-serif" }}>Time Zone</span>
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 bg-[#252932] rounded-xl px-3 py-1.5">
          <Search size={14} color="#5a7099" strokeWidth={1.8} />
          <span className="text-[12px] text-[#5a7099]" style={{ fontFamily: "Inter, sans-serif" }}>Search team members...</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto flex flex-col">
        {TZ_MEMBERS.map((m, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[rgba(77,159,255,0.06)]">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar initials={m.initials} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} online={true} />
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[14px] font-semibold text-[#e8edf8]" style={{ fontFamily: "Inter, sans-serif" }}>{m.name}</span>
                  <span className="text-[12px] text-[#55585f]" style={{ fontFamily: "Inter, sans-serif" }}>{m.dept}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[12px] text-[#55585f]" style={{ fontFamily: "Inter, sans-serif" }}>{m.city}</span>
                  <span className="text-[10px] text-[#55585f] font-semibold px-1.5 rounded-full" style={{ background: "#252932", lineHeight: "16px" }}>{m.offset}</span>
                </div>
              </div>
            </div>
            <span className="text-[24px] font-bold text-[#e8edf8] shrink-0" style={{ fontFamily: "Inter, sans-serif" }}>{m.time}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-[rgba(77,159,255,0.12)] px-4 py-4">
        <p className="text-[10px] font-semibold tracking-[0.5px] uppercase mb-2" style={{ color: "#5a7099", fontFamily: "Inter, sans-serif" }}>
          지금 업무 중인 지역
        </p>
        <div className="flex flex-col gap-1.5">
          {ACTIVE_REGIONS.map(({ city, time, tz, color, textColor }) => (
            <div key={city} className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
              <span className="flex-1 text-[10px] text-[#e8edf8]" style={{ fontFamily: "Inter, sans-serif" }}>{city}</span>
              <span className="text-[10px] font-medium" style={{ color: textColor, fontFamily: "Inter, sans-serif" }}>{time}</span>
              <span className="text-[9px] text-[#5a7099]" style={{ fontFamily: "Inter, sans-serif" }}>{tz}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ── Work Chat screen ─────────────────────────────────────────────────────────
// Mirrors Figma node 806:94270 ("소통창 진입"). Rendered in place of the globe
// when the "Work Chat" nav item is active.

const CHANNELS = {
  Public: [
    { name: "announcements", badge: "@1", badgeColor: "#fd6e8d" },
    { name: "general", badge: "5", badgeColor: "#657084" },
  ],
  Teams: [
    { name: "Frontend", badge: "3", badgeColor: "#657084" },
    { name: "Backend", badge: null },
    { name: "Design", badge: "1", badgeColor: "#657084" },
  ],
  Projects: [
    { name: "auth-module", badge: "@2", badgeColor: "#fd6e8d" },
    { name: "sprint-3", badge: "4", badgeColor: "#657084" },
    { name: "deploy-pipeline", badge: null },
  ],
};
const DIRECT_MESSAGES = [
  { initials: "MC", name: "Marcus", active: true },
  { initials: "AC", name: "Aria", active: false },
  { initials: "AC", name: "Aria", active: false },
];

function ChannelSidebar() {
  return (
    <aside
      className="flex flex-col overflow-y-auto shrink-0 border-r"
      style={{ width: 200, borderColor: "rgba(255,255,255,0.07)", paddingLeft: 10, paddingRight: 11 }}
    >
      {(Object.entries(CHANNELS) as [string, typeof CHANNELS.Public][]).map(([group, items]) => (
        <div key={group} className="w-full py-4">
          <p className="text-[13px] font-semibold mb-1" style={{ color: "#bfc7d4", fontFamily: "SUIT, Inter, sans-serif" }}>{group}</p>
          {items.map((c) => (
            <button key={c.name} className="flex w-full items-center gap-1.5 py-2 text-left">
              <span className="text-[13px] font-medium shrink-0" style={{ color: "#e2e8f4" }}>#</span>
              <span className="flex-1 min-w-0 truncate text-[13px] font-semibold" style={{ color: "#e2e8f4" }}>{c.name}</span>
              {c.badge && (
                <span
                  className="shrink-0 rounded-full text-[10px] font-semibold px-1.5"
                  style={{ background: c.badgeColor, color: c.badgeColor === "#657084" ? "#bfc7d4" : "#fff", lineHeight: "16px" }}
                >
                  {c.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      <div className="w-full py-4">
        <p className="text-[13px] font-semibold mb-1" style={{ color: "#bfc7d4", fontFamily: "SUIT, Inter, sans-serif" }}>Direct</p>
        {DIRECT_MESSAGES.map((d, i) => (
          <button
            key={i}
            className="flex w-full items-center gap-[7px] rounded-xl"
            style={{
              padding: 9,
              background: d.active ? "rgba(158,168,208,0.1)" : "transparent",
              border: d.active ? "1px solid rgba(158,168,208,0.25)" : "1px solid transparent",
            }}
          >
            <div
              className="flex items-center justify-center rounded-xl shrink-0"
              style={{ width: 28, height: 28, background: "rgba(77,159,255,0.13)", border: "1px solid rgba(77,159,255,0.27)" }}
            >
              <span className="text-[10px] font-semibold" style={{ color: "#4d9fff" }}>{d.initials}</span>
            </div>
            <span className="text-[13px]" style={{ color: d.active ? "#faffdd" : "#657084", fontFamily: d.active ? "SUIT, Inter, sans-serif" : "Inter, sans-serif", fontWeight: d.active ? 600 : 500 }}>
              {d.name}
            </span>
          </button>
        ))}
      </div>
    </aside>
  );
}

function WorkChatHeader() {
  return (
    <div className="flex items-center justify-between border-b px-[17.5px] pt-3.5 pb-px shrink-0" style={{ borderColor: "#222631" }}>
      <div className="flex items-center gap-3.5">
        <span className="text-[16px] font-semibold text-white" style={{ fontFamily: "SUIT, Inter, sans-serif" }}>Work Chat</span>
        <div className="flex items-center gap-3.5">
          <div className="pb-1.5 border-b-2" style={{ borderColor: "#b4d1f3" }}>
            <span className="text-[10.5px] font-medium" style={{ color: "#b4d1f3" }}>All</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10.5px] font-medium" style={{ color: "#657084" }}>@mentions</span>
            <span className="flex items-center justify-center rounded-full text-[10px] font-semibold" style={{ width: 16, height: 16, background: "#b4d1f3", color: "#222631" }}>3</span>
          </div>
        </div>
      </div>
      <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: "#222631" }}>
        <div className="px-3.5 py-1.5">
          <span className="text-[10.5px] font-medium" style={{ color: "#657084" }}>Feed</span>
        </div>
        <div className="px-3.5 py-1.5" style={{ background: "rgba(255,244,161,0.2)" }}>
          <span className="text-[10.5px] font-medium" style={{ color: "#faffdd" }}>Chat</span>
        </div>
      </div>
    </div>
  );
}

type Reaction = { emoji: string; count: number };
type Message = {
  id: string; sender: string; initials: string; avatarBg: string; avatarBorder: string; avatarColor: string;
  time: string; text: string; reactions: Reaction[]; replies: number; repliesAgo: string; self?: boolean;
};

const CHAT_MESSAGES: Message[] = [
  {
    id: "m1", sender: "Marcus Dahl", initials: "MD", avatarBg: "rgba(6,44,155,0.3)", avatarBorder: "#062c9b", avatarColor: "#4c8eda",
    time: "9:55 AM", text: "Q2 expense report is finalized — total came in 3% under budget. Great work on cost management 👍",
    reactions: [{ emoji: "👍", count: 2 }, { emoji: "✅", count: 1 }, { emoji: "👀", count: 1 }], replies: 3, repliesAgo: "3 min",
  },
  {
    id: "m2", sender: "Marcus Dahl", initials: "MD", avatarBg: "rgba(253,110,141,0.16)", avatarBorder: "#fd6e8d", avatarColor: "#fd6e8d",
    time: "9:55 AM", text: "@mention By the way, I still need the vendor invoice from the Seoul office. Can you check with the local team?",
    reactions: [{ emoji: "👍", count: 2 }, { emoji: "✅", count: 1 }, { emoji: "👀", count: 1 }], replies: 2, repliesAgo: "3 min",
  },
  {
    id: "m3", sender: "Aria Kim", initials: "AK", avatarBg: "rgba(0,178,150,0.18)", avatarBorder: "#00b296", avatarColor: "#4ecdc4",
    time: "9:55 AM", text: "Got it, I'll check with the Seoul team and get back to you. And yes, I'll have the P&L ready by Thursday.",
    reactions: [{ emoji: "👍", count: 2 }, { emoji: "✅", count: 1 }, { emoji: "👀", count: 1 }], replies: 3, repliesAgo: "3 min",
    self: true,
  },
];

function ChatBubble({ m }: { m: Message }) {
  return (
    <div className="flex items-start gap-2 w-full">
      <div
        className="rounded-full shrink-0 flex items-center justify-center"
        style={{ width: 32, height: 32, background: m.avatarBg, border: `1.5px solid ${m.avatarBorder}` }}
      >
        <span className="text-[10px] font-semibold" style={{ color: m.avatarColor }}>{m.initials}</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col items-start">
        <div className="flex items-center gap-2 py-1">
          <span className="text-[14px] font-semibold" style={{ color: "#e2e8f4" }}>{m.sender}</span>
          <span className="text-[12px]" style={{ color: "#6b7a99" }}>{m.time}</span>
        </div>
        <button className="flex items-center gap-1 p-1 -ml-1">
          <Languages size={16} color="#6063ee" strokeWidth={1.8} />
          <span className="text-[12px]" style={{ color: "#6063ee" }}>Translation</span>
        </button>
        <div className="rounded-tr-xl rounded-br-xl rounded-bl-xl px-4 py-3" style={{ borderTopLeftRadius: 4, background: "#222631" }}>
          <p className="text-[16px] leading-[22px] font-medium" style={{ color: "#d2d6e1" }}>{m.text}</p>
        </div>
        <div className="flex items-end gap-0.5 py-2">
          {m.reactions.map((r, i) => (
            <div key={i} className="flex items-center gap-1 rounded h-5 px-1" style={{ background: "#29292d", color: "#a8b4cc" }}>
              <span className="text-[11px]">{r.emoji}</span>
              <span className="text-[11px] font-medium">{r.count}</span>
            </div>
          ))}
          <div className="flex items-center justify-center rounded h-5 px-1" style={{ background: "#29292d" }}>
            <Smile size={16} color="#a8b4cc" strokeWidth={1.8} />
          </div>
        </div>
        <div className="flex items-center gap-1 h-6">
          <span className="text-[13px] font-semibold" style={{ color: "#4ecdc4" }}>💬 {m.replies} replies</span>
          <span className="text-[12px]" style={{ color: "#6b7a99" }}>{m.repliesAgo}</span>
        </div>
      </div>
    </div>
  );
}

const TONE_PILLS = ["Tone Assist", "Professional", "Collaborative", "Direct"];

function ChatInput() {
  return (
    <div className="shrink-0 px-3.5 pt-2.5">
      <div className="rounded-xl border" style={{ background: "#131820", borderColor: "#303644" }}>
        <div className="border-b px-4 pt-2 pb-2.5" style={{ borderColor: "#303644" }}>
          <span className="text-[12px]" style={{ color: "#434a5c" }}>Enter a message</span>
        </div>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Paperclip size={20} color="#d2d6e1" strokeWidth={1.7} />
            <ImageIcon size={20} color="#d2d6e1" strokeWidth={1.7} />
            <Smile size={20} color="#d2d6e1" strokeWidth={1.7} />
            <div className="w-px h-3.5 mx-1" style={{ background: "rgba(255,255,255,0.07)" }} />
            {TONE_PILLS.map((label) => (
              <div
                key={label}
                className="flex items-center gap-1 rounded-lg border px-2.5 py-1 opacity-50"
                style={{ background: "#222631", borderColor: "#d2d6e1" }}
              >
                {label === "Tone Assist" && <Sparkles size={11} color="#d2d6e1" strokeWidth={2} />}
                <span className="text-[12px]" style={{ color: "#d2d6e1" }}>{label}</span>
              </div>
            ))}
          </div>
          <div className="rounded-lg px-3 py-1" style={{ background: "#303644" }}>
            <span className="text-[16px] font-semibold" style={{ color: "#657084" }}>Send</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const DECISIONS = [
  { title: "Q3 budget closed 3% under target", meta: "Cost optimization approved", time: "Today 12:05" },
  { title: "Vendor contract renewal approved", meta: "Marcus reviewing terms", time: "Yesterday 15:30" },
];
const ACTION_ITEMS = [
  { title: "Q3 budget forecast draft", who: "Marcus", when: "Today PM", done: false },
  { title: "Vendor invoice collection", who: "Aria", when: "Today 4 PM", done: false },
  { title: "Board meeting P&L prep", who: "Marcus", when: "Done", done: true },
  { title: "Seoul office expense report", who: "Aria", when: "Tomorrow", done: false },
];

function ActionsPanel() {
  return (
    <aside
      className="absolute flex flex-col rounded-[20px] border border-[#2b2c2d] overflow-hidden overflow-y-auto"
      style={{
        top: 128, right: 16, bottom: 16, width: 280,
        background: "rgba(26,27,29,0.92)",
        backdropFilter: "blur(16px)",
        zIndex: 20,
        pointerEvents: "auto",
      }}
    >
      <div className="border-b border-[rgba(77,159,255,0.12)] px-4 py-3.5">
        <span className="text-white text-[16px] font-semibold" style={{ fontFamily: "SUIT, Inter, sans-serif" }}>Decisions &amp; Actions</span>
      </div>

      <div className="p-4">
        <div className="rounded-xl border p-3" style={{ borderColor: "#303644" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold" style={{ color: "#bfc7d4" }}>Q3 Finance Review · Progress</span>
            <span className="text-[10px] font-semibold rounded-full px-2 py-0.5" style={{ background: "#252932", color: "#bfc7d4" }}>D-14</span>
          </div>
          <div className="text-[28px] font-medium text-white mb-2">60%</div>
          <div className="h-[5px] rounded-full" style={{ background: "#252932" }}>
            <div className="h-full rounded-full" style={{ width: "60%", background: "#fff4a1" }} />
          </div>
        </div>
      </div>

      <div className="px-4 pb-2">
        <p className="text-[13px] font-semibold mb-2" style={{ color: "#bfc7d4" }}>Decisions</p>
        <div className="flex flex-col gap-2">
          {DECISIONS.map((d, i) => (
            <div key={i} className="flex gap-2 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
              <div className="w-[3px] rounded-full shrink-0" style={{ background: "#fff4a1" }} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-white mb-0.5">{d.title}</p>
                <p className="text-[12px] mb-1" style={{ color: "#8b95ab" }}>{d.meta}</p>
                <p className="text-[10px]" style={{ color: "#5a7099" }}>{d.time}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-[13px] font-semibold mb-2" style={{ color: "#bfc7d4" }}>Action Items</p>
        <div className="flex flex-col gap-2">
          {ACTION_ITEMS.map((a, i) => (
            <div key={i} className="flex gap-2 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
              {a.done
                ? <CheckCircle2 size={14} color="#00d4b4" strokeWidth={2} className="shrink-0 mt-0.5" />
                : <Circle size={14} color="#5a7099" strokeWidth={1.8} className="shrink-0 mt-0.5" />}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-white mb-1">{a.title}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] rounded-full px-1.5" style={{ background: a.done ? "transparent" : "rgba(158,168,208,0.15)", color: "#bfc7d4" }}>{a.who}</span>
                  <span className="text-[11px]" style={{ color: a.done ? "#00d4b4" : "#5a7099" }}>{a.when}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

function WorkChat() {
  return (
    <div
      className="absolute flex flex-col rounded-[20px] border border-[#2b2c2d] overflow-hidden"
      style={{
        top: 128, left: 240, right: 312, bottom: 16,
        background: "#0d1117",
        zIndex: 15,
      }}
    >
      <WorkChatHeader />
      <div className="flex flex-1 min-h-0">
        <ChannelSidebar />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center justify-end px-4 py-2 border-b" style={{ borderColor: "#222631" }}>
            <span className="text-[12px]" style={{ color: "#8b95ab" }}>View in my language (KO)</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 p-4">
            {CHAT_MESSAGES.map((m) => <ChatBubble key={m.id} m={m} />)}
          </div>
          <ChatInput />
        </div>
      </div>
    </div>
  );
}

// ── Globe view (Dashboard) ───────────────────────────────────────────────────
// Everything below was the original App() — now just the globe + hover-card
// content, mounted/unmounted by the root App based on which nav item is active
// (unmounting on navigate-away also stops the rAF loop for free).

function GlobeView() {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const svgRef     = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Rotation state — mutated by rAF and drag handlers, never reset
  const rotRef = useRef<V3>([...INITIAL_ROTATION]);
  const velRef = useRef<[number, number]>([0, 0]);
  const dragging  = useRef(false);
  const lastXYRef = useRef<[number, number]>([0, 0]);

  const landRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const rafRef  = useRef<number>(0);
  const sizeRef = useRef({ w: 1920, h: 1080 });
  const zoomRef = useRef(1); // 1 = BASE_RADIUS; scroll wheel changes this

  const markerElsRef = useRef<
    Record<string, { glow: SVGCircleElement; dot: SVGCircleElement; hit: SVGCircleElement } | null>
  >({});

  // Hover card — opens on hover and then STAYS open (globe stays paused) so
  // the user can move the mouse onto the card and click "Send DM". It only
  // closes on an explicit click/tap outside the card (see the document
  // pointerdown listener below). hoveredIdRef drives per-frame positioning
  // in draw(); hoveredId (state) drives mount/unmount of the card's content.
  const hoveredIdRef = useRef<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hoverCardRef = useRef<HTMLDivElement>(null);

  const setMarkerColor = useCallback((id: string, color: string) => {
    const els = markerElsRef.current[id];
    if (els) { els.dot.setAttribute("fill", color); els.glow.setAttribute("fill", color); }
  }, []);

  const onMarkerEnter = useCallback((id: string) => {
    const prevId = hoveredIdRef.current;
    if (prevId && prevId !== id) {
      const prevM = MARKERS.find((mm) => mm.id === prevId);
      if (prevM) setMarkerColor(prevId, prevM.color);
    }
    hoveredIdRef.current = id;
    setHoveredId(id);
    velRef.current = [0, 0]; // an open card pauses the globe — kill any residual inertia too
    // Only inactive (#373E4E) markers get a hover highlight (→ #C2C9E7);
    // active markers are already at their "lit up" colour.
    const m = MARKERS.find((mm) => mm.id === id);
    if (m && m.color === INACTIVE_COLOR) setMarkerColor(id, INACTIVE_HOVER_COLOR);
  }, [setMarkerColor]);

  // Closes the card — called only from the outside-click listener, not on pointer-leave.
  const closeCard = useCallback(() => {
    const id = hoveredIdRef.current;
    if (!id) return;
    hoveredIdRef.current = null;
    setHoveredId(null);
    if (hoverCardRef.current) hoverCardRef.current.style.opacity = "0";
    const m = MARKERS.find((mm) => mm.id === id);
    if (m) setMarkerColor(id, m.color);
  }, [setMarkerColor]);

  // Click/tap anywhere outside the open card closes it.
  useEffect(() => {
    const onDocPointerDown = (e: PointerEvent) => {
      if (!hoveredIdRef.current) return;
      const card = hoverCardRef.current;
      if (card && card.contains(e.target as Node)) return; // clicking inside the card (e.g. Send DM)
      closeCard();
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [closeCard]);

  // ── Projection ───────────────────────────────────────────────────────────
  // The globe center is placed ~80 px below the viewport bottom, matching
  // the Figma layout where only the upper ~45 % of the sphere is visible.

  const makeProj = useCallback((w: number, h: number, rot: V3) => {
    const R = BASE_RADIUS * zoomRef.current;
    return d3.geoOrthographic()
      .scale(R)
      .translate([w / 2, h + R * 0.087 - 20])  // center below viewport, -20 shifts globe up
      .clipAngle(90)
      .rotate(rot);
  }, []);

  // ── Draw ─────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { w, h } = sizeRef.current;
    const rot = rotRef.current;
    const proj = makeProj(w, h, rot);
    const path = d3.geoPath(proj, ctx);
    const cx = w / 2;
    const R = BASE_RADIUS * zoomRef.current;
    const cy = h + R * 0.087 - 20; // matches translate

    ctx.clearRect(0, 0, w, h);

    // No sphere fill — interior is fully transparent (page background shows through).
    // Clip subsequent strokes to the sphere boundary so lines don't leak outside.
    ctx.save();
    ctx.beginPath(); path({ type: "Sphere" });
    ctx.clip();

    // Day/night terminator, part 1 — soft light wash on the sunlit hemisphere,
    // painted under everything else so graticule/land linework stays crisp on top.
    ctx.save();
    ctx.filter = "blur(46px)";
    ctx.beginPath();
    path(d3.geoCircle().center([SUBSOLAR_LON, 0]).radius(96)()!);
    ctx.fillStyle = "rgba(140, 185, 255, 0.16)";
    ctx.fill();
    ctx.restore();

    // Graticule
    ctx.beginPath(); path(d3.geoGraticule().step([15, 15])());
    ctx.strokeStyle = "rgba(191, 199, 212, 0.25)"; // #BFC7D4 at low opacity
    ctx.lineWidth = 0.5; ctx.stroke();

    // Land outlines
    if (landRef.current) {
      ctx.beginPath(); path(landRef.current);
      ctx.strokeStyle = "#BFC7D4";
      ctx.lineWidth = 0.9;
      ctx.lineJoin = "round"; ctx.stroke();
    }

    // Day/night terminator, part 2 — dim the night hemisphere over the
    // graticule/land, with a soft blurred edge so it reads as a gradient.
    ctx.save();
    ctx.filter = "blur(34px)";
    ctx.beginPath();
    path(d3.geoCircle().center(NIGHT_CENTER).radius(94)()!);
    ctx.fillStyle = "rgba(2, 4, 10, 0.72)";
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // Neon rim — layered glow to match the Figma blue band at globe edge
    // Layer 1: wide outer halo
    ctx.save();
    ctx.beginPath(); path({ type: "Sphere" });
    ctx.strokeStyle = "rgba(0, 140, 255, 0.18)";
    ctx.lineWidth = 28;
    ctx.shadowColor = "rgba(0, 160, 255, 0.9)";
    ctx.shadowBlur = 40;
    ctx.stroke();
    ctx.restore();

    // Layer 2: bright inner ring
    ctx.save();
    ctx.beginPath(); path({ type: "Sphere" });
    ctx.strokeStyle = "rgba(80, 200, 255, 0.65)";
    ctx.lineWidth = 4;
    ctx.shadowColor = "rgba(60, 180, 255, 1)";
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.restore();

    // Layer 3: crisp bright core line
    ctx.save();
    ctx.beginPath(); path({ type: "Sphere" });
    ctx.strokeStyle = "rgba(180, 230, 255, 0.90)";
    ctx.lineWidth = 1.2;
    ctx.shadowColor = "rgba(140, 210, 255, 1)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();

    // ── SVG markers ───────────────────────────────────────────────────────

    // Visibility: front hemisphere based on rotation center
    const center: [number, number] = [-rot[0], -rot[1]];

    MARKERS.forEach((m) => {
      const els = markerElsRef.current[m.id];
      if (!els) return;
      const coord: [number, number] = [m.lon, m.lat];
      const visible = d3.geoDistance(coord, center) < Math.PI / 2 - 0.05;
      const projected = proj(coord);
      // Also hide if the projected point is below the canvas
      const inViewport = projected ? projected[1] < h : false;
      const opacity = visible && projected && inViewport ? "1" : "0";
      [els.glow, els.dot].forEach(el => el.setAttribute("opacity", opacity));

      // Keep the (invisible) hit-target circle glued to the dot regardless of
      // visibility so stale coordinates never linger off-screen.
      if (projected) {
        els.hit.setAttribute("cx", String(projected[0]));
        els.hit.setAttribute("cy", String(projected[1]));
      }
      els.hit.setAttribute("opacity", opacity === "1" ? "1" : "0");
      els.hit.style.pointerEvents = opacity === "1" ? "all" : "none";

      // Hover card follows its marker every frame; hides the instant the
      // marker rotates out of view or off-screen.
      if (hoveredIdRef.current === m.id && hoverCardRef.current) {
        const card = hoverCardRef.current;
        if (visible && projected && inViewport) {
          card.style.opacity = "1";
          card.style.transform = `translate(${projected[0] + 16}px, ${projected[1] - 110}px)`;
        } else {
          card.style.opacity = "0";
        }
      }

      if (!visible || !projected || !inViewport) return;
      const [px, py] = projected;
      els.glow.setAttribute("cx", String(px)); els.glow.setAttribute("cy", String(py));
      els.dot.setAttribute("cx",  String(px)); els.dot.setAttribute("cy",  String(py));
    });
  }, [makeProj]);

  // ── Animation loop ────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    // Hovering a marker pauses rotation entirely (inertia + auto-rotate),
    // so the popup card and its dot hold still while you read/interact.
    if (!dragging.current && !hoveredIdRef.current) {
      const [vx, vy] = velRef.current;
      if (Math.abs(vx) > 0.004 || Math.abs(vy) > 0.004) {
        // Inertia — apply velocity then decay
        rotRef.current[0] += vx;
        rotRef.current[1] = Math.max(-80, Math.min(80, rotRef.current[1] + vy));
        rotRef.current[2] = AXIAL_TILT;
        velRef.current[0] *= FRICTION;
        velRef.current[1] *= FRICTION;
      } else {
        // Auto-rotate around the tilted axis (increment λ only)
        rotRef.current[0] -= AUTO_ROTATE_SPEED;
        rotRef.current[2] = AXIAL_TILT;
        velRef.current = [0, 0];
      }
    }
    draw();
    rafRef.current = requestAnimationFrame(tick);
  }, [draw]);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas  = canvasRef.current;
    const svg     = svgRef.current;
    if (!wrapper || !canvas || !svg) return;

    const syncSize = () => {
      const { width, height } = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width  = width  * dpr;
      canvas.height = height * dpr;
      canvas.style.width  = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.getContext("2d")?.scale(dpr, dpr);
      svg.setAttribute("width",  String(width));
      svg.setAttribute("height", String(height));
      sizeRef.current = { w: width, h: height };
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(wrapper);

    MARKERS.forEach((m) => {
      markerElsRef.current[m.id] = {
        glow: svg.querySelector(`#glow-${m.id}`) as SVGCircleElement,
        dot:  svg.querySelector(`#dot-${m.id}`)  as SVGCircleElement,
        hit:  svg.querySelector(`#hit-${m.id}`)  as SVGCircleElement,
      };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import("world-atlas/countries-110m.json").then((mod) => {
      const topo = mod.default as any;
      landRef.current = feature(topo, topo.objects.land) as GeoJSON.FeatureCollection;
    });

    // Wheel zoom — must be non-passive to allow preventDefault
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // deltaY: positive = scroll down = zoom out; negative = zoom in
      const factor = e.deltaY > 0 ? 0.92 : 1 / 0.92;
      zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor));
    };
    wrapper.addEventListener("wheel", onWheel, { passive: false });

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      wrapper.removeEventListener("wheel", onWheel);
    };
  }, [tick]);

  // ── Drag — simple direct-euler, no quaternion reset ───────────────────────
  //
  // The key insight: we NEVER read INITIAL_ROTATION here.
  // We always ADD to rotRef.current which holds the live globe orientation.
  // This guarantees the globe never jumps or resets on interaction.
  //
  // Sensitivity = exact 1:1 at the equator (1 px mouse = 1 px surface).

  const onDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    velRef.current = [0, 0];           // stop any residual inertia
    lastXYRef.current = [e.clientX, e.clientY];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - lastXYRef.current[0];
    const dy = e.clientY - lastXYRef.current[1];

    // Horizontal drag → change longitude (λ). Vertical → latitude (φ).
    // Signs are chosen so the surface under the cursor follows the cursor
    // (direct-manipulation drag — matches d3's standard rotate([λ+dx·k, φ−dy·k]) convention).
    // Sensitivity stays 1:1 at equator regardless of zoom level.
    const dragK = (180 / Math.PI) / (BASE_RADIUS * zoomRef.current);
    const dλ =  dx * dragK;
    const dφ = -dy * dragK;

    rotRef.current[0] += dλ;
    rotRef.current[1] = Math.max(-80, Math.min(80, rotRef.current[1] + dφ));
    rotRef.current[2] = AXIAL_TILT;   // axial tilt is always 23.5°

    // Record per-frame velocity for inertia on release
    velRef.current[0] = dλ * 0.55;
    velRef.current[1] = dφ * 0.55;

    lastXYRef.current = [e.clientX, e.clientY];
  }, []);

  const onUp = useCallback(() => { dragging.current = false; }, []);

  const hoveredMarker = hoveredId ? MARKERS.find((m) => m.id === hoveredId) ?? null : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapperRef}
      className="absolute inset-0 cursor-grab active:cursor-grabbing"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      <svg ref={svgRef} className="absolute inset-0 pointer-events-none overflow-visible">
        <defs>
          {/* One shared glow filter for all markers — was one-per-marker, wasteful at 100 cities */}
          <filter id="marker-glow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
            <feComponentTransfer in="blur" result="b2"><feFuncA type="linear" slope="2" /></feComponentTransfer>
            <feMerge><feMergeNode in="b2" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Marker dot/glow: 30% of original, then +50% → 45% of original */}
        {MARKERS.map((m) => (
          <g key={m.id}>
            <circle id={`glow-${m.id}`} r={4.95} fill={m.color} opacity={0} style={{ filter: "url(#marker-glow)" }} />
            <circle id={`dot-${m.id}`}  r={1.8} fill={m.color} stroke="rgba(255,255,255,0.25)" strokeWidth={0.68} opacity={0} />
            {/* Larger invisible hit-target so the small dot is easy to hover */}
            <circle
              id={`hit-${m.id}`} r={14} fill="transparent" opacity={0}
              style={{ cursor: "pointer" }}
              onPointerEnter={() => onMarkerEnter(m.id)}
            />
          </g>
        ))}
      </svg>

      {/* Person hover card — positioned imperatively in draw(), content mounted on hover.
          pointer-events-auto + stopPropagation so "Send DM" is clickable and doesn't
          also arm the globe-drag handler on the wrapper it sits inside. */}
      <div
        ref={hoverCardRef}
        className="absolute left-0 top-0 pointer-events-auto transition-opacity duration-150"
        style={{ opacity: 0, zIndex: 25 }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {hoveredMarker && <PersonCard m={hoveredMarker} />}
      </div>
    </div>
  );
}

// ── Calendar screen ───────────────────────────────────────────────────────────
// Mirrors Figma node 410:9029 ("캘린더"). Rendered in place of the globe when
// the "Calendar" nav item is active.

const CATEGORIES = [
  { label: "Work Tasks",  color: "#4d9fff" },
  { label: "Personal",    color: "#8b7fe8" },
  { label: "Milestones",  color: "#00d4b4" },
  { label: "Holidays",    color: "#fd6e8d" },
  { label: "Team Events", color: "#fff4a1" },
];
const UPCOMING_EVENTS = [
  { title: "Board Presentation", date: "Jun 24" },
  { title: "Team Offsite Day 1", date: "Jun 25" },
  { title: "Team Offsite Day 2", date: "Jun 26" },
  { title: "Birthday Dinner",    date: "Jun 27" },
  { title: "Month Wrap-up",      date: "Jun 30" },
];
type CalEvent = { title: string; color: string };
const CAL_EVENTS: Record<number, CalEvent[]> = {
  3:  [{ title: "Design Review",      color: "#4d9fff" }],
  4:  [{ title: "Team Standup",       color: "#fff4a1" }],
  9:  [{ title: "1:1 with Sarah",     color: "#fad4ea" }],
  10: [{ title: "Q2 OKR Review",      color: "#4d9fff" }],
  11: [{ title: "Dentist Appt.",      color: "#657084" }],
  13: [{ title: "Orbit v2.0 Launch",  color: "#00d4b4" }],
  16: [{ title: "Engineering Arch.",  color: "#00d4b4" }],
  19: [{ title: "Dentist Appt.",      color: "#657084" }],
  20: [{ title: "Dentist Appt.",      color: "#fff4a1" }],
  23: [{ title: "Strategy Workshop",  color: "#00d4b4" }],
  24: [{ title: "Board Presentation", color: "#8b7fe8" }],
  25: [{ title: "Team Offsite Day 1", color: "#00d4b4" }],
  26: [{ title: "Team Offsite Day 2", color: "#00d4b4" }],
  30: [{ title: "Month Wrap-up",      color: "#00d4b4" }],
};

// Builds a Sun-first month grid, padded with the surrounding month's days so
// every week row has 7 cells (a fixed June-2026-starts-on-Monday layout — this
// is mock prototype data, not a live calendar).
function buildMonthWeeks(firstWeekday: number, daysInMonth: number, prevMonthDays: number) {
  const cells: { day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ day: prevMonthDays - firstWeekday + 1 + i, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  let next = 1;
  while (cells.length % 7 !== 0) cells.push({ day: next++, inMonth: false });
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
const JUNE_WEEKS = buildMonthWeeks(1, 30, 31);

const TEAM_TIMEZONE = [
  { initials: "SP", name: "Soo-Yeon Park", tz: "KST",  city: "Korea",   time: "11:41 PM", status: "Off hours" },
  { initials: "PK", name: "Paulo Kim",     tz: "EDT",  city: "USA",     time: "07:41 AM", status: "Early"     },
  { initials: "LF", name: "Lena Fischer",  tz: "CEST", city: "Germany", time: "01:41 PM", status: "Working"   },
  { initials: "OK", name: "Omar Khalil",   tz: "GST",  city: "UAE",     time: "03:41 PM", status: null        },
  { initials: "AD", name: "Amara Diallo",  tz: "WAT",  city: "Nigeria", time: "12:41 PM", status: null        },
];
const KEY_EVENTS = [
  { title: "Orbit v2.0 Launch",  date: "Jun 18"    },
  { title: "Board Presentation", date: "Jun 24"    },
  { title: "Team Offsite",       date: "Jun 25-26" },
  { title: "Month Wrap-up",      date: "Jun 30"    },
];
const HOLIDAYS = [
  { flag: "🇺🇸", name: "Memorial Day", date: "Jun 1"  },
  { flag: "🇰🇷", name: "현충일",       date: "Jun 6"  },
  { flag: "🇺🇸", name: "Father's Day", date: "Jun 21" },
  { flag: "🇺🇸", name: "Juneteenth",   date: "Jun 19" },
];

function CalendarView() {
  return (
    <div
      className="absolute flex overflow-hidden rounded-[20px] border border-[#2b2c2d]"
      style={{ top: 128, left: 240, right: 312, bottom: 16, background: "#0a0f15", zIndex: 15 }}
    >
      <div
        className="flex flex-col gap-4 shrink-0 overflow-y-auto p-4"
        style={{ width: 208, borderRight: "1px solid rgba(255,255,255,0.07)" }}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-semibold text-[#e5eaf4]">JUN 2026</span>
            <div className="flex items-center gap-2 text-[#8993a5]">
              <ChevronLeft size={14} />
              <ChevronRight size={14} />
            </div>
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="text-[11px] font-semibold text-[#657084]">{d}</span>
            ))}
            {JUNE_WEEKS.flat().map((c, i) => (
              <span
                key={i}
                className="flex items-center justify-center text-[11px] rounded-full mx-auto"
                style={{
                  width: 20, height: 20,
                  color: c.inMonth ? "#e5eaf4" : "#3a4152",
                  background: c.inMonth && c.day === 23 ? "#00d4b4" : "transparent",
                }}
              >
                {c.day}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.5px] text-[#657084]">CATEGORIES</span>
          {CATEGORIES.map((c) => (
            <div key={c.label} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
              <span className="text-[13px] text-[#bfc7d4]">{c.label}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold tracking-[0.5px] text-[#657084]">UPCOMING</span>
          {UPCOMING_EVENTS.map((e) => (
            <div key={e.title} className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "#fff4a1" }} />
              <div>
                <p className="text-[12px] font-medium text-[#e5eaf4] leading-tight">{e.title}</p>
                <p className="text-[10px] text-[#657084]">{e.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-w-0 flex-col p-4 gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[20px] font-semibold text-[#e8edf8]">June 2026</span>
            <ChevronLeft size={16} color="#657084" />
            <ChevronRight size={16} color="#657084" />
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border overflow-hidden" style={{ borderColor: "#303644" }}>
              {["Month", "Week", "Day"].map((t) => (
                <span
                  key={t}
                  className="px-3 py-1.5 text-[12px] font-semibold"
                  style={{ background: t === "Month" ? "#fff4a1" : "transparent", color: t === "Month" ? "#0a0f15" : "#bfc7d4" }}
                >
                  {t}
                </span>
              ))}
            </div>
            <span className="rounded-full border px-3 py-1.5 text-[12px] font-semibold text-[#bfc7d4]" style={{ borderColor: "#303644" }}>Today</span>
            <span className="rounded-full border px-3 py-1.5 text-[12px] font-semibold text-[#bfc7d4]" style={{ borderColor: "#303644" }}>🌐 KST +09:00</span>
            <button className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#0a0f15]" style={{ background: "#fff4a1" }}>
              <Plus size={12} /> Add Event
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 text-[11px] font-semibold text-[#657084]">
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => <span key={d} className="px-2 py-1">{d}</span>)}
        </div>
        <div className="flex-1 grid gap-px overflow-hidden rounded-lg" style={{ background: "rgba(255,255,255,0.06)", gridTemplateRows: `repeat(${JUNE_WEEKS.length}, 1fr)` }}>
          {JUNE_WEEKS.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-px">
              {week.map((c, ci) => (
                <div key={ci} className="flex flex-col gap-1 p-1.5 overflow-hidden" style={{ background: "#0d1420", opacity: c.inMonth ? 1 : 0.4 }}>
                  <span className="text-[11px]" style={{ color: c.inMonth ? "#bfc7d4" : "#4e5669" }}>{c.day}</span>
                  {c.inMonth && CAL_EVENTS[c.day]?.map((ev) => (
                    <span key={ev.title} className="truncate rounded px-1 py-0.5 text-[10px] font-medium" style={{ background: ev.color + "33", color: ev.color }}>
                      {ev.title}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarRightPanel() {
  return (
    <aside
      className="absolute flex flex-col rounded-[20px] border border-[#2b2c2d] overflow-hidden overflow-y-auto"
      style={{ top: 128, right: 16, bottom: 16, width: 280, background: "rgba(26,27,29,0.92)", backdropFilter: "blur(16px)", zIndex: 20, pointerEvents: "auto" }}
    >
      <div className="flex items-center justify-between border-b border-[rgba(77,159,255,0.12)] px-4 py-4">
        <span className="text-white text-[16px] font-semibold">TEAM TIMEZONE</span>
        <span className="flex items-center gap-1 text-[10px] font-semibold text-[#4ade80]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" /> LIVE
        </span>
      </div>
      <div className="flex flex-col">
        {TEAM_TIMEZONE.map((m, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 border-b border-[rgba(77,159,255,0.06)]">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar initials={m.initials} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} online={true} />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#e8edf8] truncate">{m.name}</p>
                <p className="text-[11px] text-[#657084]">{m.tz} · {m.city}</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[13px] font-semibold text-[#e8edf8]">{m.time}</p>
              {m.status && <p className="text-[10px] text-[#5a7099]">{m.status}</p>}
            </div>
          </div>
        ))}
      </div>
      <div className="mx-4 my-3 rounded-xl px-3 py-2 text-[11px] font-semibold text-[#0a0f15]" style={{ background: "#00d4b4" }}>
        09:00–10:00 UTC · Best meeting slot
      </div>
      <div className="px-4 py-2">
        <p className="text-[11px] font-semibold tracking-[0.5px] text-[#657084] mb-2">UPCOMING KEY EVENTS</p>
        <div className="flex flex-col gap-2">
          {KEY_EVENTS.map((e) => (
            <div key={e.title} className="flex items-center justify-between">
              <span className="text-[12px] text-[#e8edf8]">{e.title}</span>
              <span className="text-[11px] text-[#657084]">{e.date}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 py-3">
        <p className="text-[11px] font-semibold tracking-[0.5px] text-[#657084] mb-2">HOLIDAYS THIS MONTH</p>
        <div className="flex flex-col gap-2">
          {HOLIDAYS.map((h) => (
            <div key={h.name} className="flex items-center justify-between">
              <span className="text-[12px] text-[#e8edf8]">{h.flag} {h.name}</span>
              <span className="text-[11px] text-[#657084]">{h.date}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

// ── While Asleep screen ───────────────────────────────────────────────────────
// Mirrors Figma node 410:8566 ("While you were asleep"). An AI-generated
// overnight briefing shown while the current view's absence window is active.

const BRIEFING_STATS = [
  { value: "5",  label: "Decisions", sub: "2 need your input" },
  { value: "1",  label: "Blockers",  sub: "Active now"        },
  { value: "12", label: "Threads",   sub: "4 unread"          },
  { value: "3",  label: "Mentions",  sub: "Awaiting reply"    },
];
const TAG_COLORS: Record<string, string> = {
  Blocker: "#fd6e8d", Decision: "#4d9fff", Feedback: "#8b7fe8", Mention: "#fff4a1", Update: "#657084",
};
const ASLEEP_FEED = [
  { id: "01", initials: "RM", tag: "Blocker",  region: "CA", time: "01:05 EST", author: "R. Müller",
    text: "CI/CD pipeline failure on staging is blocking PR #204 merge — infra team (CA) investigating since 01:05 EST. No ETA yet." },
  { id: "02", initials: "TL", tag: "Decision", region: null, time: "02:14 EST", author: "T. Lee",
    text: "Sprint scope locked to 4 features after async vote. API v3 endpoints deferred to Q3 sprint — auth dependency risk noted." },
  { id: "03", initials: "DK", tag: "Feedback", region: "JP", time: "09:20 JST", author: "D. Kim",
    text: "Design review comments posted on Prototype B — 3 unresolved threads on nav pattern, 1 on contrast ratio. Needs review before dev handoff." },
  { id: "04", initials: "YS", tag: "Mention",  region: null, time: "10:44 JST", author: "Y. Sato",
    text: "You were tagged in a discussion on timezone-aware notification defaults — 2 replies await your input on opt-in vs. opt-out policy." },
  { id: "05", initials: "•",  tag: "Update",   region: null, time: "23:50 EST", author: "System",
    text: "Retrospective cadence changed from biweekly to weekly starting next sprint. Calendar invites updated for all team members." },
];
const DECISION_HISTORY = [
  { title: "Sprint scope finalized — 4 features confirmed for current sprint", status: "Final",    author: "T. Lee",    time: "02:10 EST · 16:14 KST prev." },
  { title: "Retrospective frequency changed from biweekly → weekly",           status: "Pending",  author: "R. Müller", time: "21:30 EST · 11:30 KST prev." },
  { title: "Cross-timezone notification defaults: opt-in model proposed",      status: "Reverted", author: "Y. Sato",   time: "09:44 KST prev.", tag: "#341" },
];
const DECISION_STATUS_COLOR: Record<string, string> = { Final: "#00d4b4", Pending: "#fff4a1", Reverted: "#fd6e8d" };

function WhileAsleepView() {
  return (
    <div
      className="absolute flex flex-col overflow-hidden rounded-[20px] border border-[#2b2c2d]"
      style={{ top: 128, left: 240, right: 312, bottom: 16, background: "#0a0f15", zIndex: 15 }}
    >
      <div className="flex items-start justify-between p-4 border-b" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <div>
          <div className="flex items-center gap-2">
            <Moon size={18} color="#fff4a1" />
            <span className="text-[18px] font-semibold text-[#e8edf8]">While you were asleep</span>
            <span className="text-[13px] text-[#657084]">— 7 things happened</span>
          </div>
          <p className="text-[12px] text-[#657084] mt-1">
            Absence window: 21:00 KST → 08:30 KST · Your time now: 08:32 KST
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold text-[#bfc7d4]" style={{ borderColor: "#303644" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" /> 3 teammates online now
          </span>
          <button className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold text-[#bfc7d4]" style={{ borderColor: "#303644" }}>
            <RefreshCw size={12} /> Refresh briefing
          </button>
        </div>
      </div>

      <div className="p-4">
        <div className="rounded-xl border p-3" style={{ borderColor: "#303644", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={13} color="#fff4a1" />
            <span className="text-[12px] font-semibold text-[#bfc7d4]">AI Briefing</span>
          </div>
          <p className="text-[13px] leading-relaxed text-[#cecece] mb-3">
            Due to the decision to shorten the{" "}
            <span style={{ color: "#4d9fff" }}>Q3 sprint schedule</span>, the{" "}
            <span style={{ color: "#4d9fff" }}>authentication module</span> has been moved forward by two weeks.
            Your resource approval is the blocking factor. Leo's{" "}
            <span style={{ color: "#fd6e8d" }}>API CORS issue</span> is still unresolved and requires immediate action.
            Overall progress is <span style={{ color: "#00d4b4" }}>+12%</span> compared to last week.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {BRIEFING_STATS.map((s) => (
              <div key={s.label} className="rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                <p className="text-[20px] font-semibold text-[#e8edf8]">{s.value}</p>
                <p className="text-[11px] text-[#bfc7d4]">{s.label}</p>
                <p className="text-[10px] text-[#5a7099]">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 flex flex-col gap-3">
        {ASLEEP_FEED.map((f) => (
          <div key={f.id} className="flex gap-3 rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)" }}>
            <span className="text-[11px] text-[#4e5669] shrink-0 w-4">{f.id}</span>
            <Avatar initials={f.initials} color={TAG_COLORS[f.tag]} size={24} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="rounded-full px-1.5 text-[10px] font-semibold" style={{ background: `${TAG_COLORS[f.tag]}22`, color: TAG_COLORS[f.tag] }}>{f.tag}</span>
                {f.region && <span className="rounded-full px-1.5 text-[10px] font-semibold text-[#8b95ab]" style={{ background: "#252932" }}>{f.region}</span>}
                <span className="text-[11px] text-[#5a7099]">{f.time} · {f.author}</span>
              </div>
              <p className="text-[13px] text-[#cecece] leading-snug">{f.text}</p>
            </div>
          </div>
        ))}
        <button className="mb-2 rounded-xl py-2 text-center text-[12px] font-semibold text-[#8b95ab]" style={{ background: "rgba(255,255,255,0.02)" }}>
          + 2 more items in full briefing
        </button>
      </div>

      <div className="flex items-center justify-between border-t px-4 py-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
        <span className="text-[11px] text-[#5a7099]">Last refreshed 08:30 KST · Auto-refresh every 15 min</span>
        <button className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] font-semibold text-[#0a0f15]" style={{ background: "#fff4a1" }}>
          View full briefing <ArrowRight size={12} />
        </button>
      </div>
    </div>
  );
}

function WhileAsleepRightPanel() {
  return (
    <aside
      className="absolute flex flex-col rounded-[20px] border border-[#2b2c2d] overflow-hidden overflow-y-auto"
      style={{ top: 128, right: 16, bottom: 16, width: 280, background: "rgba(26,27,29,0.92)", backdropFilter: "blur(16px)", zIndex: 20, pointerEvents: "auto" }}
    >
      <div className="border-b border-[rgba(77,159,255,0.12)] px-4 py-4">
        <span className="text-white text-[16px] font-semibold">Decision History Timeline</span>
        <p className="text-[11px] text-[#657084] mt-1">Newest first · Absence window: 21:00 → 08:30 KST · 5 decisions</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <span className="text-[11px] text-[#5a7099]">Filter:</span>
        {["Region", "Project", "Decision status"].map((f) => (
          <span key={f} className="rounded-full border px-2 py-1 text-[10px] font-semibold text-[#bfc7d4]" style={{ borderColor: "#303644" }}>{f}</span>
        ))}
        <span className="text-[10px] font-semibold text-[#4d9fff] ml-auto">Clear</span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        {DECISION_HISTORY.map((d, i) => (
          <div key={i} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="rounded-full px-1.5 text-[10px] font-semibold" style={{ background: `${DECISION_STATUS_COLOR[d.status]}22`, color: DECISION_STATUS_COLOR[d.status] }}>
                {d.status}
              </span>
              {d.tag && <span className="text-[10px] text-[#5a7099]">{d.tag}</span>}
            </div>
            <p className="text-[13px] font-semibold text-white mb-1.5">{d.title}</p>
            <p className="text-[11px] text-[#8b95ab]">{d.author} · {d.time}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ── Community screen ──────────────────────────────────────────────────────────
// Mirrors Figma node 472:10851 ("커뮤니티") + 575:50702 (Cowork Room detail popup).

type CoworkRoom = {
  id: string; name: string; time: string; status: string; ended?: boolean;
  avatars: { i: string; c: string }[]; extra: number;
  goal: string; modalGoal: string; cta: string;
};
const COWORK_ROOMS: CoworkRoom[] = [
  {
    id: "lofi1", name: "Lo-fi Beats to Focus", time: "52 min", status: "chilling",
    avatars: [{ i: "PK", c: "#fd6e8d" }, { i: "RT", c: "#b4d1f3" }, { i: "AR", c: "#7cfbe6" }], extra: 2,
    goal: "Sprint Board Cleanup",
    modalGoal: "Low-key lo-fi playlist running in the background — drop in, put your headphones on, and get a quiet co-working hour in before the day picks up.",
    cta: "Join Lo-fi Room",
  },
  {
    id: "lofi2", name: "Lo-fi Beats to Focus", time: "52 min", status: "chilling",
    avatars: [{ i: "PK", c: "#fd6e8d" }, { i: "RT", c: "#b4d1f3" }, { i: "An", c: "#7cfbe6" }], extra: 2,
    goal: "Sprint Board Cleanup",
    modalGoal: "Low-key lo-fi playlist running in the background — drop in, put your headphones on, and get a quiet co-working hour in before the day picks up.",
    cta: "Join Lo-fi Room",
  },
  {
    id: "rnb", name: "Focus with Rnb", time: "52 min", status: "chilling",
    avatars: [{ i: "PR", c: "#8b7fe8" }, { i: "SO", c: "#c2c9e7" }], extra: 1,
    goal: "PR #42 Review",
    modalGoal: "Deep-focus block for reviewing PR #42 — join if you're heads-down on the same review queue.",
    cta: "Join Review",
  },
  {
    id: "midnight", name: "Burn the midnight oil", time: "31 min", status: "focusing",
    avatars: [{ i: "PN", c: "#fd6e8d" }], extra: 0,
    goal: "Token Edge Cases",
    modalGoal: "Late-night working session tackling token edge cases before tomorrow's release.",
    cta: "Join Session",
  },
  {
    id: "mkt1", name: "MKT Hot Discussion", time: "31 min", status: "focusing",
    avatars: [{ i: "YS", c: "#fff4a1" }, { i: "DL", c: "#b4d1f3" }], extra: 0,
    goal: "Token Edge Cases",
    modalGoal: "Open discussion room for marketing's hottest topic of the day.",
    cta: "Join Discussion",
  },
  {
    id: "mkt2", name: "MKT Hot Discussion", time: "31 min", status: "focusing",
    avatars: [{ i: "YS", c: "#fff4a1" }, { i: "HK", c: "#7cfbe6" }], extra: 0,
    goal: "Token Edge Cases",
    modalGoal: "Open discussion room for marketing's hottest topic of the day.",
    cta: "Join Discussion",
  },
  {
    id: "mkt3", name: "MKT Hot Discussion", time: "ended", status: "ended", ended: true,
    avatars: [{ i: "YS", c: "#9ea8d0" }, { i: "DL", c: "#c2c9e7" }], extra: 0,
    goal: "Token Edge Cases",
    modalGoal: "This session has wrapped up — check the recap thread for notes.",
    cta: "View Recap",
  },
];

// Exact star positions from Figma's "stars" frame (node 598:81392), expressed as
// % of the constellation card's main canvas (1049 × 515). Only THU (today) and
// SAT carry labels — the other 4 stars are plain unlabeled points.
type ConstellationStar = {
  id: string; kind: "today" | "sat" | "plain";
  cx: number; cy: number;
};
const CONSTELLATION_STARS: ConstellationStar[] = [
  { id: "a", kind: "plain", cx: 35.64, cy: 24.99 },
  { id: "c", kind: "plain", cx: 36.27, cy: 12.88 },
  { id: "d", kind: "plain", cx: 41.90, cy: 5.29 },
  { id: "b", kind: "plain", cx: 44.98, cy: 44.66 },
  { id: "today", kind: "today", cx: 48.09, cy: 17.11 },
  { id: "sat", kind: "sat", cx: 61.44, cy: 51.28 },
];
const CONSTELLATION_LINE_ORDER = ["a", "c", "d", "b", "today", "sat"];

type MissionChip = { label: string; state: "checked" | "active" | "dim" };
const MISSION_CHIPS: MissionChip[] = [
  { label: "Cowork Room 1x", state: "checked" },
  { label: "Focus 30min", state: "checked" },
  { label: "React to a post", state: "checked" },
  { label: "Post in Smalltalk", state: "active" },
  { label: "Vote in Secret Santa", state: "dim" },
  { label: "Greet a new member", state: "dim" },
  { label: "7-day streak", state: "dim" },
];

const ARIA_TAGS = ["UX", "Collaboration", "Figma", "Design System"];
const ARIA_TASKS = [
  { title: "Login Module UI Review", dot: "#fff4a1", status: "In Review", statusColor: "#fff4a1" },
  { title: "Design System Component Cleanup", dot: "#7cfbe6", status: "In Progress", statusColor: "#7cfbe6" },
  { title: "Sprint 3 Retro Prep", dot: "#bfc7d4", status: "Scheduled", statusColor: "#bfc7d4" },
  { title: "Design System Component Cleanup", dot: "#657084", status: null, statusColor: null },
  { title: "Sprint 3 Retro Prep", dot: "#657084", status: null, statusColor: null },
];
const SMALLTALK = [
  { name: "Mara", role: "Product Designer", city: "Vancouver", photo: smalltalkMara, text: "Found this incredible tiramisu at a", likes: 2, comments: 1, views: 1 },
  { name: "Kenji", role: "Operations", city: "Vancouver", photo: smalltalkKenji, text: "Meet Biscuit, my golden retriever", likes: 2, comments: 1, views: 1 },
];

function ConstellationCanvas() {
  return (
    <div className="relative w-full overflow-hidden rounded-[21px]" style={{ aspectRatio: "1049 / 515", background: "#03080a" }}>
      <img
        src={nebulaBg} alt="" className="absolute pointer-events-none"
        style={{ left: "67.9%", top: "25.7%", width: "122%", height: "166%", objectFit: "contain", mixBlendMode: "exclusion", opacity: 0.48 }}
      />
      <img
        src={geminiPatternBg} alt="" className="absolute pointer-events-none"
        style={{ left: "-25%", top: "-23%", width: "160%", height: "260%", objectFit: "cover", opacity: 0.2 }}
      />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
        <polyline
          points={CONSTELLATION_LINE_ORDER.map((id) => {
            const s = CONSTELLATION_STARS.find((x) => x.id === id)!;
            return `${s.cx},${s.cy}`;
          }).join(" ")}
          fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="0.15" vectorEffect="non-scaling-stroke"
        />
      </svg>
      {/* Soft gold halo behind today's star */}
      <span
        className="absolute rounded-full pointer-events-none"
        style={{
          left: "48.09%", top: "17.11%", width: 130, height: 130, transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(245,199,88,0.35) 0%, rgba(245,199,88,0) 70%)",
        }}
      />

      {CONSTELLATION_STARS.map((s) => (
        <div
          key={s.id}
          className="absolute flex flex-col items-center gap-1"
          style={{ left: `${s.cx}%`, top: `${s.cy}%`, transform: "translate(-50%, -50%)" }}
        >
          {s.kind === "today" && <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: "#fff4a1" }}>TODAY · THU 26</span>}
          {s.kind === "sat" && <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: "#c2c9e7" }}>SAT 28</span>}
          <img
            src={s.kind === "today" ? glyphToday : s.kind === "sat" ? satStar : starPlain}
            alt=""
            style={{ width: s.kind === "today" ? 67 : s.kind === "sat" ? 51 : 55, height: s.kind === "today" ? 67 : s.kind === "sat" ? 51 : 55 }}
          />
          {s.kind === "today" && (
            <>
              <span className="text-[12px] whitespace-nowrap" style={{ color: "#fce9c0" }}>Standup Sync</span>
              <img src={todayDots} alt="" style={{ width: 24, height: 6 }} />
              <div className="relative flex items-center justify-center" style={{ width: 68, height: 20 }}>
                <img src={todayPill} alt="" className="absolute inset-0 w-full h-full" />
                <span className="relative text-[12px] font-medium whitespace-nowrap" style={{ color: "#231806" }}>＋ Join · 3</span>
              </div>
            </>
          )}
          {s.kind === "sat" && (
            <>
              <div className="flex items-center gap-0.5">
                <img src={satIcon} alt="" style={{ width: 16, height: 16 }} />
                <span className="text-[12px] whitespace-nowrap" style={{ color: "#c2c9e7" }}>Game Night</span>
              </div>
              <img src={satDots} alt="" style={{ width: 15, height: 6 }} />
              <div className="relative flex items-center justify-center" style={{ width: 60, height: 20 }}>
                <img src={satPill} alt="" className="absolute inset-0 w-full h-full" />
                <span className="relative text-[12px] font-medium whitespace-nowrap" style={{ color: "#c2c9e7" }}>＋ Join</span>
              </div>
            </>
          )}
        </div>
      ))}

      <div className="absolute flex flex-col gap-1.5 items-start" style={{ left: 18, bottom: 12 }}>
        <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: "#f0f1f5" }}>3/7 stars collected</span>
        <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: "#9ea8d0" }}>Complete 4 more to unlock Ursa Major badge</span>
      </div>

      <div className="absolute flex flex-col items-end gap-2" style={{ right: 14, top: 16 }}>
        <div className="flex items-center rounded-xl border p-1" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.04)" }}>
          <span className="rounded-[10px] px-4.5 py-1.5 text-[13px] font-medium" style={{ background: "#fff4a1", color: "#1d202b" }}>Week</span>
          <span className="rounded-[10px] px-4.5 py-1.5 text-[13px] font-medium" style={{ color: "#bfc7d4" }}>Month</span>
        </div>
        <div className="flex items-center gap-1.5">
          <img src={chevronLeft} alt="" style={{ width: 14, height: 14 }} />
          <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: "#bfc7d4" }}>Jun 23 – Jun 29 · W26</span>
          <img src={chevronRight} alt="" style={{ width: 14, height: 14 }} />
        </div>
      </div>
    </div>
  );
}

function CoworkRoomModal({ room, onClose }: { room: CoworkRoom; onClose: () => void }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.55)", zIndex: 40 }}
      onPointerDown={onClose}
    >
      <div
        className="flex flex-col gap-4 rounded-2xl border p-5"
        style={{ width: 340, borderColor: "#303644", background: "linear-gradient(180deg, #222631 0%, #151920 100%)" }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[15px] font-semibold text-[#e8edf8]">🎧 {room.name}</p>
            <p className="text-[11px] text-[#657084] mt-0.5">{room.ended ? "Session ended" : `${room.time} · ${room.status}`}</p>
          </div>
          <button onClick={onClose} className="text-[#657084]"><X size={16} /></button>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.5px] text-[#657084] mb-2">WHO'S IN</p>
          <div className="flex items-center justify-between">
            <div className="flex isolate">
              {room.avatars.map((a, i) => (
                <div key={i} className="mr-[-6px]" style={{ zIndex: room.avatars.length - i }}>
                  <div className="rounded-xl border-2 border-[#151920]" style={{ background: a.c }}>
                    <div className="flex items-center justify-center rounded-[10px]" style={{ width: 28, height: 28 }}>
                      <span className="text-[10px] font-semibold" style={{ color: "#0a0f15" }}>{a.i}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <span className="text-[11px] text-[#657084]">{room.avatars.length + room.extra} people</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.5px] text-[#657084] mb-1">TODAY'S GOAL</p>
          <p className="text-[13px] leading-relaxed text-[#cecece]">{room.modalGoal}</p>
        </div>
        <button className="w-full rounded-full py-2.5 text-[14px] font-semibold text-[#0a0f15]" style={{ background: "#fff4a1" }}>
          {room.cta}
        </button>
      </div>
    </div>
  );
}

function CommunityView() {
  const [openRoom, setOpenRoom] = useState<CoworkRoom | null>(null);
  return (
    <div
      className="absolute overflow-hidden rounded-[20px] border border-[#2b2c2d]"
      style={{ top: 128, left: 240, right: 312, bottom: 16, background: "#0a0f15", zIndex: 15 }}
    >
      <div className="flex h-full flex-col overflow-y-auto p-4 gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[20px] font-semibold text-[#e8edf8]">Community</span>
            <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-[#4ade80]" style={{ background: "rgba(74,222,128,0.12)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ade80]" /> 42 online
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-full border px-3 py-2" style={{ borderColor: "#303644", width: 260 }}>
            <Search size={14} color="#5a7099" />
            <span className="text-[12px] text-[#5a7099]">Search people, rooms…</span>
          </div>
        </div>

        <div
          className="flex flex-col gap-3 rounded-[24px] border p-5"
          style={{ borderColor: "rgba(255,255,255,0.07)", background: "linear-gradient(180deg, #222631 0%, #151920 100%)", boxShadow: "0px 18px 50px 0px rgba(0,0,0,0.45)" }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <img src={geminiIcon} alt="" style={{ width: 28, height: 27 }} />
                <span className="text-[20px] font-semibold text-[#f0f1f5]">Constellation Recap</span>
              </div>
              <p className="text-[13px] text-[#657084] mt-1 pl-[38px]">Every connection you made today becomes a star in your constellation</p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border px-3.5 py-2.5 shrink-0" style={{ borderColor: "rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.04)", width: 280 }}>
              <img src={searchIcon} alt="" style={{ width: 16, height: 16 }} />
              <span className="text-[13px] font-semibold text-[#657084]">Describe what you are looking for ... </span>
            </div>
          </div>
          <ConstellationCanvas />
          <div className="flex flex-wrap items-center gap-2">
            {MISSION_CHIPS.map((c) => {
              const lit = c.state === "checked" || c.state === "active";
              return (
                <div
                  key={c.label}
                  className="flex items-center gap-1.5 rounded-full border px-2.5 py-1.5"
                  style={{
                    background: c.state === "active" ? "rgba(255,244,161,0.08)" : c.state === "checked" ? "rgba(255,244,161,0.05)" : "rgba(255,255,255,0.04)",
                    borderColor: c.state === "active" ? "#fff4a1" : c.state === "checked" ? "rgba(255,244,161,0.2)" : "rgba(255,255,255,0.07)",
                  }}
                >
                  <img src={lit ? missionStar : missionStarDim} alt="" style={{ width: 14, height: 14 }} />
                  <span className="text-[12px] font-medium whitespace-nowrap" style={{ color: lit ? "#fff4a1" : "#9ea8d0" }}>{c.label}</span>
                  {c.state === "checked" && <img src={missionCheck} alt="" style={{ width: 14, height: 14 }} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border p-4" style={{ borderColor: "#303644" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[16px] font-semibold text-[#f0f1f5]">Cowork Room</p>
              <p className="text-[13px] text-[#9ea8d0]">63 Active Now | 215 Joined Today</p>
            </div>
            <button className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold text-[#e0e5eb]" style={{ background: "#373e4e" }}>
              <Plus size={12} /> Add Room
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {COWORK_ROOMS.map((room) => (
              <button
                key={room.id}
                onClick={() => setOpenRoom(room)}
                className="relative flex flex-col justify-between gap-2 rounded-xl p-3 text-left shrink-0"
                style={{ width: 180, height: 126, background: "#222631", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <img src={foldIcon} alt="" className="absolute" style={{ top: 8, right: 8, width: 14, height: 14, transform: "rotate(90deg)" }} />
                <div>
                  <p className="text-[13px] font-semibold" style={{ color: room.ended ? "#e0e5eb" : "#e8edf8" }}>{room.name}</p>
                  <p className="text-[11px]" style={{ color: room.ended ? "#4e5669" : "#657084" }}>
                    {room.ended ? "ended" : `${room.time} · ${room.status}`}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex isolate items-center">
                    <div className="mr-[-6px]" style={{ zIndex: room.avatars.length + 1 }}>
                      <img src={room.ended ? coworkAvatarEnded : coworkAvatarActive} alt="" style={{ width: 20, height: 20 }} />
                    </div>
                    {room.avatars.map((a, i) => (
                      <div key={i} className="mr-[-6px]" style={{ zIndex: room.avatars.length - i }}>
                        <div className="flex items-center justify-center rounded-lg border-2 border-[#222631]" style={{ width: 20, height: 20, background: room.ended ? "#9ea8d0" : a.c }}>
                          <span className="text-[8px] font-semibold" style={{ color: "#0a0f15" }}>{a.i}</span>
                        </div>
                      </div>
                    ))}
                    {room.extra > 0 && (
                      <div className="flex items-center justify-center rounded-lg border-2 border-[#222631]" style={{ width: 20, height: 20, background: "#c2c9e7" }}>
                        <span className="text-[8px] font-semibold text-[#0a0f15]">+{room.extra}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px]" style={{ color: room.ended ? "#9ea8d0" : "#5a7099" }}>Goal · {room.goal}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {openRoom && <CoworkRoomModal room={openRoom} onClose={() => setOpenRoom(null)} />}
    </div>
  );
}

function CommunityRightPanel() {
  return (
    <aside
      className="absolute flex flex-col rounded-[20px] border border-[#2b2c2d] overflow-hidden overflow-y-auto"
      style={{ top: 128, right: 16, bottom: 16, width: 280, background: "rgba(26,27,29,0.92)", backdropFilter: "blur(16px)", zIndex: 20, pointerEvents: "auto" }}
    >
      <div className="flex items-center justify-between border-b border-[rgba(77,159,255,0.12)] px-4 py-4">
        <span className="text-white text-[16px] font-semibold">Secret Santa</span>
        <span className="rounded-full border px-2 py-0.5 text-[12px]" style={{ background: "#303644", borderColor: "#434a5c", color: "#d2d6e1" }}>D-3 Reveal</span>
      </div>
      <div className="p-4 flex flex-col gap-3 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="rounded-2xl p-3 flex flex-col gap-3" style={{ background: "rgba(48,54,68,0.5)" }}>
          <p className="text-[13px] font-semibold" style={{ color: "#bfc7d4" }}>Who will take care of this week</p>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Avatar initials="AC" color="#4d9fff" size={28} />
              <span className="absolute rounded-full border-2 border-[#070d1a]" style={{ right: 0, bottom: 0, width: 8, height: 8, background: "#fff4a1" }} />
            </div>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-[#e8edf8]">Aria <span className="text-[10px] font-normal text-[#55585f]">Product Designer</span></p>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[12px] text-[#55585f]">🇦🇪 Dubai | GST 11:44</span>
                <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#434a5c", color: "#d2d6e1" }}>+16h</span>
              </div>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-[#657084] mb-1">About</p>
            <p className="text-[13px] leading-relaxed text-[#bfc7d4]">
              A detail-obsessed designer. I love organizing ideas while watching desert sunrises 🌅 Also a Figma plugin enthusiast.
            </p>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#bfc7d4] mb-1.5">Her Interests</p>
            <div className="flex flex-wrap gap-1.5">
              {ARIA_TAGS.map((t) => (
                <span key={t} className="rounded-full border px-2 py-1 text-[10px] font-semibold" style={{ borderColor: "#657084", color: "#bfc7d4", background: "#303644" }}>{t}</span>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#bfc7d4] mb-1.5">Current Tasks</p>
            <div className="flex flex-col gap-1">
              {ARIA_TASKS.map((t, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5" style={{ background: "#303644" }}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="rounded-full shrink-0" style={{ width: 6, height: 6, background: t.dot }} />
                    <span className="text-[12px] truncate" style={{ color: t.status ? "#e8edf8" : "#657084" }}>{t.title}</span>
                  </div>
                  {t.status && (
                    <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: `${t.statusColor}1f`, color: t.statusColor! }}>{t.status}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <button className="rounded-full border py-2 text-[16px]" style={{ background: "rgba(180,209,243,0.2)", borderColor: "#b4d1f3", color: "#b4d1f3" }}>
            Send Anonymous Cheer
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        <p className="text-[15px] font-semibold text-white">This Week's Smalltalk</p>
        {SMALLTALK.map((s) => (
          <div key={s.name} className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: "rgba(48,54,68,0.5)" }}>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Avatar initials="AC" color="#4d9fff" size={28} />
                <span className="absolute rounded-full border-2 border-[#070d1a]" style={{ right: 0, bottom: 0, width: 8, height: 8, background: "#fff4a1" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#e8edf8]">{s.name} <span className="text-[10px] font-normal text-[#55585f]">{s.role}</span></p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-[12px] text-[#55585f]">{s.city}</span>
                  <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "#252932", color: "#55585f" }}>+16h</span>
                </div>
              </div>
            </div>
            <img src={s.photo} alt="" className="w-full rounded-lg object-cover" style={{ height: 128 }} />
            <p className="text-[13px] font-semibold text-[#bfc7d4]">{s.text}</p>
            <div className="flex items-end gap-0.5">
              <span className="flex items-center gap-1 rounded px-1 h-5 text-[12px]" style={{ background: "#222631", color: "#bfc7d4" }}>❤️ {s.likes}</span>
              <span className="flex items-center gap-1 rounded px-1 h-5 text-[12px]" style={{ background: "#222631", color: "#bfc7d4" }}>💬 {s.comments}</span>
              <span className="flex items-center gap-1 rounded px-1 h-5 text-[12px]" style={{ background: "#222631", color: "#bfc7d4" }}>👀 {s.views}</span>
              <span className="flex items-center justify-center rounded px-1 h-5" style={{ background: "#222631" }}>
                <img src={smileyIcon} alt="" style={{ width: 16, height: 16 }} />
              </span>
            </div>
            <button className="rounded-full border py-1.5 text-[13px] font-semibold" style={{ background: "rgba(194,201,231,0.15)", borderColor: "rgba(194,201,231,0.3)", color: "#c2c9e7" }}>
              Send Anonymous Cheer
            </button>
          </div>
        ))}
        <button className="rounded-full border py-2 text-[16px]" style={{ background: "rgba(180,209,243,0.2)", borderColor: "#b4d1f3", color: "#b4d1f3" }}>
          Vote for Next Speaker
        </button>
      </div>
    </aside>
  );
}

// ── Root App — shared chrome + view switcher ─────────────────────────────────

const MAIN_BY_VIEW: Record<View, () => JSX.Element> = {
  dashboard: GlobeView, chat: WorkChat,
  calendar: CalendarView, "while-asleep": WhileAsleepView, community: CommunityView,
};
const RIGHT_BY_VIEW: Record<View, () => JSX.Element> = {
  dashboard: RightSidebar, chat: ActionsPanel,
  calendar: CalendarRightPanel, "while-asleep": WhileAsleepRightPanel, community: CommunityRightPanel,
};

export default function App() {
  const [view, setView] = useState<View>("dashboard");
  const Main = MAIN_BY_VIEW[view];
  const Right = RIGHT_BY_VIEW[view];
  return (
    <div
      className="relative w-full h-full overflow-hidden select-none"
      style={{ background: "linear-gradient(to bottom, #06101E 0%, #060713 60%, #04060F 100%)", fontFamily: "Inter, sans-serif" }}
    >
      <Main />
      <Header />
      <LeftSidebar view={view} onNavigate={setView} />
      <Right />
    </div>
  );
}
