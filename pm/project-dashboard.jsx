import { useState } from "react";

const MILESTONES = [
  {
    id: "m0",
    label: "M0 — Foundations",
    description: "Resolve blocking open questions, choose tech stack, define success metrics, set up dev environment.",
    done: false,
  },
  {
    id: "m1",
    label: "M1 — Auth + Infrastructure",
    description: "Google auth, handle creation, DB schema for Users/Places/Plans/Follows, Google Places API plumbed.",
    done: false,
  },
  {
    id: "m2",
    label: "M2 — Core Place UX",
    description: "Map view with search and pins, place detail, save/unsave with notes, proto-Panel.",
    done: false,
  },
  {
    id: "m3",
    label: "M3 — Social Graph",
    description: "Follow/unfollow, mutual follow detection, user profile pages, friend places on map.",
    done: false,
  },
  {
    id: "m4",
    label: "M4 — Plans",
    description: "Create/update/cancel plans, Plan cards in Panel, join a friend's plan, view attendees.",
    done: false,
  },
  {
    id: "m5",
    label: "M5 — Notifications + Suggestions",
    description: "In-app notifications (browser alerts), contextual place suggestions, auto-reminders.",
    done: false,
  },
  {
    id: "m6",
    label: "M6 — Landing + Polish",
    description: "Unauthenticated landing page, profile social links, mobile-first polish, empty states, onboarding.",
    done: false,
  },
  {
    id: "m7",
    label: "M7 — MVP Launch",
    description: "Hit defined success metrics. Ship to initial users.",
    done: false,
  },
];

const TASKS = {
  blocking: [
    {
      id: "b1",
      text: "Choose tech stack (frontend, backend, DB, hosting)",
      blocks: "All implementation work",
      resolved: true,
    },
    {
      id: "b2",
      text: "Resolve: ambient visibility model — save = interest signal; plans surface to mutual friends organically",
      blocks: "Plan flows (4, 5, 8)",
      resolved: true,
    },
    {
      id: "b3",
      text: "Resolve: follow request acceptance — immediate, no approval required",
      blocks: "Social graph flows (6, 7, 13)",
      resolved: true,
    },
    {
      id: "b4",
      text: "Resolve: visibility tiers — one-way: saved places on map; mutual: Plans visible",
      blocks: "Map + profile (flows 10, 7)",
      resolved: true,
    },
    {
      id: "b5",
      text: "Define success metrics — 7 launch targets + 9 telemetry events",
      blocks: "Knowing when MVP is shippable",
      resolved: true,
    },
  ],
  high: [
    { id: "h1", text: "Set up dev environment and project scaffold (repo, CI, build pipeline)" },
    { id: "h2", text: "Implement Google Auth — sign-in, handle creation, session management" },
    { id: "h3", text: "Integrate Google Places API — search, place detail, map pins" },
    { id: "h4", text: "Build map view — main interface with pins + search bar" },
    { id: "h5", text: "Build The Panel — scrollable sidebar with Notification/Plan/Place cards + filter pills" },
    { id: "h6", text: "Build place detail view — address, metadata, save/plan actions" },
    { id: "h7", text: "Implement place saving with notes" },
    { id: "h8", text: "Implement social graph — follow/unfollow, mutual follow detection" },
    { id: "h9", text: "Build plan creation and management — create, update, cancel" },
    { id: "h10", text: "Build user profile page — public page with conditional plan visibility" },
    { id: "h11", text: "Implement plan join flow — join, view attendees, visit attendee profiles" },
    { id: "h12", text: "Build in-app notification system (browser alerts)" },
    { id: "h13", text: "Build unauthenticated landing page" },
  ],
  medium: [
    { id: "m1", text: "Implement contextual place suggestions (time-of-day, weather, location)" },
    { id: "m2", text: "Friends' saved places overlay on main map" },
    { id: "m3", text: "Profile social links (Instagram, Twitter, Facebook)" },
    { id: "m4", text: "Complete target users/goals sections in product vision doc" },
  ],
  low: [
    { id: "l1", text: "Smart time defaults — only suggest within opening hours, future-only, auto-reminders" },
    { id: "l2", text: "Privacy controls — profile privacy settings" },
    { id: "l3", text: "Responsive/mobile-first polish across all surfaces" },
    { id: "l4", text: "Empty states — first-run experience for new users" },
  ],
};

