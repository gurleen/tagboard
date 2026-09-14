//! Retrieval of Instagram posts through the endpoint that backs the official
//! post embed.
//!
//! `instagram.com/p/{shortcode}/embed/captioned/` is the document the embed
//! iframe loads. It needs no credentials and no reviewed Meta application, but
//! it is served in two forms: a quarter-megabyte single-page shell to an
//! ordinary request, and a small server-rendered document carrying the post
//! itself when the request presents as a frame navigation. `Sec-Fetch-Mode:
//! navigate` is the single header that decides which one arrives, and it cannot
//! be set from a web view — the browser writes the `Sec-` headers itself and
//! refuses to let script override them — so the request is issued here.
//!
//! The document is handed back unmodified; `instagram-embed.ts` reads the
//! fields out of it and maps them onto the `FetchedPost` shape the ingestion
//! pipeline persists.

use crate::error::{Error, Result};

const ENDPOINT_PREFIX: &str = "https://www.instagram.com/p/";
const ENDPOINT_SUFFIX: &str = "/embed/captioned/";

/// Sent because the endpoint is not documented for general use and an absent
/// user agent is the kind of signal an edge tier rejects.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/// Requested because the like count reaches the caller only as rendered text —
/// `409,463 likes` — and the parser that reads it expects English grouping.
const ACCEPT_LANGUAGE: &str = "en-US,en;q=0.9";

/// Shortcodes run to eleven characters today. The bound is generous rather than
/// exact: it exists to keep a malformed identifier out of the request URL, and
/// the character test below does the real work.
const MAX_SHORTCODE_LENGTH: usize = 64;

/// Fetches the embed document for one post by its shortcode.
///
/// The `/p/` path serves every post type, reels and IGTV included, so the
/// segment the operator pasted does not have to be reproduced here.
///
/// Returns the document untouched. A post that is deleted, private or from a
/// disabled account still answers 200, with a document that carries a broken
/// media notice instead of the post; that case is recognised by the caller.
#[tauri::command]
pub async fn instagram_fetch_embed(shortcode: String) -> Result<String> {
    if shortcode.is_empty()
        || shortcode.len() > MAX_SHORTCODE_LENGTH
        || !shortcode
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
    {
        return Err(Error::InstagramRequest(format!(
            "\"{shortcode}\" is not an Instagram post shortcode."
        )));
    }

    let url = format!("{ENDPOINT_PREFIX}{shortcode}{ENDPOINT_SUFFIX}");

    let response = reqwest::Client::new()
        .get(&url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .header(reqwest::header::ACCEPT_LANGUAGE, ACCEPT_LANGUAGE)
        // The one header that decides whether the post is rendered into the
        // response at all. See the module comment.
        .header("Sec-Fetch-Mode", "navigate")
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(Error::InstagramStatus(response.status().as_u16()));
    }

    Ok(response.text().await?)
}

#[cfg(test)]
mod tests {
    /// Exercises the live endpoint. Ignored by default: it needs the network
    /// and asserts against a post that only Instagram can keep available.
    ///
    /// `C` is the shortcode of the second photo posted to the service, which is
    /// as durable a fixture as the platform offers.
    #[tokio::test]
    #[ignore = "requires network access"]
    async fn retrieves_the_rendered_embed_from_the_live_endpoint() {
        let document = super::instagram_fetch_embed("C".to_owned())
            .await
            .expect("the endpoint should answer");

        // The shell served to a request without `Sec-Fetch-Mode: navigate`
        // carries none of these.
        assert!(document.contains(r#"data-media-type="GraphImage""#));
        assert!(document.contains(r#"class="UsernameText">kevin<"#));
    }

    #[tokio::test]
    async fn rejects_an_identifier_that_is_not_a_shortcode() {
        assert!(super::instagram_fetch_embed("kevin/p/C".to_owned())
            .await
            .is_err());
        assert!(super::instagram_fetch_embed(String::new()).await.is_err());
    }
}
