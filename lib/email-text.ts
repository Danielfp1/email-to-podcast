const BLOCK_TAGS = /<(script|style|head|noscript)[\s\S]*?<\/\1>/gi;
const TAG = /<[^>]+>/g;
const ENTITY: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

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

export function htmlToScript(input: string): string {
  const withoutBlocks = input.replace(BLOCK_TAGS, " ");
  const withBreaks = withoutBlocks
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li)>/gi, "\n\n");
  const plain = decodeEntities(withBreaks.replace(TAG, " "));
  const cleaned = stripSignature(stripQuoted(plain))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return cleaned;
}
