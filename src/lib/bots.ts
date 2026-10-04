/**
 * Link previewers and crawlers fetch a quote link without a person looking at it
 * (WhatsApp and iMessage previews, Slack unfurls, search engines). They must not
 * mark the quote as viewed.
 */
const BOT_PATTERN = new RegExp(
  [
    "whatsapp",
    "facebookexternalhit",
    "facebot",
    "slackbot",
    "slack-imgproxy",
    "twitterbot",
    "linkedinbot",
    "discordbot",
    "telegrambot",
    "skypeuripreview",
    "bingbot",
    "bingpreview",
    "googlebot",
    "google-inspectiontool",
    "adsbot",
    "applebot",
    "yandex",
    "duckduckbot",
    "baiduspider",
    "pinterest",
    "embedly",
    "quora link preview",
    "outbrain",
    "vkshare",
    "w3c_validator",
    "headlesschrome",
    "lighthouse",
    "preview",
    "crawler",
    "spider",
    "bot[/ ;)]",
    "bot$",
    "curl/",
    "wget/",
    "python-requests",
    "node-fetch",
    "go-http-client",
  ].join("|"),
  "i",
);

/** True for known bots and previewers. A missing user agent counts as a bot. */
export function isBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  if (!ua) return true;
  return BOT_PATTERN.test(ua);
}
