# Post retrieval

## The two ways a post gets in

**Pasted permalink.** The operator pastes one or more X or Instagram links.
`src/lib/ingestion/permalink.ts` parses each into a `PostReference` — platform, platform post id,
canonical permalink, author handle where the URL carries it. It handles `x.com`, `twitter.com` and
`mobile.twitter.com` status URLs including a trailing `/photo/1`, and `instagram.com` `p`, `reel`,
`reels` and `tv` URLs including the profile-prefixed form.

The post row is written **before** retrieval is attempted, with `resolution_state` set to
`resolving`. A provider failure therefore leaves a visible, retryable record with the error on it
rather than nothing at all. Media downloads run after the row is committed and are not awaited.

**Composed by hand.** The operator types author, handle, body and media URLs. This is the fallback
that keeps the panel usable with no provider configured, and the way anything that is not a post —
a graphic, a house message — gets on a board.

Saved searches and hashtag feeds are not implemented. The `search` value in the `origin` enum is
reserved for them.

## The retrieval interface

`src/lib/ingestion/fetcher.ts` defines the whole contract:

```ts
interface PostFetcher {
	readonly platform: Platform;
	readonly providerName: string;
	isConfigured(): boolean;
	fetch(reference: PostReference): Promise<FetchedPost>;
}
```

Fetchers are registered per platform, and the pipeline picks one by platform rather than branching
on platform itself. X is served by `XSyndicationFetcher`, Instagram by `InstagramEmbedFetcher`;
neither needs a credential, so both report `isConfigured()` as true wherever the Tauri runtime is
present, and false in a plain browser, where the Rust command they depend on does not exist. A
platform with no fetcher at all raises `FetcherUnavailableError`, and a fetcher whose provider is
not available raises `FetcherNotConfiguredError` with an explanation the panel shows the operator.
Both classes, and `PostUnavailableError`, live in `src/lib/ingestion/errors.ts` rather than beside
the contract: `fetcher.ts` imports every provider in order to register it, so a provider that
imported an error class back out of `fetcher.ts` would close a cycle and read the registry while it
was still being evaluated. The settings page lists every registered fetcher and its state.

When a further provider is chosen, only a `PostFetcher` implementation is added. Nothing downstream
of `FetchedPost` knows which provider produced a record.

## X: the syndication endpoint

`src/lib/ingestion/x-syndication.ts` reads
`https://cdn.syndication.twimg.com/tweet-result?id={id}&token={token}&lang=en`, which is the JSON
source the official embed widget consults before it renders a post. It needs no credentials, has no
post cap, and returns fields rather than markup.

Embedding the post's own page instead was considered and rejected: `x.com` serves
`X-Frame-Options: SAMEORIGIN` and `frame-ancestors 'self' https://x.com https://twitter.com`, so a
frame pointed at a permalink never renders. The one frame X does permit,
`platform.twitter.com/embed/Tweet.html`, is cross-origin, so the same-origin policy would leave a
post visible but unreadable to script.

The request is issued from `src-tauri/src/syndication.rs` rather than from the web view, because
the endpoint's `Access-Control-Allow-Origin` names `https://platform.twitter.com` alone. The `token`
parameter is derived from the id the way the widget derives it; the endpoint does not presently
validate it.

What the payload does **not** carry:

- **`repostCount`** — absent entirely, stored as `null`.
- **`replyCount`** — only `conversation_count`, the size of the whole conversation, which counts
  nested replies that the platform's own reply figure excludes.

A deleted, protected or suspended-account post answers `200` with a payload whose `__typename` is
not `Tweet`; the fetcher raises `PostUnavailableError` and the row is left in `failed` for a retry.

The endpoint is undocumented, so X may change or withdraw it without notice. The `PostFetcher`
interface confines that risk to the one file.

## Instagram: the embed document

