export const sections = [
  {
    name: "Overview",
    description: "Your squad. This week’s fight. Let’s give them hell.",
    menus: [{ name: "This week", pages: ["Overview"] }],
  },
  {
    name: "My Team",
    description: "Check the squad. Set the lineup. Make every damn slot count.",
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
    description: "Somebody left points on the shelf. Let’s go get them.",
    menus: [
      { name: "Find players", pages: ["Waiver list", "Breakout radar"] },
      { name: "Plan a pickup", pages: ["Pickup impact", "Claim coach"] },
    ],
  },
  {
    name: "League",
    description: "Know the competition. Work a deal. Make them sweat.",
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
      "Watch the film. Check the receipts. Call bullshit when the numbers do.",
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
    description: "Keep the film fresh. Even a loudmouth coach needs good data.",
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
