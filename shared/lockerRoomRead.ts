import type { PlayerData, SnapshotData } from "./model.ts";
import { parsePlayers } from "./model.ts";
import { leagueOverview } from "./analytics.ts";
import { coachMood } from "./coachMood.ts";
import {
  effectiveStatus,
  gameLocked,
  reserveSlots,
  unavailableStatuses,
} from "./availability.ts";
import { lineupAdvice, lineupProjection } from "./lineupProjections.ts";
import {
  opponentMatchupRoster,
  completedTeamGames,
  currentOpponentId,
  recentForm,
  teamIdFromUrl,
  teamNames,
} from "./opponentHistory.ts";

const points = (v: number) => v.toFixed(2);
const namesAndPoints = (players: PlayerData[]) =>
  players
    .map(
      (p) =>
        `${p.name} (${points(lineupProjection(p, "yahoo").points!)} Yahoo points)`,
    )
    .join(" and ");
const hash = (s: string) => {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
};
export type ReadSection = { key: string; label: string; text: string };
export type LockerRoomRead = ReturnType<typeof lockerRoomRead>;

export function lockerRoomRead(s: SnapshotData, now = Date.now()) {
  const matchup = leagueOverview(s).matchup;
  const opponentId = currentOpponentId(s);
  const names = teamNames(s);
  const opponentName = opponentId
    ? names.get(opponentId) || matchup?.opponentName || "Your opponent"
    : matchup?.opponentName || "Your opponent";
  const ownForm = recentForm(s, s.team.id);
  const opponentForm = opponentId ? recentForm(s, opponentId) : null;
  const final = completedTeamGames(s, s.team.id, true).find(
    (g) => g.week === s.week,
  );
  const starters = s.players.filter((p) => !reserveSlots.has(p.slot));
  const sourceStale =
    !Number.isFinite(Date.parse(s.capturedAt)) ||
    now - Date.parse(s.capturedAt) > 2 * 3600000;
  const phase = final
    ? "final"
    : !matchup
      ? "waiting"
      : starters.some((p) => gameLocked(p, now)) ||
          (matchup.ownActual ?? 0) !== 0 ||
          (matchup.opponentActual ?? 0) !== 0
        ? "live"
        : "pregame";
  const margin =
    matchup?.ownProjected != null && matchup.opponentProjected != null
      ? matchup.ownProjected - matchup.opponentProjected
      : null;
  const originalMargin =
    matchup?.ownOriginal != null && matchup.opponentOriginal != null
      ? matchup.ownOriginal - matchup.opponentOriginal
      : null;
  const swing =
    margin != null && originalMargin != null ? margin - originalMargin : null;
  const editionAt = Math.floor(now / (30 * 60000)) * 30 * 60000;
  const edition =
    hash(`${s.season}:${s.week}:${s.team.id}`) + editionAt / (30 * 60000);
  const choose = (options: string[]) => options[edition % options.length];
  const headline = sourceStale
    ? "Old film. Check the damn timestamps."
    : final
      ? final.result === "W"
        ? choose([
            "That’s a damn win. Bring the cooler.",
            "Whistle blown. Points banked. Hell yes.",
          ])
        : final.result === "L"
          ? choose([
              "Take the bruise. Keep the helmet.",
              "Bad result. We’re still building something.",
            ])
          : "A tie? Nobody gets the damn game ball."
      : margin == null
        ? "Get the facts. Then bring the noise."
        : margin < -15
          ? choose([
              "Underdogs? Fine. Bring the damn teeth.",
              "That’s a hole. Grab a damn shovel.",
              "Nobody wins this thing on a spreadsheet.",
            ])
          : margin < -5
            ? choose([
                "Down on paper. Not dead, damn it.",
                "They brought a lead. We brought a plan.",
              ])
            : margin <= 5
              ? choose([
                  "This is a bar fight with decimals.",
                  "Buckle up. Every damn point matters.",
                ])
              : choose([
                  "Foot on the gas. No victory laps.",
                  "Good position. Now finish the damn job.",
                ]);
  const main: ReadSection[] = [],
    extra: ReadSection[] = [];
  let numbers = final
    ? `${s.team.name}, the imported Week ${s.week} head-to-head result is ${final.result === "W" ? "a win" : final.result === "L" ? "a loss" : "a tie"}: ${points(final.points)}–${points(final.against)} against ${final.opponentName}. ${final.result === "W" ? "That’s on the scoreboard, not wishful thinking. Enjoy it—you earned the noise." : final.result === "L" ? "No polishing that turd. Own the result, check the decisions, and come back sharper." : "All that stress for a dead heat. Fantasy football has a sick sense of humor."}`
    : margin == null
      ? `${s.team.name}, the full matchup forecast hasn’t landed. I can assess the available film, but I’m not pulling a winning margin out of my ass.`
      : `${s.team.name}, Yahoo’s live finish is ${points(matchup!.ownProjected!)} for us and ${points(matchup!.opponentProjected!)} for ${opponentName}: ${Math.abs(margin) < 0.005 ? "a dead heat" : `a ${points(Math.abs(margin))}-point projected ${margin > 0 ? "edge" : "deficit"}`}. ${margin < -15 ? "That’s a real hill to climb. Panic isn’t a game plan, though." : margin < -5 ? "Work to do, absolutely. Funeral arrangements? Hell no." : margin <= 5 ? "This thing is tight enough to make a coach chew through his headset." : "We’ve got the better forecast. The trophy does not arrive by fucking mail."}`;
  if (!final && matchup?.ownActual != null && matchup.opponentActual != null)
    numbers += ` Actual points: ${points(matchup.ownActual)}–${points(matchup.opponentActual)}. Those are banked; the live projections are expected final totals.`;
  if (!final && swing != null && Math.abs(swing) >= 1)
    numbers += ` Our projected margin has ${swing > 0 ? "improved" : "slipped"} ${points(Math.abs(swing))} since Yahoo’s original forecast.`;
  main.push({
    key: "numbers",
    label: final ? "The final whistle" : "The scoreboard reality",
    text: numbers,
  });

  const games = opponentForm?.games || [],
    last = games[0];
  let film = last
    ? `${opponentName} ${last.result === "W" ? "won" : last.result === "L" ? "lost" : "tied"} Week ${last.week}, ${points(last.points)}–${points(last.against)} against ${last.opponentName}. `
    : `There are no verified completed games for ${opponentName} in this import. No made-up hot streaks, no imaginary film session. `;
  if (games.length === 1)
    film += "That’s one game of evidence, not a personality test. ";
  if (games.length > 1)
    film += `Over the last ${games.length} completed games: ${opponentForm!.wins}-${opponentForm!.losses}${opponentForm!.ties ? `-${opponentForm!.ties}` : ""} head-to-head, ${points(opponentForm!.average!)} points per game, ranging from ${points(opponentForm!.low!)} to ${points(opponentForm!.high!)}. `;
  if (
    !final &&
    opponentForm?.average != null &&
    matchup?.opponentProjected != null
  ) {
    const uplift = matchup.opponentProjected - opponentForm.average;
    film +=
      Math.abs(uplift) >= 1
        ? `This week’s Yahoo forecast asks them to score ${points(Math.abs(uplift))} ${uplift > 0 ? "above" : "below"} that ${games.length === 1 ? "one-game mark" : "recent average"}. ${uplift > 0 ? "Respect their upside; don’t treat the forecast like points they already own." : "The recent film is stronger than this week’s forecast. Don’t mistake a lower projection for a soft opponent."}`
        : "Their current forecast is close to that recent scoring level. There’s your reference point, not a promise.";
  }
  main.push({
    key: "opponent",
    label: "Know who’s across the field",
    text: film.trim(),
  });

  const eligibleLeaders = (players: PlayerData[]) =>
    players
      .filter(
        (p) =>
          !reserveSlots.has(p.slot) &&
          !gameLocked(p, now) &&
          p.bye !== s.week &&
          !unavailableStatuses.has(effectiveStatus(p, now)) &&
          lineupProjection(p, "yahoo").points != null,
      )
      .sort(
        (a, b) =>
          lineupProjection(b, "yahoo").points! -
          lineupProjection(a, "yahoo").points!,
      )
      .slice(0, 2);
  const leaders = eligibleLeaders(s.players);
  const flags = starters.filter(
    (p) => !p.completed && (effectiveStatus(p, now) || p.bye === s.week),
  );
  const lineup = lineupAdvice(s, "yahoo");
  const gain =
    lineup.complete && lineup.delta != null ? Math.max(0, lineup.delta) : null;
  const call = final
    ? final.result === "W"
      ? "Coach’s verdict: take the win, then audit the process. A lucky bounce is lovely; a repeatable lineup is better. Celebrate tonight. Get the next week right tomorrow."
      : "Coach’s verdict: review the pregame call before blaming the bench. A player blowing up afterward doesn’t magically make yesterday’s choice stupid. We learn, we adjust, and we come back loud."
    : sourceStale
      ? "Coach’s verdict: this Yahoo snapshot is over two hours old or has no reliable timestamp. Check Sources & refresh before acting. I’ll talk plenty of shit, but I won’t dress old numbers up as fresh certainty."
      : margin == null
        ? "Coach’s verdict: get the missing matchup numbers, protect your healthy starters, and keep the bench ready. Confidence is welcome. Inventing evidence is bullshit."
        : margin < -5
          ? `Coach’s verdict: we’re the projected underdog. A projection is not a fucking verdict. ${gain != null && gain >= 0.5 ? `The Yahoo-only optimizer finds ${points(gain)} potential points in legal, unlocked moves; review the entire lineup together.` : gain == null ? "The Yahoo-only lineup calculation is incomplete; review the missing projections before changing starters." : "There’s no verified easy Yahoo-only gain sitting on the bench. Chasing a random name won’t fix that."} ${leaders.length ? `We need ${leaders.map((p) => p.name).join(" and ")} to do the heavy lifting.` : "The remaining games have to do the heavy lifting."} ${opponentForm?.average != null && matchup?.ownProjected != null && matchup.ownProjected > opponentForm.average ? "Our forecast clears their recent scoring average—that’s a reason to stay in the fight, not call it won." : "We need to beat our forecast or have them miss theirs. That’s possible; it isn’t guaranteed."} Keep the upside, check the inactives, and make them earn every damn inch.`
          : `Coach’s verdict: ${margin <= 5 ? "this is too close for sloppy lineup bullshit" : "protect the edge without coaching scared"}. ${flags.length ? `${flags.length} active-slot availability flag${flags.length === 1 ? " needs" : "s need"} a plan.` : "No unresolved active-slot flags are recorded, but final inactive reports still matter."} ${gain != null && gain >= 0.5 ? `Review the ${points(gain)}-point Yahoo-only lineup opportunity.` : "Keep the strongest eligible lineup on the field."} We don’t need a miracle for the highlight reel. We need good decisions and points. Finish the damn job.`;
  main.push({ key: "call", label: "Coach’s call", text: call });

  if (ownForm.games.length)
    extra.push({
      key: "own-form",
      label: "Our recent film",
      text: `We scored ${points(ownForm.games[0].points)} in Week ${ownForm.games[0].week}${ownForm.games.length > 1 ? ` and averaged ${points(ownForm.average!)} over ${ownForm.games.length} completed games` : "—our only completed game in this import"}. ${!final && matchup?.ownProjected != null ? `This week’s ${points(matchup.ownProjected)} Yahoo forecast is ${points(Math.abs(matchup.ownProjected - ownForm.average!))} ${matchup.ownProjected >= ownForm.average! ? "above" : "below"} that mark. Different week, different matchups; last week’s points don’t get to suit up again.` : "Judge the calls with the information we had. Hindsight talks a big game from a very comfortable couch."}`,
    });
  if (!final && leaders.length)
    extra.push({
      key: "weapons",
      label: "Who has to bring the noise",
      text: `${namesAndPoints(leaders)} ${leaders.length === 1 ? "is our highest-projected eligible, unlocked starter with a number available" : "are our two highest-projected eligible, unlocked starters"}. Those are full-game forecasts, not points still owed to us. ${choose(["Big names don’t pay the rent. Production does.", "The ceiling is exciting. An empty lineup slot is just a damn hole in the roof.", "Give me workload and a real role. The hype train can wait in the parking lot."])}`,
    });
  const rosterPage = opponentId
    ? s.sections.find(
        (p) =>
          p.kind === "league-roster" && teamIdFromUrl(p.url) === opponentId,
      )
    : undefined;
  const normalizedRoster = s.leagueRosters?.find(
    (t) => t.teamId === opponentId,
  );
  const scoutedPlayers =
    normalizedRoster?.players ||
    (rosterPage ? parsePlayers({ ...rosterPage, kind: "roster" }) : []);
  const matchupPlayers = opponentMatchupRoster(s);
  const opponentPlayers = matchupPlayers.length
    ? matchupPlayers.map((p) => {
        const previous = scoutedPlayers.find((r) => r.id === p.id);
        return {
          ...p,
          kickoffAt: previous?.kickoffAt || p.kickoffAt,
          locked: p.locked || !!previous?.locked,
        };
      })
    : scoutedPlayers;
  const rosterAt = matchupPlayers.length
    ? s.capturedAt
    : normalizedRoster?.capturedAt || rosterPage?.filters?.capturedAt || null;
  const opponentLeaders = eligibleLeaders(opponentPlayers);
  if (!final && opponentLeaders.length)
    extra.push({
      key: "threats",
      label: "Their troublemakers",
      text: `${matchupPlayers.length ? "In the current imported matchup" : "In the opponent’s last scouting roster"}, ${namesAndPoints(opponentLeaders)} ${opponentLeaders.length === 1 ? "leads" : "lead"} the eligible, unlocked starters by Yahoo projection. That’s where their biggest forecasted punch comes from. ${rosterAt && now - Date.parse(rosterAt) > 6 * 3600000 ? "That roster is over six hours old; verify their current starters before leaning on this read." : matchupPlayers.length ? "These are full-game projections for their imported starters, not points already scored." : "Their roster is a separate scouting snapshot, so later moves or live scores may differ."} Respect the weapons. Don’t hand them the game in your head.`,
    });
  const benchFlags = s.players.filter(
    (p) => reserveSlots.has(p.slot) && effectiveStatus(p, now),
  );
  if (!final)
    extra.push({
      key: "availability",
      label: "Tape the ankles. Check the locks.",
      text: flags.length
        ? `${flags
            .slice(0, 3)
            .map(
              (p) =>
                `${p.name} (${p.bye === s.week ? "bye" : effectiveStatus(p, now)}${gameLocked(p, now) ? ", game locked" : ""})`,
            )
            .join(
              ", ",
            )}: these are availability flags, not permission to assume a zero. ${flags.some((p) => !gameLocked(p, now)) ? "Review eligible backups before kickoff." : "Those slots are already locked; work on the slots you can still change."} Questionable isn’t ruled out. Hope is not an injury report.`
        : benchFlags.length
          ? `No unresolved injury flags are recorded for unfinished starters. The bench has ${benchFlags
              .slice(0, 2)
              .map((p) => `${p.name} (${effectiveStatus(p, now)})`)
              .join(
                " and ",
              )}. Protect your depth and check final inactive reports. Sunday has absolutely no respect for your carefully arranged plans.`
          : "No unresolved injury flags are recorded for unfinished starters. That is not a medical clearance. Check final inactive reports and game locks; an avoidable zero is the kind of bullshit we can actually control.",
    });
  const sourceTimes = [
    s.capturedAt,
    ...s.players.map((p) => p.gameDay?.checkedAt),
  ].filter(
    (t): t is string =>
      typeof t === "string" &&
      Number.isFinite(Date.parse(t)) &&
      Date.parse(t) <= now,
  );
  const evidenceAt = sourceTimes.sort().at(-1) || null;
  const updatedAt = new Date(
    Math.max(editionAt, ...sourceTimes.map(Date.parse)),
  ).toISOString();
  const payload = {
    headline,
    phase,
    reactionMood: coachMood({
      stale: sourceStale,
      phase,
      result: final?.result,
      margin,
    }),
    main,
    extra,
    evidenceAt,
    snapshotAt: s.capturedAt,
    updatedAt,
    stale: sourceStale,
    opponentName,
    receipts: {
      own: ownForm,
      opponent: opponentForm,
      opponentRosterAt: rosterAt,
    },
    metrics: {
      projectedMargin: margin,
      projectionSwing: swing,
      yahooLineupGain: gain,
    },
    method:
      "Yahoo matchup totals, completed head-to-head schedules, imported rosters and current availability checks. Recent form uses up to four completed games; median results are not extra games. Coaching judgments are conditional, not calibrated win probabilities.",
    refreshMinutes: 30,
  };
  return { ...payload, revision: hash(JSON.stringify(payload)).toString(16) };
}
