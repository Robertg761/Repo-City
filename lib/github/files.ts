/**
 * Requests 11 to 14 of PLAN.md section 29: the README and up to three
 * manifests.
 *
 * These are the only file contents Repo City reads. They carry most of the
 * documentation signal (PLAN.md section 16), the language and dependency
 * signal, and the grounding evidence the optional AI layer is allowed to see
 * (PLAN.md section 28). Everything else about a file comes from its path and
 * size in the tree.
 *
 * Each file is cut to 8 KB, per the `RepositorySnapshot` contract.
 */

import type { GhContentFile } from "@/types/github";
import type { RepositorySnapshot, TreeEntry } from "@/types/repository";
import { GitHubClient } from "./client.ts";

export type SnapshotFile = RepositorySnapshot["files"][number];

/** PLAN.md section 71.1: `files[].content` is at most 8 KB. */
export const MAX_FILE_BYTES = 8 * 1024;
/** PLAN.md section 29: at most three manifests, to stay inside the budget. */
export const MAX_MANIFESTS = 3;

/**
 * Manifest file names in priority order. The first three found in the tree are
 * fetched, so a polyglot repository still describes itself with its primary
 * ecosystem first.
 */
export const MANIFEST_PRIORITY = [
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "Gemfile",
  "composer.json",
] as const;

/**
 * `GET /repos/{o}/{r}/readme`: GitHub resolves whichever spelling the
 * repository uses (README.md, readme.rst, docs/README...).
 *
 * @returns `null` when the repository has no README — a real signal, not a
 * failure (PLAN.md section 16).
 */
export async function fetchReadme(
  client: GitHubClient,
  owner: string,
  repo: string,
): Promise<SnapshotFile | null> {
  const raw = await client.getOptional<GhContentFile>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/readme`,
    { resource: "readme" },
  );
  return toSnapshotFile(raw);
}

/**
 * Picks the manifests to fetch out of the pruned tree.
 *
 * Shallower paths win, so a monorepo's root `package.json` is chosen over one
 * of its fifty package manifests.
 */
export function selectManifests(entries: TreeEntry[], limit = MAX_MANIFESTS): string[] {
  const byName = new Map<string, string>();

  for (const entry of entries) {
    if (entry.type !== "blob") continue;
    const name = entry.path.slice(entry.path.lastIndexOf("/") + 1);
    const known = MANIFEST_PRIORITY.find((manifest) => manifest.toLowerCase() === name.toLowerCase());
    if (!known) continue;

    const current = byName.get(known);
    if (!current || depthOf(entry.path) < depthOf(current)) {
      byName.set(known, entry.path);
    }
  }

  const chosen: string[] = [];
  for (const manifest of MANIFEST_PRIORITY) {
    const path = byName.get(manifest);
    if (path) chosen.push(path);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

/** `GET /repos/{o}/{r}/contents/{path}?ref={branch}` for one text file. */
export async function fetchFile(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<SnapshotFile | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const raw = await client.getOptional<GhContentFile>(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`,
    { resource: `file ${path}`, query: { ref } },
  );
  return toSnapshotFile(raw, path);
}

/** Decodes a contents response; `null` when there is nothing readable. */
export function toSnapshotFile(
  raw: GhContentFile | null,
  fallbackPath?: string,
): SnapshotFile | null {
  if (!raw || raw.type !== "file") return null;

  const path = raw.path ?? fallbackPath ?? raw.name ?? "";
  if (path === "") return null;

  const content = decodeContent(raw.content, raw.encoding);
  if (content === "") return null;

  return { path, content: truncateBytes(content, MAX_FILE_BYTES) };
}

/**
 * GitHub base64-encodes file contents with embedded newlines. Files over 1 MB
 * come back with `encoding: "none"` and an empty body; those are skipped
 * rather than fetched through the blobs API, to protect the request budget.
 */
export function decodeContent(content: string | undefined, encoding: string | undefined): string {
  if (typeof content !== "string" || content === "") return "";
  if (encoding !== "base64") return content;

  const clean = content.replace(/\s+/g, "");
  try {
    if (typeof Buffer !== "undefined") return Buffer.from(clean, "base64").toString("utf8");
    const binary = atob(clean);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

/** Cuts to `maxBytes` UTF-8 bytes without splitting a character. */
export function truncateBytes(text: string, maxBytes: number): string {
  if (typeof Buffer !== "undefined") {
    const buffer = Buffer.from(text, "utf8");
    if (buffer.byteLength <= maxBytes) return text;
    // `toString` on a cut buffer ends in a replacement character when the cut
    // lands mid-sequence; dropping it keeps the text clean.
    return buffer.subarray(0, maxBytes).toString("utf8").replace(/�+$/, "");
  }

  const encoder = new TextEncoder();
  if (encoder.encode(text).length <= maxBytes) return text;
  return new TextDecoder("utf-8", { fatal: false })
    .decode(encoder.encode(text).subarray(0, maxBytes))
    .replace(/�+$/, "");
}

function depthOf(path: string): number {
  return path.split("/").length;
}
