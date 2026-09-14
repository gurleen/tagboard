//! Retrieval of X posts through the syndication endpoint.
//!
//! `cdn.syndication.twimg.com/tweet-result` is the JSON source the official
//! embed widget reads before it renders a post. It needs no credentials and no
//! paid API tier, but it answers only to `https://platform.twitter.com` under
//! the cross-origin rules, so the request is issued here rather than from the
//! web view.
//!
//! The response is handed back unmodified; `x-syndication.ts` maps it onto the
//! `FetchedPost` shape the ingestion pipeline persists.

use crate::error::{Error, Result};

const ENDPOINT: &str = "https://cdn.syndication.twimg.com/tweet-result";

/// Sent because the endpoint is not documented for general use and an absent
/// user agent is the kind of signal an edge tier rejects.
const USER_AGENT: &str =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/// Digits of the largest radix `to_radix_string` supports.
const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";

/// Radix the widget renders its token in.
const TOKEN_RADIX_F64: f64 = 36.0;

/// Fractional base-36 digits kept in the token.
const TOKEN_FRACTION_DIGITS: usize = 11;

/// Fetches one post by its numeric status id.
///
/// Returns the provider's untouched JSON object. A post that is deleted,
/// protected or from a suspended account still answers 200, with a payload
/// whose `__typename` is not `Tweet`; that case is recognised by the caller.
#[tauri::command]
pub async fn syndication_fetch_post(post_id: String) -> Result<serde_json::Value> {
    if post_id.is_empty() || !post_id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(Error::SyndicationRequest(format!(
            "\"{post_id}\" is not a numeric X status id."
        )));
    }

    let url = format!(
        "{ENDPOINT}?id={post_id}&token={}&lang=en",
        syndication_token(&post_id)
    );

    let response = reqwest::Client::new()
        .get(&url)
        .header(reqwest::header::USER_AGENT, USER_AGENT)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(Error::SyndicationStatus(response.status().as_u16()));
    }

    Ok(response.json().await?)
}

/// Derives the `token` query parameter the way the embed widget does.
///
/// The widget computes `((id / 1e15) * Math.PI).toString(36)` and strips every
/// zero and the radix point. The endpoint accepts any value here, including
/// none — the parameter was verified to be unvalidated — so this reproduces the
/// derivation rather than the exact digit count of a JavaScript engine, whose
/// base-36 renderer stops at a precision boundary that is not worth porting.
/// Sending a token of the right shape keeps the request indistinguishable from
/// the widget's own and preserves whatever cache key it feeds.
fn syndication_token(post_id: &str) -> String {
    let value = post_id.parse::<f64>().unwrap_or_default() / 1e15 * std::f64::consts::PI;
    to_base36(value)
        .bytes()
        .filter(|byte| *byte != b'0' && *byte != b'.')
        .map(char::from)
        .collect()
}

/// Renders a finite, non-negative double in base 36, with a fixed fractional
/// width chosen to match the digit count the widget typically emits.
fn to_base36(value: f64) -> String {
    debug_assert!(value.is_finite() && value >= 0.0);

    let mut integer = value.trunc();
    let mut integer_digits = Vec::new();
    loop {
        let remainder = integer % TOKEN_RADIX_F64;
        integer_digits.push(DIGITS[remainder as usize]);
        integer = (integer - remainder) / TOKEN_RADIX_F64;
        if integer <= 0.0 {
            break;
        }
    }
    integer_digits.reverse();

    let mut rendered = String::from_utf8(integer_digits).expect("radix digits are ASCII");
    rendered.push('.');

    let mut fraction = value.fract();
    for _ in 0..TOKEN_FRACTION_DIGITS {
        fraction *= TOKEN_RADIX_F64;
        let digit = fraction as usize;
        rendered.push(char::from(DIGITS[digit]));
        fraction -= digit as f64;
    }
    rendered
}

#[cfg(test)]
mod tests {
    use super::{syndication_token, to_base36};

    /// Integer renderings are exact, so these are the values a base-36 table gives.
    #[test]
    fn renders_the_integer_part_in_base_36() {
        assert!(to_base36(0.0).starts_with("0."));
        assert!(to_base36(35.0).starts_with("z."));
        assert!(to_base36(1296.0).starts_with("100."));
        assert!(to_base36(1455.9410318593468).starts_with("14f.xvks611"));
    }

    /// Exercises the live endpoint. Ignored by default: it needs the network
    /// and asserts against a post that only X can keep available.
    #[tokio::test]
    #[ignore = "requires network access"]
    async fn retrieves_a_post_from_the_live_endpoint() {
        let payload = super::syndication_fetch_post("20".to_owned())
            .await
            .expect("the endpoint should answer");
        assert_eq!(payload["__typename"], "Tweet");
        assert_eq!(payload["text"], "just setting up my twttr");
        assert_eq!(payload["user"]["screen_name"], "jack");
    }

    #[tokio::test]
    async fn rejects_an_identifier_that_is_not_numeric() {
        assert!(super::syndication_fetch_post("jack/status".to_owned())
            .await
            .is_err());
    }

    /// The token carries no zeros or radix point, and is stable for an id.
    #[test]
    fn derives_a_stripped_token() {
        let token = syndication_token("1460323737035677698");
        assert!(token.starts_with("3jfqq1vhq"));
        assert!(token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() && byte != b'0'));
        assert_eq!(token, syndication_token("1460323737035677698"));
    }
}
