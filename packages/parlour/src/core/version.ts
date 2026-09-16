import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Read at start-up rather than imported as JSON, so the compiled `dist/core`
// and the stripped `src/core` both find `package.json` two directories up
// without a JSON import attribute that older tooling trips over.
const packageFile = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "package.json");
const manifest = JSON.parse(readFileSync(packageFile, "utf8")) as { version: string };

/** The package version, as `parlour --version` and the MCP client report it. */
export const VERSION: string = manifest.version;
