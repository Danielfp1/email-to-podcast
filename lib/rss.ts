import type { RssEpisode } from "./redis.js";
import { shownotesHtml } from "./shownotes.js";

function xmlEscape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function itunesDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function feedSelfUrl(requestUrl: string): string {
  const origin = new URL(requestUrl).origin;
  const token = process.env.RSS_TOKEN ?? "";
  return `${origin}/feed/${encodeURIComponent(token)}.xml`;
}

export function podcastImageUrl(requestUrl: string): string {
  const env = process.env.PODCAST_IMAGE_URL?.trim();
  if (env) return env;
  return `${new URL(requestUrl).origin}/cover.jpg`;
}

function itemDescription(item: RssEpisode): string {
  if (!item.description) return "";
  const html = shownotesHtml(item.description);
  return `
      <description><![CDATA[${html}]]></description>
      <content:encoded><![CDATA[${html}]]></content:encoded>`;
}

export function renderRss(items: RssEpisode[], requestUrl: string): string {
  const self = feedSelfUrl(requestUrl);
  const cover = podcastImageUrl(requestUrl);
  const newest = items.at(-1)?.pubDate;
  const lastBuild = newest ? new Date(newest).toUTCString() : new Date().toUTCString();
  const itemXml = items
    .slice()
    .reverse()
    .map((item) => {
      const enclosure = item.url
        ? `\n      <enclosure url="${xmlEscape(item.url)}" length="${item.length}" type="audio/mpeg" />\n      <itunes:duration>${itunesDuration(item.durationSeconds)}</itunes:duration>`
        : "";
      const chapters = item.chaptersUrl
        ? `\n      <podcast:chapters url="${xmlEscape(item.chaptersUrl)}" type="application/json+chapters" />`
        : "";
      return `    <item>
      <title>${xmlEscape(item.title)}</title>
      <guid isPermaLink="false">${xmlEscape(item.guid)}</guid>
      <pubDate>${new Date(item.pubDate).toUTCString()}</pubDate>${itemDescription(item)}${enclosure}${chapters}
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>Feed</title>
    <link>${xmlEscape(self)}</link>
    <description>Pasta Outlook Feed em áudio.</description>
    <language>pt-BR</language>
    <itunes:image href="${xmlEscape(cover)}" />
    <image>
      <url>${xmlEscape(cover)}</url>
      <title>Feed</title>
      <link>${xmlEscape(self)}</link>
    </image>
    <lastBuildDate>${lastBuild}</lastBuildDate>
    <atom:link href="${xmlEscape(self)}" rel="self" type="application/rss+xml" />
${itemXml}
  </channel>
</rss>
`;
}
