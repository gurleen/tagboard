mod board;
mod database;
mod error;
mod instagram;
mod media;
mod syndication;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            app.manage(database::initialize(app.handle())?);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            database::database_select,
            database::database_execute,
            database::database_batch,
            media::media_cache_store,
            media::media_cache_resolve,
            media::media_cache_remove,
            media::media_cache_byte_length,
            board::board_window_open,
            board::board_window_close,
            board::board_window_is_open,
            board::board_window_set_fullscreen,
            board::board_displays,
            board::board_window_move_to_display,
            syndication::syndication_fetch_post,
            instagram::instagram_fetch_embed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
