export const sections = [
  {
    name: "Overview",
    description: "Your squad. This week’s showdown. The big picture.",
    menus: [{ name: "This week", pages: ["Overview"] }],
  },
  {
    name: "My Team",
    description: "Know your roster, set your lineup and get ready for kickoff.",
    menus: [
      {
        name: "This week",
        pages: ["My roster", "Recommendations", "Kickoff watch"],
      },
      { name: "Plan ahead", pages: ["Three-week plan", "Matchup radar"] },
    ],
  },
  {
    name: "Waivers",
    description: "Find your next difference-maker, then work out the pickup.",
    menus: [
      { name: "Find players", pages: ["Waiver list", "Breakout radar"] },
      { name: "Plan a pickup", pages: ["Pickup impact", "Claim coach"] },
    ],
  },
  {
    name: "League",
    description: "Size up the league, work a trade and watch the playoff race.",
    menus: [
      {
        name: "Around the league",
        pages: ["League", "Trade finder", "Playoff race"],
      },
    ],
  },
  {
    name: "Research",
    description:
      "Follow the news, dig into the analysis and check the receipts.",
    menus: [
      {
        name: "News & analysis",
        pages: ["News & trends", "What changed", "AI insights"],
      },
      { name: "Past results", pages: ["Report card", "Weekly recap"] },
      { name: "Preseason", pages: ["Draft Room"] },
    ],
  },
  {
    name: "Operations",
    description: "Data sources, refresh controls and import health.",
    menus: [
      { name: "Data & refresh", pages: ["Yahoo refresh", "Import health"] },
    ],
  },
];

export const pageLabels: Record<string, string> = {
  "My roster": "Roster",
  Recommendations: "Set lineup",
  "AI insights": "Team analysis",
  "Waiver list": "Available players",
  "News & trends": "News & advice",
  "Report card": "Projection accuracy",
  League: "Standings",
  "Yahoo refresh": "Worker activity",
};

// Keep existing bookmarks, cross-tool links and notification destinations working.
export function validTab(hash: string) {
  let name = "";
  try {
    name = decodeURIComponent(hash.replace(/^#/, ""));
  } catch {}
  return sections.some((s) => s.menus.some((m) => m.pages.includes(name)))
    ? name
    : "Overview";
}

export function sectionFor(tab: string) {
  return (
    sections.find((s) => s.menus.some((m) => m.pages.includes(tab))) ||
    sections[0]
  );
}
