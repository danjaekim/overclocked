// The saved run: one JSON snapshot (game/run-snapshot.js) of the run in progress, written when the
// game pauses and dropped when the run ends or is quit. It lives under its own key so a big or
// failed write can never touch the meta save. Storage may be missing or throw (private windows,
// full quota), so every access is wrapped; without it the game just doesn't offer a resume.
// createRunSave(storage) takes the storage object so tests can pass a fake.

const KEY = 'overclocked.run.v1';

export function createRunSave(storage) {
  return {
    // Writes the snapshot; false if it could not be stored (the old one is dropped either way).
    save(snapshot) {
      if (!storage) return false;
      try {
        storage.setItem(KEY, JSON.stringify(snapshot));
        return true;
      } catch (e) {
        try { storage.removeItem(KEY); } catch (e2) { /* ignore */ }
        return false;
      }
    },
    // The stored snapshot, or null if there is none or it is unreadable.
    load() {
      if (!storage) return null;
      try {
        const raw = storage.getItem(KEY);
        if (!raw) return null;
        const snap = JSON.parse(raw);
        return snap && typeof snap === 'object' ? snap : null;
      } catch (e) {
        return null;
      }
    },
    has() {
      try { return !!(storage && storage.getItem(KEY)); } catch (e) { return false; }
    },
    clear() {
      try { if (storage) storage.removeItem(KEY); } catch (e) { /* ignore */ }
    },
  };
}
