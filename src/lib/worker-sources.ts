// How a worker heard about Covered. Asked at signup (optional) so the
// worker outreach routes can be compared. The key is what gets stored; a
// signup link can preselect one with ?src=<key>, for example
// /signup?src=college.

export const WORKER_SOURCES = [
  { key: "friend", label: "A friend or colleague" },
  { key: "venue", label: "A venue I work at" },
  { key: "college", label: "College or university" },
  { key: "instagram", label: "Instagram" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "group", label: "A Facebook or WhatsApp group" },
  { key: "other", label: "Somewhere else" },
] as const;

export type WorkerSourceKey = (typeof WORKER_SOURCES)[number]["key"];

export const WORKER_SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  WORKER_SOURCES.map((s) => [s.key, s.label])
);

export function isWorkerSource(value: unknown): value is WorkerSourceKey {
  return typeof value === "string" && WORKER_SOURCES.some((s) => s.key === value);
}
