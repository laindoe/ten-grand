# Community wall activity ticker

The ticker combines published, non-sample broadcasts with the newest public
campaign submissions. It shows at most 20 items, newest first. Voices Heard
uses “Name shared their voice,” or “Someone shared their voice” for an empty
name. Submission text, audio, and response titles never appear in the ticker.

Broadcasts come from the Jekyll-generated `community-activity.json` feed.
Changes in Pages CMS must finish publishing through GitHub Pages before they
appear. Open walls check for published changes every 30 seconds and when the
visitor returns to the tab.

Campaigns use Supabase Realtime to refresh when their tables change, with the
same 30-second polling fallback. Only approved Voices Heard submissions are
queried, matching the existing public wall. Pending submissions become ticker
items when approved. Existing database row-level security must continue to
restrict anonymous access to public submissions.

For immediate campaign updates, enable each campaign table in the Supabase
`supabase_realtime` publication (Database → Publications). This repository does
not configure the remote database. Without that setting, polling still works.

## Adding a campaign

Add a source to `_data/community_ticker.yml` with a unique `id`, Supabase
`table`, `name_field`, `date_field`, `status_field`, `public_status`, and
`message`. The table must have an `id` column and allow anonymous reads of
public rows through row-level security. Use `{name}` in the generic message,
for example “{name} joined the campaign.” Omit `status_field` only for a table
whose entire anonymously readable contents are intended to be public.

Publish the site, and enable the table's Realtime publication for immediate
updates. All configured campaigns share the same ticker automatically; no
JavaScript changes are required.
