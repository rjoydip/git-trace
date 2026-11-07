/**
 * `git-trace login` — the ladder from `auth.ts`, made actionable:
 * - already signed in: say where the token came from and stop;
 * - `gh` installed but signed out: run its browser login;
 * - no `gh`: open the token page and print how to pass the token.
 *
 * Nothing is stored. The token lives in the environment (or in `gh`'s store),
 * which is where every other tool already looks.
 */
import { spawnSync } from "node:child_process";
import { detectAuth, openInBrowser, TOKEN_URL } from "../auth";
import { write } from "../render";
import type { Command } from "../args";

export const login: Command = {
  name: "login",
  summary: "Sign in to GitHub with `gh`, or get a token URL",
  usage: "git-trace login [--no-open]",
  options: {
    "no-open": { type: "boolean", description: "Print the token URL instead of opening it" },
  },

  async run({ values, auth }) {
    if (auth.token) {
      write(`Already signed in (${auth.source ?? "token"}).`);
      return 0;
    }

    if (auth.gh === "unauthenticated") {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        write("`gh` is installed but not signed in. Run `gh auth login`, then retry.");
        return 1;
      }
      write("Opening the GitHub login flow through `gh`…");
      const result = spawnSync(
        "gh",
        ["auth", "login", "--hostname", "github.com", "--git-protocol", "https", "--web"],
        { stdio: "inherit" },
      );
      if (result.status !== 0) {
        write("`gh auth login` did not finish. Run it yourself, then retry.");
        return 1;
      }
      // `gh` writes its token to its own store; re-read it through the same ladder.
      const after = detectAuth(undefined);
      if (after.token) {
        write("Signed in to GitHub through `gh`.");
        return 0;
      }
      write("`gh` still has no token. Run `gh auth login` and retry.");
      return 1;
    }

    // No `gh` on PATH: a personal access token is the only way in.
    write("Create a GitHub token (scope `public_repo`; add `repo` for private repositories):");
    write(`  ${TOKEN_URL}`);
    if (values["no-open"] !== true && process.stdout.isTTY && openInBrowser(TOKEN_URL)) {
      write("(opened in your browser)");
    }
    write("");
    write("Then pass it to the CLI, either way:");
    write('  export GITHUB_TOKEN=<token>          # PowerShell: $env:GITHUB_TOKEN = "<token>"');
    write("  git-trace --token <token> trace owner/name");
    return 1;
  },
};
