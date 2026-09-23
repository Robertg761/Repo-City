/**
 * GitHub-flavoured markdown flattened to one line of plain text, for issue
 * excerpts (PLAN.md section 71.1).
 *
 * Issue bodies are mostly templates: headings ("### What version of Hono are
 * you using?"), HTML comments telling the reporter what to write, fenced
 * stack traces, task lists, links and emphasis. The excerpt keeps the words
 * and drops the markup, so every reader of `bodyExcerpt` (the inspector, the
 * path matcher, the backlog search) gets prose. It follows the same approach
 * as `lib/client/plainText.ts`, which still runs over excerpts recorded before
 * the server did this.
 *
 * Regular expressions, not a parser: the input is a few kilobytes at most,
 * and a stray marker left behind costs less than a dependency.
 */

/** Only the head of a long body can reach the excerpt; never scan more. */
const SCAN_LIMIT = 8_000;

/** Characters markdown lets a backslash escape. */
const ESCAPABLE = /\\([\\`*_{}[\]()#+\-.!|~<>])/g;

const HTML_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  "#39": "'",
};

export function markdownToPlainText(markdown: string | null | undefined): string {
  if (typeof markdown !== "string" || markdown.trim() === "") return "";
  let text = markdown.slice(0, SCAN_LIMIT).replace(/\r\n?/g, "\n");

  // Literal text is set aside first so no later rule can eat it: escaped
  // characters, then inline code (whose content is kept, backticks dropped).
  const held: string[] = [];
  const hold = (value: string): string => `\u0000${held.push(value) - 1}\u0000`;

  // Whole blocks that are not prose: fenced code, closed or cut off by the
  // scan limit, and HTML comments (issue templates are full of them).
  text = text.replace(/^[ \t]*(`{3,}|~{3,})[^`\n]*$(?:\n[\s\S]*?^[ \t]*\1[`~]*[ \t]*$|[\s\S]*)/gm, "\n");
  text = text.replace(/<!--[\s\S]*?(?:-->|$(?![\s\S]))/g, "\n");

  text = text.replace(ESCAPABLE, (_, char: string) => hold(char));
  text = text.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, _ticks: string, code: string) => hold(code.trim()));

  const lines = text.split("\n").map((line) => {
    let out = line.trim();
    // Tables, rules and setext underlines carry no words of their own.
    if (/^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(out)) return "";
    if (/^([-*_=])(\s*\1){2,}$/.test(out)) return "";
    // Link reference definitions: "[1]: https://…".
    if (/^\[[^\]]+\]:\s+\S+/.test(out)) return "";

    // A heading becomes a sentence of its own: "What version? 4.3.7".
    const heading = /^#{1,6}\s+(.*?)(\s+#+)?$/.exec(out);
    if (heading) {
      out = heading[1];
      if (out && !/[.?!:]$/.test(out)) out += ":";
      return out;
    }

    out = out.replace(/^(>\s?)+/, ""); // quotes, nested too
    out = out.replace(/^([-*+]|\d+[.)])\s+/, ""); // list bullets
    out = out.replace(/^\[[ xX]\]\s+/, ""); // task-list boxes
    // A table row keeps its cells as words.
    if (/^\|.*\|$/.test(out)) out = out.slice(1, -1).replace(/\s*\|\s*/g, " ");
    return out;
  });
  text = lines.filter((line) => line !== "").join(" ");

  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images keep their alt text
    .replace(/!\[([^\]]*)\]\[[^\]]*\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links keep their words
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1") // reference links too
    .replace(/<(https?:\/\/[^>\s]+)>/g, "$1") // autolinks
    .replace(/<\/?[a-zA-Z][\w-]*(\s[^<>]*)?\/?>/g, " ") // HTML tags
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2") // bold
    .replace(/\*\*/g, "") // bold left open by the scan limit
    .replace(/(^|[\s(["'])[*_](?=[^*_\s])([^*_]*?[^*_\s])[*_](?=[\s).,!?:;"']|$)/g, "$1$2") // italics
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1") // strikethrough
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (_, name: string) => HTML_ENTITIES[name]);

  text = text.replace(/\u0000(\d+)\u0000/g, (_, index: string) => held[Number(index)] ?? "");
  return text.replace(/\s+/g, " ").trim();
}

/**
 * At most `max` characters of plain text, ending on a whole word with an
 * ellipsis when anything was cut.
 */
export function plainTextExcerpt(markdown: string | null | undefined, max: number): string {
  const text = markdownToPlainText(markdown);
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  const whole = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${whole.replace(/[\s,;:.–—-]+$/, "")}…`;
}
