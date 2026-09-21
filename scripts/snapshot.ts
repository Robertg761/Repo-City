/**
 * Prints a `RepositorySnapshot` for one repository, without the Next.js server.
 *
 *   node scripts/snapshot.ts honojs/hono > out.json
 *   node scripts/snapshot.ts https://github.com/facebook/react | head -40
 *
 * stdout is the snapshot JSON and nothing else, so it pipes into `jq`. Stage
 * events, the request count, the wall time and every warning go to stderr.
 *
 * This is the verification tool for PLAN.md sections 29 and 30: it shows the
 * real request count per repository, proves the rename redirect resolves to a
 * canonical name, and shows how a huge repository truncates.
 *
 * `.env.local` is read by hand — no dotenv dependency, and the token is only
 * ever put into `process.env`, never printed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRepoUrl } from "../lib/github/parseRepoUrl.ts";
import { fetchSnapshot } from "../lib/github/snapshot.ts";
import { errorCodeOf, isGitHubError } from "../lib/github/errors.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Minimal `KEY=value` reader: enough for `.env.local`, no dependency. */
function loadEnvFile(file: string): void {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // A real environment variable always wins over the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function main(): Promise<number> {
  loadEnvFile(path.join(projectRoot, ".env.local"));

  const input = process.argv[2];
  if (!input) {
    process.stderr.write("usage: node scripts/snapshot.ts <owner/repo | github url>\n");
    return 2;
  }

  const ref = parseRepoUrl(input);
  if (!ref) {
    process.stderr.write(`INVALID_URL: ${JSON.stringify(input)} is not a GitHub repository\n`);
    return 2;
  }

  process.stderr.write(
    `surveying ${ref.owner}/${ref.repo} (${process.env.GITHUB_TOKEN ? "authenticated" : "anonymous, 60/hour"})\n`,
  );

  const started = Date.now();
  try {
    const snapshot = await fetchSnapshot(ref.owner, ref.repo, {
      onStage: (event) => {
        const detail = event.detail ? ` — ${event.detail}` : "";
        process.stderr.write(`  [${event.status.padEnd(7)}] ${event.id}${detail}\n`);
      },
    });

    const elapsed = Date.now() - started;
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);

    process.stderr.write("\n");
    process.stderr.write(`repository:   ${snapshot.repo.fullName}\n`);
    process.stderr.write(`head:         ${snapshot.repo.headSha || "(unknown)"}\n`);
    process.stderr.write(`requests:     ${snapshot.requestCount}\n`);
    process.stderr.write(`wall time:    ${(elapsed / 1000).toFixed(2)} s\n`);
    process.stderr.write(
      `tree:         ${snapshot.tree.entries.length} entries kept of ${snapshot.tree.totalEntries}` +
        `${snapshot.tree.truncated ? " (truncated)" : ""}\n`,
    );
    process.stderr.write(
      `signals:      ${snapshot.issues.length} issues, ${snapshot.pulls.length} pulls, ` +
        `${snapshot.commits.length} commits, ${snapshot.contributors.length} contributors, ` +
        `${snapshot.workflows.length} workflows, ${snapshot.workflowRuns.length} runs, ` +
        `${snapshot.releases.length} releases, ${snapshot.files.length} files\n`,
    );
    process.stderr.write(`warnings:     ${snapshot.warnings.length}\n`);
    for (const warning of snapshot.warnings) process.stderr.write(`  - ${warning}\n`);
    return 0;
  } catch (error) {
    const elapsed = Date.now() - started;
    const code = errorCodeOf(error);
    const detail = isGitHubError(error) ? error.message : String(error);
    process.stderr.write(`\n${code}: ${detail}\n`);
    process.stderr.write(`wall time:    ${(elapsed / 1000).toFixed(2)} s\n`);
    return 1;
  }
}

process.exitCode = await main();