const STATUS_HISTORY = [
  {
    date: "2026-04-15",
    phase: "Pre-Development — Product Definition",
    summary:
      "All core product documentation complete (vision, FAQ, user stories, MVP-1 spec). No code written. Tech stack undecided. 5 blocking open questions remain in spec. Dev environment not set up.",
    completedItems: [
      "Product vision (pm/1-product-vision.md)",
      "Product FAQ (pm/2-product-faq.md)",
      "User stories — 11 scenarios (pm/3-user-stories.md)",
      "MVP-1 full specification (pm/specs/mvp-1.md) — last updated 2026-03-04",
    ],
  },
  {
    date: "2026-05-15",
    phase: "M0 — Ready for Dev Setup",
    summary:
      "All 5 blocking pre-development questions resolved. Full tech stack decided. Success metrics defined with 7 quantitative launch targets and 9 telemetry events. Ready to begin dev environment setup.",
    completedItems: [
      "Ambient visibility model — save = interest signal; plans surface to mutual friends organically (no explicit invite step)",
      "Interested button + engagement loop — saving a place is the primary intent signal; plans are open opt-in invites",
      "Follow model — following is immediate, no approval required",
      "Visibility tiers — one-way followers see saved places on map; Plans visible only to mutual friends",
      "Success metrics — 7 launch targets + 9 telemetry events defined",
      "Tech stack — React SPA · Flask on AWS Lambda (Mangum) · Supabase (Postgres + Auth + Realtime) · Mapbox GL JS · PostHog",
    ],
  },
];

