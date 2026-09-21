"use client";

/**
 * Failure copy (PLAN.md section 60), shown over the city viewport rather than
 * in place of it: an error never replaces the one screen (section 0.2).
 *
 * The wording comes from `lib/client/errorCopy.ts`, so every code the server
 * can send has one agreed, plain sentence.
 */

import { useCityStore } from "@/store/useCityStore";

export default function ErrorBanner() {
  const error = useCityStore((s) => s.error);
  const phase = useCityStore((s) => s.phase);
  const lastInput = useCityStore((s) => s.lastInput);
  const analyze = useCityStore((s) => s.actions.analyze);
  const dismissError = useCityStore((s) => s.actions.dismissError);

  if (!error) return null;

  const busy = phase === "analyzing" || phase === "building";
  // Retrying an input we already rejected locally would just fail again.
  const canRetry = Boolean(lastInput) && error.code !== "INVALID_URL";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        role="alert"
        className="glass animate-fade-in pointer-events-auto flex w-full max-w-[28rem] items-start gap-3 border-l-2 border-l-rose-400/70 p-3.5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-relaxed text-white/90">{error.message}</p>
          {lastInput ? (
            <p className="mt-1 truncate font-mono text-[11px] text-white/40">{lastInput}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {canRetry ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void analyze(lastInput as string)}
              className="hud-button disabled:cursor-not-allowed disabled:opacity-50"
            >
              Try again
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismissError}
            aria-label="Dismiss"
            className="hud-button px-2 py-1 text-base leading-none tracking-normal"
          >
            {"×"}
          </button>
        </div>
      </div>
    </div>
  );
}
