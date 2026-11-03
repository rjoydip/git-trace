import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { GLOBAL_OPTIONS } from "../src/cli/args";
import { COMMANDS } from "../src/cli/commands";

/**
 * `docs/cli.md` is generated, then formatted, so an exact string match would
 * only test the formatter. Check that every command and flag is documented —
 * enough to catch a new flag that was never regenerated.
 */
const docs = readFileSync(new URL("../docs/cli.md", import.meta.url), "utf8");

test("docs/cli.md documents every command and every flag", () => {
  for (const flag of Object.keys(GLOBAL_OPTIONS)) {
    expect(docs).toContain(`--${flag}`);
  }
  for (const command of COMMANDS) {
    expect(docs).toContain(`git-trace ${command.name}`);
    for (const flag of Object.keys(command.options)) {
      expect(docs).toContain(`--${flag}`);
    }
  }
});
