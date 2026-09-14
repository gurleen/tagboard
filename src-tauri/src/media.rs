//! Local media cache.
//!
//! Social platforms serve avatars, photos and video from CDNs whose URLs expire
//! and whose latency is not acceptable on air. Every asset a post references is
//! therefore copied into the app data directory once, at ingestion, and the board
//! window renders only from disk.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::{Error, Result};

/// Subdirectory of the app data directory holding cached assets.
const CACHE_DIRECTORY: &str = "media";

/// Refuse assets large enough to suggest a full-length video rather than a clip.
const MAXIMUM_BYTE_LENGTH: u64 = 256 * 1024 * 1024;

/// Where a downloaded asset landed, as reported back to the control panel.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedAsset {
    /// Absolute path on disk. Pass through `convertFileSrc` to render it.
    pub path: String,
    /// Path relative to the cache directory; this is what the schema stores.
    pub relative_path: String,
    pub byte_length: u64,
    pub content_type: Option<String>,
}

/// Returns the cache directory, creating it if this is the first run.
fn cache_directory(app: &AppHandle) -> Result<PathBuf> {
    let directory = app.path().app_data_dir()?.join(CACHE_DIRECTORY);
    std::fs::create_dir_all(&directory)?;
    Ok(directory)
}

/// Downloads `url` into the cache under a filename derived from `asset_id`.
///
/// `asset_id` is the media row's primary key, which makes the cached filename
/// stable across re-fetches and lets a deleted row's file be found without a
/// reverse lookup on the original URL.
#[tauri::command]
pub async fn media_cache_store(
    app: AppHandle,
    asset_id: String,
    url: String,
) -> Result<CachedAsset> {
    let response = reqwest::get(&url).await?;
    if !response.status().is_success() {
        return Err(Error::MediaStatus(response.status().as_u16()));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or(value).trim().to_owned());

    if response
        .content_length()
        .is_some_and(|length| length > MAXIMUM_BYTE_LENGTH)
    {
        return Err(Error::MediaStatus(413));
    }

    let bytes = response.bytes().await?;
    let extension = infer_extension(content_type.as_deref(), &url);
    let relative_path = format!("{asset_id}.{extension}");
    let path = cache_directory(&app)?.join(&relative_path);
    std::fs::write(&path, &bytes)?;

    Ok(CachedAsset {
        path: path.to_string_lossy().into_owned(),
        relative_path,
        byte_length: bytes.len() as u64,
        content_type,
    })
}

/// Resolves a stored relative path to an absolute one, or `None` if the file is
/// missing — a cache that was cleared out from under the database, for instance.
#[tauri::command]
pub fn media_cache_resolve(app: AppHandle, relative_path: String) -> Result<Option<String>> {
    let path = cache_directory(&app)?.join(&relative_path);
    Ok(path.exists().then(|| path.to_string_lossy().into_owned()))
}

/// Deletes one cached asset. Absent files are not an error; the caller's intent
/// is that the file be gone.
#[tauri::command]
pub fn media_cache_remove(app: AppHandle, relative_path: String) -> Result<()> {
    let path = cache_directory(&app)?.join(&relative_path);
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

/// Total bytes held by the cache, for the storage readout in settings.
#[tauri::command]
pub fn media_cache_byte_length(app: AppHandle) -> Result<u64> {
    let directory = cache_directory(&app)?;
    let mut total = 0;
    for entry in std::fs::read_dir(directory)? {
        total += entry?.metadata()?.len();
    }
    Ok(total)
}

/// Picks a file extension from the response content type, falling back to the
/// extension in the URL path and finally to a neutral `bin`.
fn infer_extension(content_type: Option<&str>, url: &str) -> String {
    let from_content_type = match content_type {
        Some("image/jpeg") => Some("jpg"),
        Some("image/png") => Some("png"),
        Some("image/gif") => Some("gif"),
        Some("image/webp") => Some("webp"),
        Some("image/avif") => Some("avif"),
        Some("video/mp4") => Some("mp4"),
        Some("video/webm") => Some("webm"),
        Some("video/quicktime") => Some("mov"),
        _ => None,
    };

    from_content_type
        .map(str::to_owned)
        .or_else(|| {
            let path = url.split(['?', '#']).next().unwrap_or(url);
            Path::new(path)
                .extension()
                .and_then(|extension| extension.to_str())
                .filter(|extension| {
                    extension.len() <= 5 && extension.chars().all(char::is_alphanumeric)
                })
                .map(str::to_ascii_lowercase)
        })
        .unwrap_or_else(|| "bin".to_owned())
}
