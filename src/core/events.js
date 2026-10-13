// Tiny synchronous event bus. For loose coupling (UI <- game, FX <- damage) only;
// core simulation order must never depend on it.

export function createEvents() {
  const handlers = new Map();
  return {
    on(name, fn) {
      let list = handlers.get(name);
      if (!list) handlers.set(name, (list = []));
      list.push(fn);
      return () => this.off(name, fn);
    },
    off(name, fn) {
      const list = handlers.get(name);
      if (!list) return;
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    },
    emit(name, a, b, c) {
      const list = handlers.get(name);
      if (!list) return;
      for (let i = 0; i < list.length; i++) list[i](a, b, c);
    },
    clear() { handlers.clear(); },
  };
}
