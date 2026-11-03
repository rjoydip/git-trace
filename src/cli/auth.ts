/**
 * Who the CLI is, as far as GitHub is concerned. The ladder is `--token`,
 * `GITHUB_TOKEN`, `GH_TOKEN`, then the GitHub CLI's own store. When none of
 * them answers, `git-trace login` takes over: `gh auth login` if `gh` is
 * installed, a token URL if it is not.
 */
import { spawnSync } from "node:child_process";

export type TokenSource = "--token" | "GITHUB_TOKEN" | "GH_TOKEN" | "gh";

export type GhState = "authenticated" | "unauthenticated" | "missing";

export interface AuthState {
  token?: string;
  source?: TokenSource;
  /** Only probed when neither a flag nor the environment supplied a token. */
  gh?: GhState;
}

export interface GhProbe {
  state: GhState;
  token?: string;
}

/** The page that creates a classic PAT with the scope this tool needs. */
export const TOKEN_URL =
  "https://github.com/settings/tokens/new?scopes=public_repo&description=git-trace";

/** `gh auth token` answers both questions: is gh installed, and is it signed in. */
export function probeGh(): GhProbe {
  const result = spawnSync("gh", ["auth", "token"], { encoding: "utf8", timeout: 5_000 });
  if (result.error) {
    const code = (result.error as NodeJS.ErrnoException).code;
    return { state: code === "ENOENT" ? "missing" : "unauthenticated" };
  }
  const token = result.stdout?.trim() ?? "";
  return result.status === 0 && token
    ? { state: "authenticated", token }
    : { state: "unauthenticated" };
}

export function detectAuth(
  flag: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  probe: () => GhProbe = probeGh,
): AuthState {
  const explicit = flag?.trim();
  if (explicit) return { token: explicit, source: "--token" };

  const fromGithub = env.GITHUB_TOKEN?.trim();
  if (fromGithub) return { token: fromGithub, source: "GITHUB_TOKEN" };

  const fromGh = env.GH_TOKEN?.trim();
  if (fromGh) return { token: fromGh, source: "GH_TOKEN" };

  const { state, token } = probe();
  return token ? { token, source: "gh", gh: state } : { gh: state };
}

/** One line a failed request can print: what the user should do next. */
export function loginHint(auth: AuthState): string {
  return auth.gh === "unauthenticated"
    ? "`gh` is installed but not signed in — run `git-trace login` (it runs `gh auth login`)."
    : `No GitHub token — run \`git-trace login\`, or create one at ${TOKEN_URL}`;
}

/** Best-effort: the URL is printed either way, so a headless box is not stuck. */
export function openInBrowser(url: string): boolean {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];
  try {
    const result = spawnSync(command, args, { stdio: "ignore" });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}
