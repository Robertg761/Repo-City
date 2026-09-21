import { describe, expect, it } from "vitest";
import { ERROR_COPY, GitHubError } from "./errors";
import { createEventStream, encodeEvent, errorLine, readEvents, stageLine } from "./stream";

describe("encodeEvent", () => {
  it("writes one JSON object per line", () => {
    const line = encodeEvent({ type: "stage", id: "tree", status: "done", detail: "4,218 files mapped" });
    expect(line).toBe('{"type":"stage","id":"tree","status":"done","detail":"4,218 files mapped"}\n');
  });

  it("escapes the newline inside the section 60 rate-limit copy", () => {
    const line = encodeEvent(errorLine("RATE_LIMITED"));
    expect(line.split("\n").filter((part) => part !== "")).toHaveLength(1);
    expect(JSON.parse(line)).toEqual({
      type: "error",
      code: "RATE_LIMITED",
      message: ERROR_COPY.RATE_LIMITED,
    });
  });
});

describe("stageLine", () => {
  it("omits detail entirely when there is none", () => {
    expect(stageLine({ id: "ai", status: "running" })).toEqual({
      type: "stage",
      id: "ai",
      status: "running",
    });
  });
});

describe("createEventStream", () => {
  it("streams the events in order and closes", async () => {
    const stream = createEventStream(async (emit) => {
      emit(stageLine({ id: "discover", status: "running" }));
      emit(stageLine({ id: "discover", status: "done", detail: "honojs/hono" }));
    });

    expect(await readEvents(stream)).toEqual([
      { type: "stage", id: "discover", status: "running" },
      { type: "stage", id: "discover", status: "done", detail: "honojs/hono" },
    ]);
  });

  it("flushes each line as it happens rather than at the end", async () => {
    let release = (): void => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const stream = createEventStream(async (emit) => {
      emit(stageLine({ id: "discover", status: "done" }));
      await gate;
      emit(stageLine({ id: "done", status: "done" }));
    });

    const reader = stream.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"discover"');

    release();
    const second = await reader.read();
    expect(new TextDecoder().decode(second.value)).toContain('"done"');
    reader.releaseLock();
  });

  it("turns a thrown GitHubError into a terminal error line", async () => {
    const stream = createEventStream(async (emit) => {
      emit(stageLine({ id: "discover", status: "running" }));
      throw new GitHubError("NOT_FOUND", "internal detail that must not ship");
    });

    const events = await readEvents(stream);
    expect(events.at(-1)).toEqual({
      type: "error",
      code: "NOT_FOUND",
      message: ERROR_COPY.NOT_FOUND,
    });
    expect(JSON.stringify(events)).not.toContain("internal detail");
  });

  it("turns an unknown throw into UPSTREAM", async () => {
    const stream = createEventStream(async () => {
      throw new Error("something odd");
    });
    expect(await readEvents(stream)).toEqual([
      { type: "error", code: "UPSTREAM", message: ERROR_COPY.UPSTREAM },
    ]);
  });

  it("maps an abort into TIMEOUT", async () => {
    const stream = createEventStream(async () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    });
    expect(await readEvents(stream)).toEqual([
      { type: "error", code: "TIMEOUT", message: ERROR_COPY.TIMEOUT },
    ]);
  });

  it("keeps running safely after the consumer cancels, dropping later lines", async () => {
    let completed = false;
    const stream = createEventStream(async (emit) => {
      emit(stageLine({ id: "discover", status: "running" }));
      await new Promise((tick) => setTimeout(tick, 5));
      // The reader is gone by now; this must be dropped, not throw.
      emit(stageLine({ id: "done", status: "done" }));
      completed = true;
    });

    await stream.cancel();
    await new Promise((tick) => setTimeout(tick, 25));

    expect(completed).toBe(true);
  });
});
