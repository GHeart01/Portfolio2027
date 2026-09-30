/**
 * The `sim` island: runs the pursuit sim at 10 ticks/s in a <pre>. The grid is decorative (aria-hidden);
 * a live region announces catches, and the controls are real buttons.
 */
import { motionAllowed } from "../fx/glyph-dissolve";
import { renderHtml, statusLine } from "./render";
import { SCENARIO_NAMES, type ScenarioName } from "./scenarios";
import { DT, World } from "./world";

const SPEEDS = [0.5, 1, 2, 4];

export function mount(root: HTMLElement): void {
  const screen = root.querySelector<HTMLPreElement>("pre.sim-screen");
  const status = root.querySelector<HTMLElement>(".sim-status");
  const live = root.querySelector<HTMLElement>(".sim-live");
  const controls = root.querySelector<HTMLElement>(".sim-controls");
  if (!screen || !status || !live || !controls) return;

  let scenario: ScenarioName = "Scatter";
  let world = new World(scenario, 1337);
  let speed = 1;
  let userPaused = !motionAllowed();
  let visible = true;
  let acc = 0;
  let last = performance.now();
  let lastCatches = 0;

  const btn = (label: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  };
  const play = btn("", () => {
    userPaused = !userPaused;
    syncPlay();
  });
  const syncPlay = () => {
    play.textContent = userPaused ? "play" : "pause";
    play.setAttribute("aria-pressed", String(!userPaused));
  };
  const reset = btn("reset", () => {
    world = new World(scenario, 1337);
    lastCatches = 0;
    draw();
  });
  const scen = btn(`map: ${scenario}`, () => {
    scenario = SCENARIO_NAMES[(SCENARIO_NAMES.indexOf(scenario) + 1) % SCENARIO_NAMES.length]!;
    scen.textContent = `map: ${scenario}`;
    world = new World(scenario, 1337);
    lastCatches = 0;
    draw();
  });
  const spd = btn(`speed: ${speed}×`, () => {
    speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length]!;
    spd.textContent = `speed: ${speed}×`;
  });
  controls.replaceChildren(play, reset, scen, spd);
  controls.hidden = false;
  syncPlay();

  function draw() {
    screen!.innerHTML = renderHtml(world);
    status!.textContent = statusLine(world);
  }

  // Pause when scrolled away or the tab is hidden; stop for good once removed from the page.
  const io = new IntersectionObserver((entries) => (visible = entries.some((e) => e.isIntersecting)));
  io.observe(screen);

  const frame = (now: number) => {
    if (!root.isConnected) {
      io.disconnect();
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    if (!userPaused && visible && !document.hidden) {
      acc += dt * speed;
      let stepped = false;
      while (acc >= DT) {
        world.step();
        acc -= DT;
        stepped = true;
      }
      if (stepped) {
        draw();
        if (world.catches !== lastCatches) {
          lastCatches = world.catches;
          live!.textContent = `Caught the target. ${world.catches} catch${world.catches === 1 ? "" : "es"} so far.`;
        }
      }
    }
    requestAnimationFrame(frame);
  };
  draw();
  requestAnimationFrame(frame);
}
