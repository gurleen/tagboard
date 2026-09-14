use serde::{Serialize, Serializer};

/// Every failure that can cross the IPC boundary into the web view.
///
/// Tauri requires command errors to be `Serialize`; each variant is rendered as
/// its `Display` string so the front end receives a single readable message.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("unsupported parameter type in query binding: {0}")]
    UnsupportedParameter(String),

    #[error("filesystem error: {0}")]
    Io(#[from] std::io::Error),

    #[error("network error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("media download failed with status {0}")]
    MediaStatus(u16),

    #[error("the X syndication endpoint answered with status {0}")]
    SyndicationStatus(u16),

    #[error("{0}")]
    SyndicationRequest(String),

    #[error("the Instagram embed endpoint answered with status {0}")]
    InstagramStatus(u16),

    #[error("{0}")]
    InstagramRequest(String),

    #[error("{0}")]
    Tauri(#[from] tauri::Error),

    #[error("the database connection is unavailable because a previous operation panicked")]
    ConnectionPoisoned,
}

impl Serialize for Error {
    fn serialize<S: Serializer>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
