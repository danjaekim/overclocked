export function showPause(overlays, { onResume, onQuit }) {
  overlays.show(
    `<h2>Paused</h2>
     <button class="btn primary" data-act="resume">Resume</button>
     <button class="btn" data-act="quit">Quit run</button>`,
    (act) => {
      if (act === 'resume') onResume();
      else if (act === 'quit') onQuit();
    }
  );
}
