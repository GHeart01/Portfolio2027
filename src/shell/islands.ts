/**
 * Interactive widgets inside command output (the `ask` chat, the `sim`). Sections mark them with
 * [data-island="name"]; their code is only downloaded when one is actually shown.
 */
type Mount = (el: HTMLElement) => void | Promise<void>;

const ISLANDS: Record<string, () => Promise<{ mount: Mount }>> = {};

export function registerIsland(name: string, load: () => Promise<{ mount: Mount }>): void {
  ISLANDS[name] = load;
}

export function mountIslands(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>("[data-island]:not([data-mounted])").forEach((el) => {
    const load = ISLANDS[el.dataset.island ?? ""];
    if (!load) return;
    el.dataset.mounted = "";
    load()
      .then((m) => m.mount(el))
      .catch((err: unknown) => {
        console.error(`island ${el.dataset.island} failed`, err);
        delete el.dataset.mounted;
      });
  });
}
