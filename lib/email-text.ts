const BLOCK_TAGS = /<(script|style|head|noscript)[\s\S]*?<\/\1>/gi;
const COMMENT = /<!--[\s\S]*?-->/g;
const TAG = /<[^>]+>/g;
const MEDIA_TOKEN = /<img\b[^>]*\/?>|<a\b[^>]*>[\s\S]*?<\/a>/gi;
const BARE_URL = /https?:\/\/[^\s<>"']+/gi;
const ENTITY: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

export type CueKind = "link" | "image";

export type EmailCue = {
  kind: CueKind;
  index: number;
  href?: string;
  mark: string;
  label: string;
};

export type CueCounters = {
  link: number;
  image: number;
};

export type ParsedEmail = {
  speech: string;
  cues: EmailCue[];
};

export function makeCue(kind: CueKind, index: number, href?: string): EmailCue {
  const mark = kind === "link" ? `link ${index}` : `imagem ${index}`;
  const label = kind === "link" ? `Link #${index}` : `Imagem #${index}`;
  return { kind, index, href, mark, label };
}

export function emptyCounters(): CueCounters {
  return { link: 0, image: 0 };
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    })
    .replace(/&([a-z]+);/gi, (_, name: string) => ENTITY[name.toLowerCase()] ?? `&${name};`);
}

function stripQuoted(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");
}

function stripSignature(text: string): string {
  const cut = text.search(/\n-- \n|\n_{10,}\n|\nEnviado do meu |\nSent from my /i);
  return cut === -1 ? text : text.slice(0, cut);
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  const raw = match?.[2] ?? match?.[3] ?? match?.[4];
  return raw != null ? decodeEntities(raw) : undefined;
}

export function safeHref(raw: string | undefined): string | undefined {
  const trimmed = (raw ?? "").trim();
  if (!trimmed || /^cid:/i.test(trimmed) || /^data:/i.test(trimmed)) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
  } catch {
    if (/^www\./i.test(trimmed)) {
      try {
        return new URL(`https://${trimmed}`).href;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function isUrlText(text: string): boolean {
  const trimmed = text.trim();
  return /^https?:\/\//i.test(trimmed) || /^www\./i.test(trimmed);
}

function trimUrlMatch(raw: string): string {
  return raw.replace(/[),.]+$/g, "");
}

export function replaceMark(speech: string, from: string, to: string): string {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return speech.replace(new RegExp(`${escaped}(?!\\d)`, "g"), to);
}

export function assignCueNumbers(
  speech: string,
  cues: EmailCue[],
  counters: CueCounters,
): ParsedEmail {
  const ordered = cues.map((cue, index) => ({ cue, index }));
  ordered.sort((a, b) => b.cue.mark.length - a.cue.mark.length);
  let next = speech;
  for (const item of ordered) {
    next = replaceMark(next, item.cue.mark, `⟦C${item.index}⟧`);
  }
  const out: EmailCue[] = [];
  for (const [index, cue] of cues.entries()) {
    counters[cue.kind] += 1;
    const numbered = makeCue(cue.kind, counters[cue.kind], cue.href);
    next = next.replaceAll(`⟦C${index}⟧`, numbered.mark);
    out.push(numbered);
  }
  return { speech: next, cues: out };
}

function replaceMedia(html: string, counters: CueCounters, cues: EmailCue[]): string {
  return html.replace(MEDIA_TOKEN, (raw) => {
    if (/^<img/i.test(raw)) {
      counters.image += 1;
      const cue = makeCue("image", counters.image, safeHref(attr(raw, "src")));
      cues.push(cue);
      return ` ${cue.mark} `;
    }
    counters.link += 1;
    const cue = makeCue("link", counters.link, safeHref(attr(raw, "href")));
    cues.push(cue);
    const inner = decodeEntities(
      raw.replace(/^<a\b[^>]*>/i, "").replace(/<\/a>$/i, "").replace(TAG, " "),
    )
      .replace(/[ \t]+/g, " ")
      .trim();
    if (!inner || isUrlText(inner)) return ` ${cue.mark} `;
    return ` ${inner} ${cue.mark} `;
  });
}

function replaceBareUrls(text: string, counters: CueCounters, cues: EmailCue[]): string {
  return text.replace(BARE_URL, (raw) => {
    const href = safeHref(trimUrlMatch(raw));
    counters.link += 1;
    const cue = makeCue("link", counters.link, href);
    cues.push(cue);
    return ` ${cue.mark} `;
  });
}

function tidySpeech(text: string): string {
  return stripSignature(stripQuoted(text))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function parseEmailHtml(input: string): ParsedEmail {
  const counters = emptyCounters();
  const cues: EmailCue[] = [];
  const withoutBlocks = input.replace(BLOCK_TAGS, " ").replace(COMMENT, " ");
  const withMedia = replaceMedia(withoutBlocks, counters, cues);
  const withBreaks = withMedia
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|blockquote)>/gi, "\n\n");
  const plain = decodeEntities(withBreaks.replace(TAG, " "));
  const withBare = replaceBareUrls(plain, counters, cues);
  return { speech: tidySpeech(withBare), cues };
}

export function htmlToScript(input: string): string {
  return parseEmailHtml(input).speech;
}
