# Data model

Declared in `src/lib/database/schema.ts`; migrations generated from it live in `drizzle/`.

Conventions across every table:

- Primary keys are text, filled with `crypto.randomUUID()` on insert.
- `created_at` and `updated_at` are millisecond timestamps; `updated_at` is rewritten on every
  update by Drizzle, and the board window uses it to detect changes worth re-rendering.
- Enumerated columns are plain text constrained in TypeScript, not SQL check constraints, so a new
  value does not require a migration.
- Column names are snake_case; the Drizzle client is configured with `casing: 'snake_case'`, so the
  schema declares camelCase fields and the SQL comes out snake_case.

## `post`

One social media post, however it arrived.

| Group      | Columns                                                                                                        |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| Source     | `platform` (`x`, `instagram`, `manual`), `origin` (`url`, `manual`, `search`), `platform_post_id`, `permalink` |
| Author     | `author_name`, `author_handle`, `author_profile_url`, `author_verified`                                        |
| Content    | `body`, `language`, `posted_at`                                                                                |
| Engagement | `like_count`, `repost_count`, `reply_count`                                                                    |
| Retrieval  | `resolution_state` (`pending`, `resolving`, `complete`, `failed`), `resolution_error`, `raw_payload`           |
| Review     | `review_state` (`pending`, `approved`, `rejected`, `archived`), `reviewed_at`, `review_note`, `starred`        |

`unique(platform, platform_post_id)` means the same post cannot be ingested twice; pasting a link
that is already in the library returns the existing record rather than a duplicate. Indexes cover
`review_state`, `platform` and `resolution_state`, which are the three filters the panel applies.

The two state columns answer different questions and are deliberately separate. `resolution_state`
is about the machine: did retrieval succeed? `review_state` is about the operator: does this go on
air? A post whose retrieval failed still exists, is visible, and can be retried or completed by
hand.

`raw_payload` keeps whatever the provider returned. Nothing reads it yet; it is there so a provider
change does not lose data that was already fetched.

`origin` includes `search`, which is unused. Saved searches were considered and deferred; the value
is reserved so adding them later does not need a migration.

## `media`

An avatar or attachment belonging to a post. Cascades on post deletion.

| Column                           | Purpose                                      |
| -------------------------------- | -------------------------------------------- |
| `role`                           | `avatar` or `attachment`                     |
| `kind`                           | `image`, `animation`, `video`                |
| `position`                       | Display order among a post's attachments     |
| `source_url`                     | Where it came from                           |
| `cached_path`                    | Path relative to the media cache directory   |
| `cache_state`                    | `pending`, `downloading`, `cached`, `failed` |
| `cache_error`                    | Why a download failed, shown in the panel    |
| `byte_length`, `content_type`    | Recorded from the response                   |
| `width`, `height`, `duration_ms` | Intrinsic dimensions, when known             |
| `description`                    | Alt text                                     |

The cached file is named after the media row's own identifier, so re-fetching overwrites in place
and a deleted row's file can be found without a reverse lookup on the URL.

## `board`

One video wall output: a grid shape, a rotation speed, and a look.

| Column                                                           | Default               |
| ---------------------------------------------------------------- | --------------------- |
| `layout` (`grid`, `carousel`, `single`)                          | `grid`                |
| `column_count`, `row_count`                                      | 3 × 2                 |
| `rotation_interval_ms`                                           | 8000                  |
| `transition` (`fade`, `slide`, `none`), `transition_duration_ms` | `fade`, 600           |
| `show_metrics`, `show_timestamp`, `show_platform_badge`          | off, on, on           |
| `theme`                                                          | `DEFAULT_BOARD_THEME` |
| `is_live`                                                        | false                 |

`theme` is a JSON column holding a `BoardTheme`: background, surface, text and accent colours, a
font family, a text scale and a corner radius. The board window turns these into CSS custom
properties, so the wall's look is data rather than code.

At most one board has `is_live` set. `setLiveBoard` clears and sets in one transaction to keep it
that way.

## `board_entry`

A post's place on a board. Cascades from both sides.

| Column                       | Purpose                                                  |
| ---------------------------- | -------------------------------------------------------- |
| `position`                   | Running order                                            |
| `pinned`                     | Holds a cell on every page instead of rotating out       |
| `last_aired_at`, `air_count` | Written by the board window each time the entry is shown |

`unique(board_id, post_id)` — a post appears on a board once. Only approved posts can be added;
`addPostsToBoard` refuses the rest, so nothing reaches air without a verdict.

## `setting`

A key–value table with a JSON value, for panel preferences that do not deserve a column.
