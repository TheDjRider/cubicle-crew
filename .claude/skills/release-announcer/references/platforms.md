# Platforms

UIs change. Treat the paths below as starting points, look at the actual page, and
stop and report when something doesn't match instead of clicking around blindly.

## LinkedIn

- Composer: https://www.linkedin.com/feed/ → "Start a post".
- Length: up to ~3,000 characters; only the first ~2–3 lines show before "…see more",
  so the hook goes first.
- Media: image, GIF or video via the media button in the composer.
- Scheduling: the composer has a clock icon next to Post. Set date/time there, then the
  button becomes "Schedule". Only click it in `schedule` mode after approval.
- Draft mode: leave the composer open and filled. Don't close the dialog — LinkedIn may
  ask to save a draft, and closing loses unsaved text.
- Company Page: if the config has `"as": "page"`, switch the author in the composer
  (or post from the Page admin view).

## X (Twitter)

- Composer: https://x.com/compose/post (or the Post button on x.com/home).
- Length: 280 characters on a standard account; longer only if the account has
  Premium. Count before typing. If it doesn't fit, make a short thread (2–3 posts) with
  the "+" button rather than cutting the link.
- Links count as ~23 characters each.
- Media: up to 4 images, or one GIF, or one video.
- Scheduling: if the composer shows a schedule (calendar/clock) icon, it can be used in
  `schedule` mode. If it's not there, fall back to draft mode and say so.
- Draft mode: leave the composer filled and open.

## Facebook

- Personal profile: https://www.facebook.com/ → "What's on your mind?". Personal posts
  **cannot be scheduled**; always draft mode. Check the audience selector (Public vs
  Friends) matches the config, but don't change it without the config saying so.
- Page: scheduling works through Meta Business Suite
  (https://business.facebook.com/ → Create post → Schedule). Use this path only when
  the config has `"as": "page"`.
- Link previews: pasting the URL generates a preview card; if an image or video is
  attached, the preview may be replaced. That's fine.
- Groups: never post into groups unless the user names the group in the config.

## Reddit

- Composer: https://www.reddit.com/r/<subreddit>/submit
- Scheduling is a moderator-only feature. Assume draft mode: fill title, body,
  flair and media, and stop.
- Before filling anything, open the subreddit's rules (sidebar / "About") and check:
  self-promotion allowed? specific days (e.g. "Showoff Saturday")? required flair?
  title format? If the rules forbid it, skip that subreddit and report why.
- One subreddit per run unless the config lists several, and write a different title
  and opening for each — identical cross-posts get flagged as spam.
- Reddit dislikes marketing tone. Write as the developer: what you built, why, what's
  new, and ask for feedback. Put the link in the body, and if it's a showcase sub,
  lead with the GIF/video.
- Title limit: 300 characters. Keep it well under.

## Possible subreddits (verify rules every time)

r/ClaudeAI, r/ClaudeCode, r/SideProject, r/PixelArt (only if the art is the focus),
r/electronjs, r/node. The user decides which go in the config.
