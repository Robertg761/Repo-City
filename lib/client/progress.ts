/**
 * Survey panel copy helpers (PLAN.md sections 44 and 76.6).
 *
 * A stage that stopped short ends its line with why: " (time limit)",
 * " (rate limit)" or " (some pages failed)". The panel shows that note in a
 * quieter tone than the count, so "700 of 21,011 open issues surveyed" reads
 * first and the reason second.
 */

const STOP_NOTES = ["time limit", "rate limit", "some pages failed"] as const;

const TRAILING_NOTE = new RegExp(`\\s\\((${STOP_NOTES.join("|")})\\)$`);

export interface StageDetailParts {
  text: string;
  /** The stop reason without its brackets, or null. */
  note: string | null;
}

/** Splits a known stop note off the end of a stage line; anything else is left whole. */
export function splitStageDetail(detail: string): StageDetailParts {
  const match = TRAILING_NOTE.exec(detail);
  if (!match) return { text: detail, note: null };
  return { text: detail.slice(0, match.index), note: match[1] };
}
