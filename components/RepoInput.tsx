"use client";

/**
 * Top-centre repository entry (PLAN.md section 40). Entering another repository
 * regenerates the city inside the same screen; it never navigates.
 * W0 ships the skeleton; W6 owns the finished control.
 */

import { useState, type FormEvent } from "react";
import { useCityStore } from "@/store/useCityStore";

export default function RepoInput() {
  const [value, setValue] = useState("");
  const phase = useCityStore((s) => s.phase);
  const analyze = useCityStore((s) => s.actions.analyze);

  const busy = phase === "analyzing" || phase === "building";
  const hasCity = phase === "ready";

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    void analyze(value);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="absolute left-1/2 top-5 flex w-[min(30rem,80vw)] -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/40 p-1.5 pl-4 backdrop-blur"
    >
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={hasCity ? "Analyze another repo" : "Enter GitHub repository"}
        aria-label="GitHub repository"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
      />
      <button
        type="submit"
        disabled={busy}
        className="shrink-0 rounded-full bg-white/90 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-slate-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Surveying" : "Survey"}
      </button>
    </form>
  );
}
