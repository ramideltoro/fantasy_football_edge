import { useEffect, useState } from "react";
import { Pause, Play, ClipboardList } from "lucide-react";
import type { CoachMood } from "../shared/coachMood";
import { coachReaction } from "./coachReactions";

const preferenceKey = "edge-coach-gif-paused";
export function CoachReaction({ mood }: { mood: CoachMood }) {
  const reaction = coachReaction(mood);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [paused, setPaused] = useState(() => {
    try {
      return localStorage.getItem(preferenceKey) === "true";
    } catch {
      return false;
    }
  });
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  const moving = !paused && !reduced;
  const src = moving ? reaction.gif : reaction.still;
  const unavailable = failed === reaction.id;
  function toggle() {
    const next = !paused;
    setPaused(next);
    try {
      localStorage.setItem(preferenceKey, String(next));
    } catch {}
  }
  return (
    <figure className="coach-reaction" data-mood={mood}>
      <div className="coach-reaction-frame">
        {unavailable ? (
          <div className="coach-reaction-fallback">
            <ClipboardList size={30} />
            <span>GIF took a knee.</span>
          </div>
        ) : (
          <img
            src={src}
            width="240"
            height="160"
            alt={reaction.alt}
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setFailed(reaction.id)}
          />
        )}
        {!unavailable && !reduced && (
          <button
            type="button"
            className="coach-reaction-toggle"
            onClick={toggle}
            aria-label={moving ? "Pause reaction GIF" : "Play reaction GIF"}
          >
            {moving ? <Pause size={13} /> : <Play size={13} />}
            {moving ? "Pause GIF" : "Play GIF"}
          </button>
        )}
      </div>
      <figcaption>
        <span className="eyebrow">{reaction.label}</span>
        <p>{reaction.caption}</p>
        <a href={reaction.source} target="_blank" rel="noopener noreferrer">
          {reaction.creator} · via GIPHY
        </a>
        {reduced && <small>Still image · reduced motion</small>}
      </figcaption>
    </figure>
  );
}
