/**
 * Lazy islands. Each loader is a dynamic import, so its code ships only when that command runs.
 */
import { registerIsland } from "./islands";

void registerIsland; // islands are registered here as they're built (ask, sim)
