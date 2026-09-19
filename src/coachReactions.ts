import type { CoachMood } from "../shared/coachMood";

// Curated shareable GIFs, not a live search. Keep media off the API critical path.
const clips = {
  rocky: {
    id: "d2ZfsyuPQ18nypVK",
    creator: "Rocky",
    alt: "Rocky putting in work on the punching bag",
    page: "rockymovie-movie-rocky-sylvester-stallone-d2ZfsyuPQ18nypVK",
  },
  sweat: {
    id: "ovIhVrW7KTWEmIE65l",
    creator: "unitedstatesofgifs",
    alt: "Jordan Peele sweating through a tense moment",
    page: "sweating-jordan-peele-ovIhVrW7KTWEmIE65l",
  },
  dance: {
    id: "3o6fIQsOFFiKtA8svK",
    creator: "NFL",
    alt: "An NFL touchdown celebration dance",
    page: "nfl-football-3o6fIQsOFFiKtA8svK",
  },
  disappointed: {
    id: "ULzqMvXiDJ53cA50N4",
    creator: "NFL",
    alt: "A disappointed reaction on the NFL sideline",
    page: "nfl-sports-football-sport-ULzqMvXiDJ53cA50N4",
  },
  confused: {
    id: "l0MYOWccgT2THDP6E",
    creator: "NFL",
    alt: "A Kansas City coach looking puzzled on the sideline",
    page: "nfl-football-andy-reid-l0MYOWccgT2THDP6E",
  },
  clap: {
    id: "3o7TKsoVuOCiiw7Zx6",
    creator: "NFL",
    alt: "A Dallas Cowboys coach clapping on the sideline",
    page: "nfl-football-dallas-cowboys-3o7TKsoVuOCiiw7Zx6",
  },
};
export const coachReactions: Record<
  CoachMood,
  { clip: keyof typeof clips; label: string; caption: string }
> = {
  "check-film": {
    clip: "confused",
    label: "CHECK THE DAMN FILM",
    caption: "Coach needs fresh numbers. The headset isn’t a crystal ball.",
  },
  underdog: {
    clip: "rocky",
    label: "COMEBACK WORK STARTS HERE",
    caption: "Down on paper. Still a pain in their ass.",
  },
  nailbiter: {
    clip: "sweat",
    label: "EVERY DAMN DECIMAL",
    caption: "Totally calm. That’s just the headset leaking.",
  },
  favorite: {
    clip: "clap",
    label: "FINISH THE DAMN JOB",
    caption: "Nice forecast. Keep clapping, keep working. No parade yet.",
  },
  win: {
    clip: "dance",
    label: "PERMISSION TO TALK YOUR SHIT",
    caption: "Final whistle. Actual win. Now bring the cooler.",
  },
  loss: {
    clip: "disappointed",
    label: "BRUISED. NOT FINISHED.",
    caption:
      "That sucked. Watch the film. Make next week somebody else’s problem.",
  },
  tie: {
    clip: "confused",
    label: "ALL THAT FOR A DAMN TIE?",
    caption: "Even the victory cooler is asking for a refund.",
  },
};
export function coachReaction(mood: CoachMood) {
  const reaction = coachReactions[mood] || coachReactions["check-film"];
  const clip = clips[reaction.clip];
  return {
    ...reaction,
    ...clip,
    gif: `https://media.giphy.com/media/${clip.id}/200.gif`,
    still: `https://media.giphy.com/media/${clip.id}/200_s.gif`,
    source: `https://giphy.com/gifs/${clip.page}`,
  };
}
