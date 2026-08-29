import * as React from "react";

/**
 * A deliberately small markdown renderer: headings, paragraphs, bullet and
 * numbered lists, bold, italic, inline code. Enough for prep notes, explainers
 * and the brief; no HTML passthrough, so nothing user-written can inject markup.
 */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i++}`;
    if (tok.startsWith("**")) out.push(<strong key={key} className="font-[590]">{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) out.push(<code key={key} className="mono text-12 px-1 py-0.5 rounded bg-[var(--bg-hover)]">{tok.slice(1, -1)}</code>);
    else out.push(<em key={key}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, className }: { source: string | null; className?: string }) {
  if (!source?.trim()) return null;
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  let ordered = false;

  const flush = () => {
    if (!list.length) return;
    const items = list.map((t, i) => <li key={i} className="pl-0.5">{inline(t, `li${blocks.length}-${i}`)}</li>);
    blocks.push(
      ordered
        ? <ol key={`b${blocks.length}`} className="list-decimal ml-4 space-y-1 my-2">{items}</ol>
        : <ul key={`b${blocks.length}`} className="list-disc ml-4 space-y-1 my-2">{items}</ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const number = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet) { if (ordered) flush(); ordered = false; list.push(bullet[1]); continue; }
    if (number) { if (!ordered && list.length) flush(); ordered = true; list.push(number[1]); continue; }
    flush();
    if (!line.trim()) continue;
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      const size = level <= 2 ? "text-13 font-[590] mt-3 mb-1" : "text-12 font-[590] mt-2 mb-1";
      blocks.push(<p key={`b${blocks.length}`} className={size}>{inline(h[2], `h${blocks.length}`)}</p>);
      continue;
    }
    blocks.push(
      <p key={`b${blocks.length}`} className="my-2 leading-[1.55]">{inline(line, `p${blocks.length}`)}</p>,
    );
  }
  flush();

  return <div className={className}>{blocks}</div>;
}
