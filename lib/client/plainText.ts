/**
 * An issue body as a sentence or two of plain text for the inspector.
 *
 * `bodyExcerpt` arrives as the first few hundred characters of raw GitHub
 * markdown (`lib/github/issues.ts`): template headings ("### What version of
 * Hono are you using?"), fenced code, HTML comments and tags, link syntax and
 * emphasis markers. Printed as it is, the inspector read like a diff. This
 * keeps the words, drops the markup, and ends on a whole word.
 */

/** The longest description the inspector shows, in characters. */
export const PLAIN_EXCERPT_LENGTH = 240;

export function plainExcerpt(markdown: string | null | undefined, max = PLAIN_EXCERPT_LENGTH): string {
  if (typeof markdown !== "string" || markdown.trim() === "") return "";
  let text = markdown.replace(/\r\n?/g, "\n");

  // Whole blocks that are not prose: fenced code (closed or cut off by the
  // excerpt), HTML comments (issue templates are full of them), tables.
  text = text.replace(/```[\s\S]*?(```|$)/g, "\n");
  text = text.replace(/~~~[\s\S]*?(~~~|$)/g, "\n");
  text = text.replace(/<!--[\s\S]*?(-->|$)/g, "\n");
  text = text.replace(/^\s*\|.*\|\s*$/gm, "");

  const lines = text.split("\n").map((line) => {
    let out = line.trim();
    // A heading becomes a sentence of its own: "What version? 4.3.7".
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(out);
    if (heading) {
      out = heading[1];
      if (out && !/[.?!:]$/.test(out)) out += ":";
      return out;
    }
    out = out.replace(/^>\s?/, ""); // quotes
    out = out.replace(/^([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/, ""); // list bullets and task boxes
    return out;
  });
  text = lines.filter((line) => line !== "").join(" ");

  text = text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images: keep the alt text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links: keep the words
    .replace(/<\/?[a-zA-Z][^>]*>/g, " ") // HTML tags
    .replace(/`([^`]*)`/g, "$1") // inline code
    .replace(/(\*\*|__)(.+?)\1/g, "$2") // bold
    .replace(/\*\*/g, "") // bold cut open by the excerpt's end
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,!?:;]|$)/g, "$1$2") // italics
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  const whole = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${whole.replace(/[\s,;:.–—-]+$/, "")}…`;
}
