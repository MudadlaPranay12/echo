// Copies non-TypeScript assets the compiled test build imports into .test-build.
// tsc emits require("./echo_seed_data.json") but does not copy the JSON itself.
import { copyFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const out = join(process.cwd(), ".test-build", "lib");
mkdirSync(out, { recursive: true });
copyFileSync(join(process.cwd(), "lib", "echo_seed_data.json"), join(out, "echo_seed_data.json"));
console.log("copied lib/echo_seed_data.json -> .test-build/lib");