`src/lib/ingestion/instagram-embed.ts` reads
`https://www.instagram.com/p/{shortcode}/embed/captioned/`, the document the official post embed
iframe loads. It needs no credentials, no reviewed Meta application and no per-post fee, which is
what decided it over the three options previously weighed here: oEmbed, which now demands an app
token; the Graph API, whose Basic Display tier reaches only accounts that authorise the
application; and a third-party aggregator, which bills per post and adds a dependency on someone
else's terms.

The `/p/` path serves every post type — reels and IGTV included — so the segment the operator
pasted does not have to be reproduced in the request.

### The header the endpoint turns on

The endpoint answers in two entirely different forms:

- To an ordinary request, a **624 KB single-page shell** carrying no post data whatsoever.
- To a request presenting **`Sec-Fetch-Mode: navigate`**, a **240 KB server-rendered document** with
  the post in it.

That one header is the whole of the difference. `Sec-Fetch-Dest`, `Sec-Fetch-Site`, `Referer`,
`Accept`, and the widget's own `?cr=1&v=14&wp=…&rd=…` query parameters were each tested and none of
them changes which form arrives.

This is why the request is issued from `src-tauri/src/instagram.rs` rather than from the web view:
`Sec-` headers are forbidden header names, written by the browser itself, and script is not
permitted to set them. Loading the endpoint in a frame instead would satisfy the header — a frame
navigation carries it natively — but leave the document cross-origin and so unreadable to script,
exactly as on X. Rust also sends a browser user agent, because an absent one is the kind of signal
an edge tier rejects, and `Accept-Language: en-US,en;q=0.9`, because the like count reaches the
caller only as rendered text (`409,463 likes`) and the parser that reads it expects English
grouping. The Rust side validates the shortcode against `[A-Za-z0-9_-]{1,64}` and hands the
document back unmodified.

### Parsing

Instagram publishes no JSON blob in the embed any more — no `contextJSON`, no `shortcode_media`, no
`gql_data`, no `__additionalData` — so unlike X, the mapping layer parses markup. `DOMParser` does
the reading, which is safe because the app is a `ssr = false` SPA and a DOM always exists. The
`.Embed` root carries `data-media-id`, `data-media-type`, `data-owner-id` and `data-permalink`;
those four assertions are what goes into `raw`, since the document itself is a quarter of a
megabyte of page furniture and is not worth a column.

What the document does **not** carry, in each case stored as `null`:

- **`postedAt`** — the embed prints no date at all.
- **`repostCount`**, **`replyCount`** — neither figure is rendered.
- **`language`** — never declared.
- **`authorVerified`** — the badge is omitted, so no post resolves as verified; `false` for every
  record, and the operator can still set it by hand.

Four further limits are worth stating plainly:

- **Video is a still.** A reel or in-feed video yields only its cover frame, which is a JPEG. It is
  recorded with `kind: 'image'`, because that is what the file is, and a board handed `video` would
  render a `<video>` element over a photograph.
- **A carousel is its first frame.** `data-media-type="GraphSidecar"` marks it, and the asset's
  `description` is set to say so.
- **Avatars are 100 px.** They are served at `s100x100` and signed at that size; rewriting the URL
  to a larger variant returns `403`, because the signature covers the size parameter. This is
  deliberately unlike the X fetcher, which does rewrite `_normal` to `_400x400`.
- **`authorName` is the handle.** The embed prints the username where every other network prints a
  display name, and carries the display name nowhere.

A deleted, private or disabled-account post answers `200` with a broken-media notice in place of the
post: no `.Embed` root, and a `.EmbedBrokenMedia .ebmMessage` line reading "The link to this photo
or video may be broken, or the post may have been removed." The fetcher raises
`PostUnavailableError` carrying that line, and the row is left in `failed` for a retry.

The endpoint is undocumented, so Instagram may change or withdraw it without notice — the header
behaviour above especially. The `PostFetcher` interface confines that risk to the one file.

## Where credentials would go

Neither implemented path needs any. If a provider that does need them is ever added, they belong in
the Rust side rather than in the web view, and the request should be made from Rust for the same
reason both current requests already are: a token in the front end is readable by anything running
in the web view, and `reqwest` is already there.
