import { fmtTime } from './overlay.js';

export function showResults(overlays, summary, { onAgain, onTitle }) {
  const title = summary.won ? 'You survived' : 'You fell';
  overlays.show(
    `<h2>${title}</h2>
     <div class="stats">
       <div><span>Time</span><b>${fmtTime(summary.time)}</b></div>
       <div><span>Kills</span><b>${summary.kills}</b></div>
       <div><span>Seed</span><b>${summary.seed}</b></div>
     </div>
     <button class="btn primary" data-act="again">Play again</button>
     <button class="btn" data-act="title">Title</button>`,
    (act) => {
      if (act === 'again') onAgain();
      else if (act === 'title') onTitle();
    }
  );
}
