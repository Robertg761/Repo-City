import { describe, expect, it } from "vitest";
import type { GhContentFile } from "@/types/github";
import type { TreeEntry } from "@/types/repository";
import {
  MAX_FILE_BYTES,
  MAX_MANIFESTS,
  decodeContent,
  selectManifests,
  toSnapshotFile,
  truncateBytes,
} from "./files";

const blob = (path: string): TreeEntry => ({ path, type: "blob", size: 10 });
const dir = (path: string): TreeEntry => ({ path, type: "tree" });

describe("selectManifests", () => {
  it("takes at most three, in the documented priority order", () => {
    const chosen = selectManifests([
      blob("composer.json"),
      blob("Gemfile"),
      blob("go.mod"),
      blob("pyproject.toml"),
      blob("Cargo.toml"),
      blob("package.json"),
    ]);
    expect(chosen).toEqual(["package.json", "Cargo.toml", "pyproject.toml"]);
    expect(chosen.length).toBeLessThanOrEqual(MAX_MANIFESTS);
  });

  it("prefers the shallowest copy in a monorepo", () => {
    const chosen = selectManifests([
      blob("packages/core/package.json"),
      blob("packages/cli/package.json"),
      blob("package.json"),
    ]);
    expect(chosen).toEqual(["package.json"]);
  });

  it("falls back to a nested manifest when there is no root one", () => {
    expect(selectManifests([blob("crates/engine/Cargo.toml")])).toEqual([
      "crates/engine/Cargo.toml",
    ]);
  });

  it("ignores directories and unrelated files", () => {
    expect(selectManifests([dir("package.json"), blob("src/index.ts")])).toEqual([]);
  });

  it("matches manifest names case-insensitively", () => {
    expect(selectManifests([blob("gemfile")])).toEqual(["gemfile"]);
  });
});

describe("decodeContent", () => {
  it("decodes the base64 GitHub sends, newlines and all", () => {
    const encoded = Buffer.from("# Repo City\n", "utf8").toString("base64");
    expect(decodeContent(`${encoded.slice(0, 4)}\n${encoded.slice(4)}`, "base64")).toBe(
      "# Repo City\n",
    );
  });

  it("passes plain text through", () => {
    expect(decodeContent("plain", "none")).toBe("plain");
  });

  it("answers an empty string for an empty payload", () => {
    expect(decodeContent("", "base64")).toBe("");
    expect(decodeContent(undefined, "base64")).toBe("");
  });
});

describe("truncateBytes", () => {
  it("leaves short text alone", () => {
    expect(truncateBytes("hello", 8192)).toBe("hello");
  });

  it("cuts to the byte budget", () => {
    const cut = truncateBytes("x".repeat(20000), MAX_FILE_BYTES);
    expect(Buffer.byteLength(cut, "utf8")).toBeLessThanOrEqual(MAX_FILE_BYTES);
    expect(cut.length).toBe(MAX_FILE_BYTES);
  });

  it("does not leave half a multi-byte character behind", () => {
    const cut = truncateBytes("é".repeat(100), 11);
    expect(Buffer.byteLength(cut, "utf8")).toBeLessThanOrEqual(11);
    expect(cut).toBe("é".repeat(5));
  });
});

describe("toSnapshotFile", () => {
  const content = (body: string): GhContentFile => ({
    type: "file",
    name: "README.md",
    path: "README.md",
    sha: "x",
    size: body.length,
    html_url: "",
    download_url: null,
    content: Buffer.from(body, "utf8").toString("base64"),
    encoding: "base64",
  });

  it("decodes and caps at 8 KB", () => {
    const file = toSnapshotFile(content("y".repeat(20000)));
    expect(file?.path).toBe("README.md");
    expect(Buffer.byteLength(file?.content ?? "", "utf8")).toBe(MAX_FILE_BYTES);
  });

  it("answers null for a missing response, a directory, or an empty file", () => {
    expect(toSnapshotFile(null)).toBeNull();
    expect(toSnapshotFile({ ...content("a"), type: "dir" as GhContentFile["type"] })).toBeNull();
    expect(toSnapshotFile({ ...content(""), content: "", encoding: "none" })).toBeNull();
  });

  it("uses the requested path when the response omits one", () => {
    const file = toSnapshotFile(
      { ...content("hi"), path: undefined as unknown as string },
      "go.mod",
    );
    expect(file?.path).toBe("go.mod");
  });
});
