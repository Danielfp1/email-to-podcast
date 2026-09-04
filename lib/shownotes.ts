import type { EmailCue } from "./email-text.js";

export type Chapter = {
  startTime: number;
  title: string;
  url?: string;
  img?: string;
};

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export function cueTimeInSegment(
  text: string,
  mark: string,
  segmentStart: number,
  duration: number,
): number {
  const idx = text.indexOf(mark);
  if (idx < 0 || text.length === 0) return segmentStart;
  return segmentStart + (idx / text.length) * duration;
}

export function chapterFromCue(cue: EmailCue, startTime: number): Chapter {
  const chapter: Chapter = { startTime, title: cue.label };
  if (cue.kind === "image" && cue.href) chapter.img = cue.href;
  if (cue.kind === "link" && cue.href) chapter.url = cue.href;
  return chapter;
}

export function formatShownotes(chapters: Chapter[]): string {
  const lines: string[] = [];
  for (const chapter of chapters) {
    lines.push(`${formatClock(chapter.startTime)} ${chapter.title}`);
    const href = chapter.url ?? chapter.img;
    if (href) lines.push(`     ${href}`);
  }
  return lines.join("\n");
}

export function chaptersPayload(chapters: Chapter[]): { version: string; chapters: Chapter[] } {
  return {
    version: "1.2.0",
    chapters: chapters.map((chapter) => {
      const row: Chapter = {
        startTime: Math.round(chapter.startTime * 100) / 100,
        title: chapter.title,
      };
      if (chapter.url) row.url = chapter.url;
      if (chapter.img) row.img = chapter.img;
      return row;
    }),
  };
}

export function shownotesHtml(text: string): string {
  const escaped = text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
  return escaped
    .replace(/(https?:\/\/[^\s<]+)/g, (_, url: string) => `<a href="${url}">${url}</a>`)
    .replaceAll("\n", "<br/>\n");
}
