// The agent's tools. Each one reads the curated knowledge files, never the open web,
// so every answer can be traced back to something Alex wrote down.
import { readFileSync } from "node:fs";

type WorkEntry = {
  id: string;
  type: string;
  title: string;
  org: string;
  where?: string;
  years: string;
  url?: string;
  summary: string;
  tags: string[];
};

const load = (file: string) => JSON.parse(readFileSync(new URL(`../knowledge/${file}`, import.meta.url), "utf8"));
export const profile = load("profile.json");
export const work: WorkEntry[] = load("work.json");

export type ToolSpec = {
  type: "function";
  function: { name: string; description: string; parameters: object };
};

export const toolSpecs: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "search_work",
      description:
        "Search Alex's jobs, client projects, and personal projects. Use it for any question about a company, brand, project, technology, or what Alex built.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keywords, such as a brand name, a technology, or a kind of work." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_profile",
      description:
        "Get one section of Alex's profile: summary, skills, education, about (personal background), availability (what roles Alex wants), or timeline (every job in order).",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: ["summary", "skills", "education", "about", "availability", "timeline"],
          },
        },
        required: ["section"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_contact",
      description: "Get how to reach Alex or hire Alex: email, LinkedIn, GitHub, and the resume PDF.",
      parameters: { type: "object", properties: {} },
    },
  },
];

const STOP = new Set(
  "a an and are as at be by did do does for from has have he her his how i in is it its me my of on or she so that the their them they this to was were what when where which who why will with work worked you your alex alex's medina can could would should tell about get know any some much many me us please".split(" "),
);

const tokenize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9&'\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));

// Scores entries by keyword overlap; tag hits count more than summary hits.
export function searchWork(query: string, limit = 3) {
  const words = tokenize(query);
  if (words.length === 0) return { results: [], note: "Empty query. Try a brand, technology, or kind of work." };
  const scored = work
    .map((entry) => {
      // Whole-word matching on tags, so "can" never matches "canada".
      const tags = ` ${entry.tags.join(" ").toLowerCase()} `;
      const head = `${entry.title} ${entry.org}`.toLowerCase();
      const body = entry.summary.toLowerCase();
      let score = 0;
      for (const w of words) {
        const stem = w.replace(/(ing|es|s)$/, "");
        if (head.includes(w)) score += 4;
        if (tags.includes(` ${w} `) || (stem.length > 2 && tags.includes(` ${stem} `))) score += 3;
        if (body.includes(w) || (stem.length > 2 && body.includes(stem))) score += 1;
      }
      return { entry, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  if (scored.length === 0) {
    return { results: [], note: "No match in Alex's work. Say you don't know and suggest emailing Alex." };
  }
  return {
    results: scored.map(({ entry }) => ({
      title: entry.title,
      org: entry.org,
      years: entry.years,
      ...(entry.where ? { where: entry.where } : {}),
      ...(entry.url ? { url: entry.url } : {}),
      summary: entry.summary,
    })),
  };
}

export function getProfile(section: string) {
  switch (section) {
    case "summary":
      return { headline: profile.headline, location: profile.location, summary: profile.summary };
    case "skills":
      return { skills: profile.skills };
    case "education":
      return { education: profile.education };
    case "about":
      return { about: profile.about };
    case "availability":
      return { availability: profile.availability, location: profile.location, contact: profile.contact.email };
    case "timeline":
      return {
        timeline: work
          .filter((w) => w.type === "job" || w.id === "maps-on-maps")
          .map((w) => `${w.years}: ${w.title}, ${w.org}`),
      };
    default:
      return { error: `Unknown section "${section}". Use summary, skills, education, about, availability, or timeline.` };
  }
}

export function getContact() {
  return { contact: profile.contact };
}

export function runTool(name: string, rawArgs: unknown): unknown {
  let args: Record<string, unknown> = {};
  if (typeof rawArgs === "string") {
    try {
      args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
    } catch {
      return { error: "Arguments were not valid JSON." };
    }
  } else if (rawArgs && typeof rawArgs === "object") {
    args = rawArgs as Record<string, unknown>;
  }
  switch (name) {
    case "search_work":
      return searchWork(String(args.query ?? ""));
    case "get_profile":
      return getProfile(String(args.section ?? ""));
    case "get_contact":
      return getContact();
    default:
      return { error: `Unknown tool "${name}".` };
  }
}
