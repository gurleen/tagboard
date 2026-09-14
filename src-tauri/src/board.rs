//! The video board window.
//!
//! The board is a second webview showing the rotating grid, normally pushed
//! fullscreen onto a second display feeding the video wall. It is created on
//! demand rather than at startup so the operator can open the control panel
//! without lighting up the board output.

use serde::Serialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::Result;

/// Window label the control panel addresses the board by.
pub const BOARD_WINDOW_LABEL: &str = "board";

/// Front-end route the board window loads.
const BOARD_ROUTE: &str = "/board";

/// A display the board window can be sent to.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Display {
    pub name: Option<String>,
    pub width: u32,
    pub height: u32,
    pub position_x: i32,
    pub position_y: i32,
    pub scale_factor: f64,
    pub is_primary: bool,
}

/// Opens the board window, or focuses it if it is already open.
#[tauri::command]
pub async fn board_window_open(app: AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window(BOARD_WINDOW_LABEL) {
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        BOARD_WINDOW_LABEL,
        WebviewUrl::App(BOARD_ROUTE.into()),
    )
    .title("Tagboard Board")
    .inner_size(1920.0, 1080.0)
    .decorations(true)
    .resizable(true)
    .build()?;

    Ok(())
}

/// Closes the board window. Doing so while it is not open is not an error.
#[tauri::command]
pub async fn board_window_close(app: AppHandle) -> Result<()> {
    if let Some(window) = app.get_webview_window(BOARD_WINDOW_LABEL) {
        window.close()?;
    }
    Ok(())
}

/// Reports whether the board window currently exists.
#[tauri::command]
pub fn board_window_is_open(app: AppHandle) -> bool {
    app.get_webview_window(BOARD_WINDOW_LABEL).is_some()
}

/// Enters or leaves fullscreen on the board window.
#[tauri::command]
pub async fn board_window_set_fullscreen(app: AppHandle, fullscreen: bool) -> Result<()> {
    if let Some(window) = app.get_webview_window(BOARD_WINDOW_LABEL) {
        window.set_fullscreen(fullscreen)?;
    }
    Ok(())
}

/// Lists the displays attached to this machine so the operator can choose which
/// one carries the board.
#[tauri::command]
pub fn board_displays(app: AppHandle) -> Result<Vec<Display>> {
    let window = app
        .get_webview_window(BOARD_WINDOW_LABEL)
        .or_else(|| app.get_webview_window("main"));

    let Some(window) = window else {
        return Ok(Vec::new());
    };

    let primary = window.primary_monitor()?;
    let primary_name = primary.as_ref().and_then(|monitor| monitor.name().cloned());

    Ok(window
        .available_monitors()?
        .into_iter()
        .map(|monitor| {
            let size = monitor.size();
            let position = monitor.position();
            Display {
                is_primary: monitor.name() == primary_name.as_ref(),
                name: monitor.name().cloned(),
                width: size.width,
                height: size.height,
                position_x: position.x,
                position_y: position.y,
                scale_factor: monitor.scale_factor(),
            }
        })
        .collect())
}

/// Moves the board window onto the display whose origin is at the given position,
/// then fills that display.
#[tauri::command]
pub async fn board_window_move_to_display(
    app: AppHandle,
    position_x: i32,
    position_y: i32,
) -> Result<()> {
    if let Some(window) = app.get_webview_window(BOARD_WINDOW_LABEL) {
        window.set_fullscreen(false)?;
        window.set_position(tauri::PhysicalPosition::new(position_x, position_y))?;
        window.set_fullscreen(true)?;
    }
    Ok(())
}
