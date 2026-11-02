/**
 * A local GitHub for the dashboard: a stateful emulator seeded with a small
 * repository, so `/api/*` has something to render without a token or a network.
 *
 *   bun run emulate            # http://127.0.0.1:4010
 *   # .dev.vars: GITHUB_API_URL=http://127.0.0.1:4010
 *   # dashboard:  http://127.0.0.1:5173/?repo=octocat/trace-demo
 *
 * State is in memory: restarting the script gives a fresh history.
 */
import { createEmulator } from "emulate";

const PORT = Number(process.env.EMULATE_PORT ?? 4010);
const OWNER = "octocat";
const REPO = "trace-demo";

/** Seeded users, each with a token the contents API reads the author from. */
const USERS = [
  { login: "octocat", token: "ghp_octocat" },
  { login: "hubot", token: "ghp_hubot" },
  { login: "mona", token: "ghp_mona" },
];

interface Fixture {
  path: string;
  text: string;
  message: string;
  /** Index into `USERS`. */
  author: number;
  /** Days before now, so activity and hot files have a spread. */
  daysAgo: number;
}

const FIXTURES: Fixture[] = [
  {
    path: "src/index.ts",
    text: "export const start = () => 'hello';\n",
    message: "feat: start the app",
    author: 0,
    daysAgo: 20,
  },
  {
    path: "src/util.ts",
    text: "export const double = (n: number) => n * 2;\n",
    message: "feat: add util",
    author: 1,
    daysAgo: 16,
  },
  {
    path: "src/index.ts",
    text: "export const start = () => 'hello world';\n",
    message: "feat: greet the world",
    author: 2,
    daysAgo: 12,
  },
  {
    path: "README.md",
    text: "# trace-demo\n\nSeeded by `scripts/emulate.ts`.\n\n| Tab | What it shows |\n| --- | --- |\n| Overview | stats |\n| Files | the tree |\n",
    message: "docs: explain the demo",
    author: 0,
    daysAgo: 8,
  },
  {
    path: "src/util.ts",
    text: "export const double = (n: number) => n * 2;\nexport const half = (n: number) => n / 2;\n",
    message: "feat: add half",
    author: 1,
    daysAgo: 4,
  },
  {
    path: "src/index.ts",
    text: "export const start = () => 'hello world';\nexport { double, half } from './util';\n",
    message: "refactor: re-export util",
    author: 2,
    daysAgo: 1,
  },
];

const github = await createEmulator({
  service: "github",
  port: PORT,
  seed: {
    tokens: Object.fromEntries(
      USERS.map((user) => [user.token, { login: user.login, scopes: ["repo", "user"] }]),
    ),
    github: {
      users: USERS.map((user) => ({ login: user.login })),
      repos: [
        {
          owner: OWNER,
          name: REPO,
          description: "Seeded history for the git-trace dashboard",
          language: "TypeScript",
          topics: ["demo", "git-trace"],
          auto_init: true,
        },
      ],
    },
  },
});

const owner = USERS[0]!;

const api = async (method: string, path: string, body: unknown, token: string) => {
  const res = await fetch(`${github.url}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${await res.text()}`);
  return res;
};

// The other seeded users write to the repo, so their commits are theirs.
for (const user of USERS.slice(1)) {
  await api(
    "PUT",
    `/repos/${OWNER}/${REPO}/collaborators/${user.login}`,
    { permission: "push" },
    owner.token,
  );
}

/** Updating an existing file needs its blob sha, as on github.com. */
const shaOf = async (path: string): Promise<string | undefined> => {
  const res = await fetch(`${github.url}/repos/${OWNER}/${REPO}/contents/${path}`, {
    headers: { authorization: `Bearer ${owner.token}` },
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as { sha?: string } | unknown[];
  return Array.isArray(body) ? undefined : body.sha;
};

for (const fixture of FIXTURES) {
  const author = USERS[fixture.author] ?? owner;
  const date = new Date(Date.now() - fixture.daysAgo * 86_400_000).toISOString();
  const sha = await shaOf(fixture.path);
  await api(
    "PUT",
    `/repos/${OWNER}/${REPO}/contents/${fixture.path}`,
    {
      message: fixture.message,
      content: Buffer.from(fixture.text).toString("base64"),
      ...(sha ? { sha } : {}),
      author: { name: author.login, email: `${author.login}@localhost`, date },
      committer: { name: author.login, email: `${author.login}@localhost`, date },
    },
    author.token,
  );
}

const commits = (await (
  await fetch(`${github.url}/repos/${OWNER}/${REPO}/commits`, {
    headers: { authorization: `Bearer ${owner.token}` },
  })
).json()) as Array<{ commit: { message: string; author: { name: string; date: string } } }>;

console.log(`
  github   ${github.url}
  repo     ${OWNER}/${REPO}  (${commits.length} commits)

  .dev.vars -> GITHUB_API_URL=${github.url}
  dashboard -> http://127.0.0.1:5173/?repo=${OWNER}/${REPO}

  Ctrl+C to stop; state is in memory.
`);

const close = () => {
  void github.close().then(() => process.exit(0));
};
process.on("SIGINT", close);
process.on("SIGTERM", close);
