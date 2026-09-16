/**
 * The one place core reaches into `providers/`. Importing this registers
 * every built-in provider and integration, so `buildAgent` can resolve the
 * names a fresh config uses without listing them. It is a module of its own
 * rather than a line in `agent.ts` so the assembly's imports stay about
 * assembly, and so a program embedding Parlour with providers of its own has
 * a single seam to leave out.
 */
import "../providers/index.ts";