function Badge({ children, color }) {
  const colors = {
    red: "bg-red-100 text-red-700 border border-red-200",
    yellow: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    blue: "bg-blue-100 text-blue-700 border border-blue-200",
    gray: "bg-gray-100 text-gray-600 border border-gray-200",
    green: "bg-green-100 text-green-700 border border-green-200",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[color]}`}>
      {children}
    </span>
  );
}

function TaskRow({ task, checked, onToggle, showBlocks }) {
  return (
    <li className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={() => onToggle(task.id)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 cursor-pointer flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <span className={`text-sm ${checked ? "line-through text-gray-400" : "text-gray-700"}`}>
          {task.text}
        </span>
        {showBlocks && task.blocks && (
          <p className="text-xs text-red-500 mt-0.5">Blocks: {task.blocks}</p>
        )}
      </div>
    </li>
  );
}

export default function ProjectDashboard() {
  const [checked, setChecked] = useState(
    Object.fromEntries(TASKS.blocking.filter((t) => t.resolved).map((t) => [t.id, true]))
  );
  const [openSection, setOpenSection] = useState({ blocking: true, high: true, medium: false, low: false });

  const toggle = (id) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  const toggleSection = (key) => setOpenSection((prev) => ({ ...prev, [key]: !prev[key] }));

  const allTasks = [
    ...TASKS.blocking,
    ...TASKS.high,
    ...TASKS.medium,
    ...TASKS.low,
  ];
  const totalTasks = allTasks.length;
  const completedTasks = allTasks.filter((t) => checked[t.id]).length;
  const progressPct = Math.round((completedTasks / totalTasks) * 100);

  const blockingDone = TASKS.blocking.filter((t) => checked[t.id]).length;
  const allBlockingResolved = blockingDone === TASKS.blocking.length;

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Hyperlocal v2</h1>
              <p className="text-sm text-gray-500 mt-0.5">Project Dashboard · Last updated May 15, 2026</p>
            </div>
            <Badge color={allBlockingResolved ? "green" : "yellow"}>
              {allBlockingResolved ? "M0 — Ready for Dev Setup" : "Pre-Development — Product Definition"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* Status Card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Current Status</h2>
            <Badge color="yellow">Phase 0 of 7</Badge>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-1.5">
                <span>Overall task progress</span>
                <span className="font-medium">{completedTasks} / {totalTasks} tasks</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2.5">
                <div
                  className="bg-indigo-500 h-2.5 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">{progressPct}% complete</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {[
                { label: "Blocking items", value: `${blockingDone}/${TASKS.blocking.length}`, color: allBlockingResolved ? "green" : "red" },
                { label: "High priority", value: `${TASKS.high.filter(t => checked[t.id]).length}/${TASKS.high.length}`, color: "blue" },
                { label: "Medium priority", value: `${TASKS.medium.filter(t => checked[t.id]).length}/${TASKS.medium.length}`, color: "yellow" },
                { label: "Tech stack", value: "Decided ✓", color: "green" },
              ].map((stat) => (
                <div key={stat.label} className="bg-gray-50 rounded-lg px-4 py-3 text-center">
                  <p className="text-xs text-gray-500 mb-1">{stat.label}</p>
                  <Badge color={stat.color}>{stat.value}</Badge>
                </div>
              ))}
            </div>

            {!allBlockingResolved && (
              <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
                <strong>Blocker:</strong> {TASKS.blocking.length - blockingDone} unresolved blocking item{TASKS.blocking.length - blockingDone !== 1 ? "s" : ""} — resolve these before writing any code.
              </div>
            )}
          </div>
        </div>

        {/* Outstanding Tasks */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Outstanding Tasks</h2>
            <p className="text-xs text-gray-400 mt-0.5">Sorted: blocking first, then by priority</p>
          </div>

          {[
            { key: "blocking", label: "Blocking", badge: "red", tasks: TASKS.blocking, showBlocks: true },
            { key: "high", label: "High Priority", badge: "blue", tasks: TASKS.high, showBlocks: false },
            { key: "medium", label: "Medium Priority", badge: "yellow", tasks: TASKS.medium, showBlocks: false },
            { key: "low", label: "Low Priority / Polish", badge: "gray", tasks: TASKS.low, showBlocks: false },
          ].map(({ key, label, badge, tasks, showBlocks }) => {
            const doneCount = tasks.filter((t) => checked[t.id]).length;
            const isOpen = openSection[key];
            return (
              <div key={key} className="border-b border-gray-100 last:border-0">
                <button
                  onClick={() => toggleSection(key)}
                  className="w-full flex items-center justify-between px-6 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <Badge color={badge}>{label}</Badge>
                    <span className="text-xs text-gray-400">{doneCount}/{tasks.length} done</span>
                  </div>
                  <span className="text-gray-400 text-sm">{isOpen ? "▲" : "▼"}</span>
                </button>
                {isOpen && (
                  <ul className="px-6 pb-2">
                    {tasks.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        checked={!!checked[task.id]}
                        onToggle={toggle}
                        showBlocks={showBlocks}
                      />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Milestones */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">Path to MVP Launch</h2>
            <p className="text-xs text-gray-400 mt-0.5">8 milestones — no additive features, just what's needed to ship</p>
          </div>
          <div className="px-6 py-5">
            <ol className="relative border-l-2 border-gray-200 ml-2 space-y-5">
              {MILESTONES.map((m, i) => (
                <li key={m.id} className="pl-6 relative">
                  <div
                    className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 ${
                      m.done
                        ? "bg-indigo-500 border-indigo-500"
                        : i === 0
                        ? "bg-yellow-400 border-yellow-400"
                        : "bg-white border-gray-300"
                    }`}
                  />
                  <p className={`text-sm font-semibold ${m.done ? "text-indigo-600" : i === 0 ? "text-yellow-600" : "text-gray-700"}`}>
                    {m.label}
                    {i === 0 && <span className="ml-2 text-xs font-normal text-yellow-500">← current</span>}
                    {m.done && <span className="ml-2 text-xs font-normal text-indigo-400">✓ done</span>}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{m.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Status History */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-800">Status History</h2>
              <p className="text-xs text-gray-400 mt-0.5">Snapshot log — future entries appended below</p>
            </div>
            <Badge color="gray">{STATUS_HISTORY.length} entr{STATUS_HISTORY.length === 1 ? "y" : "ies"}</Badge>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {STATUS_HISTORY.map((entry, i) => (
              <div key={i} className="px-6 py-5">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                    {entry.date}
                  </span>
                  <span className="text-xs text-gray-500">{entry.phase}</span>
                </div>
                <p className="text-sm text-gray-700 mb-3">{entry.summary}</p>
                {entry.completedItems && entry.completedItems.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Completed</p>
                    <ul className="space-y-1">
                      {entry.completedItems.map((item, j) => (
                        <li key={j} className="text-xs text-gray-600 flex items-start gap-1.5">
                          <span className="text-green-500 mt-0.5">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}

            {/* Future entry placeholder */}
            <div className="px-6 py-5 bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-mono font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded">
                  YYYY-MM-DD
                </span>
                <span className="text-xs text-gray-400 italic">Next status update will appear here</span>
              </div>
              <div className="h-2 w-48 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
