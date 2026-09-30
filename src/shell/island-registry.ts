/**
 * Lazy islands. Each loader is a dynamic import, so its code ships only when that command runs.
 */
import { registerIsland } from "./islands";

registerIsland("ask", () => import("../chat/ui"));
