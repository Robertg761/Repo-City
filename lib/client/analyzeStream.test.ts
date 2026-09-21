import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeRepository, AnalyzeError, type StageEvent } from "./analyzeStream";

/** Builds a Response whose body streams `chunks` exactly as written. */
function streamResponse(chunks: string[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, ...init });
}

function mockFetch(response: Response | Error) {
  const fetchMock = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ANALYSIS = { repo: { fullName: "facebook/react" }, source: "live" };

const STAGES = [
  '{"type":"stage","id":"discover","status":"done","detail":"facebook/react"}\n',
  '{"type":"stage","id":"tree","status":"done","detail":"4,218 files mapped"}\n',
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("analyzeRepository", () => {
  it("posts the repo and resolves with the streamed result", async () => {
    const fetchMock = mockFetch(
      streamResponse([...STAGES, `{"type":"result","analysis":${JSON.stringify(ANALYSIS)}}\n`]),
    );
    const stages: StageEvent[] = [];

    const analysis = await analyzeRepository("facebook/react", {
      onStage: (event) => stages.push(event),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/analyze");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ repo: "facebook/react" });

    expect(stages.map((stage) => stage.id)).toEqual(["discover", "tree"]);
    expect(stages[1].detail).toBe("4,218 files mapped");
    expect(analysis.repo.fullName).toBe("facebook/react");
  });

  it("reassembles events split across chunk boundaries", async () => {
    mockFetch(
      streamResponse([
        '{"type":"stage","id":"disco',
        'ver","status":"running"}\n{"type":"stage","id":"tree","status":"done"}',
        `\n{"type":"result","analysis":${JSON.stringify(ANALYSIS)}}`,
      ]),
    );
    const stages: StageEvent[] = [];

    await analyzeRepository("o/r", { onStage: (event) => stages.push(event) });

    expect(stages).toEqual([
      { type: "stage", id: "discover", status: "running", detail: undefined },
      { type: "stage", id: "tree", status: "done", detail: undefined },
    ]);
  });

  it("rejects with the code and the plan copy from an error event", async () => {
    mockFetch(
      streamResponse([
        STAGES[0],
        '{"type":"error","code":"NOT_FOUND","message":"repo 404 from GitHub"}\n',
      ]),
    );

    const failure = await analyzeRepository("o/r", { onStage: () => {} }).catch((e) => e);

    expect(failure).toBeInstanceOf(AnalyzeError);
    expect(failure.code).toBe("NOT_FOUND");
    expect(failure.message).toBe(
      "Repository not found. Repo City only supports public repositories.",
    );
  });

  it("rejects when a line is not valid JSON", async () => {
    mockFetch(streamResponse([STAGES[0], "not json at all\n"]));

    const failure = await analyzeRepository("o/r", { onStage: () => {} }).catch((e) => e);

    expect(failure.code).toBe("STREAM_FAILED");
  });

  it("rejects when the stream ends without a result", async () => {
    mockFetch(streamResponse(STAGES));

    const failure = await analyzeRepository("o/r", { onStage: () => {} }).catch((e) => e);

    expect(failure.code).toBe("STREAM_FAILED");
    expect(failure.message).toMatch(/before the city was built/);
  });

  it("maps a non-streaming HTTP failure onto a plan error code", async () => {
    mockFetch(
      new Response(JSON.stringify({ code: "RATE_LIMITED", message: "secondary limit" }), {
        status: 429,
      }),
    );

    const failure = await analyzeRepository("o/r", { onStage: () => {} }).catch((e) => e);

    expect(failure.code).toBe("RATE_LIMITED");
    expect(failure.message).toMatch(/temporarily limiting analysis/);
  });

  it("falls back to the status code when the error body is not JSON", async () => {
    mockFetch(new Response("<html>504</html>", { status: 504 }));

    const failure = await analyzeRepository("o/r", { onStage: () => {} }).catch((e) => e);

    expect(failure.code).toBe("TIMEOUT");
    expect(failure.message).toBe("Survey took too long. Please try again.");
  });

  it("reports a network failure rather than a crash", async () => {
    mockFetch(new TypeError("Failed to fetch"));

    const failure = await analyzeRepository("o/r", { onStage: () => {} }).catch((e) => e);

    expect(failure.code).toBe("NETWORK");
  });

  it("rejects with ABORTED when the caller aborts", async () => {
    const abortError = new DOMException("The user aborted a request.", "AbortError");
    mockFetch(abortError);
    const controller = new AbortController();
    controller.abort();

    const failure = await analyzeRepository("o/r", {
      onStage: () => {},
      signal: controller.signal,
    }).catch((e) => e);

    expect(failure.code).toBe("ABORTED");
  });
});
