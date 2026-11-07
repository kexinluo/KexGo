mod audio;
mod commands;
mod library;
mod lyrics;
mod models;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use tauri::Manager;

use crate::audio::AudioController;
use crate::library::LibraryStore;

pub struct AppState {
    pub data_dir: PathBuf,
    pub library: Arc<Mutex<LibraryStore>>,
    pub audio: AudioController,
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::other(format!("无法定位应用数据目录：{error}")))?;
            let store = LibraryStore::load(data_dir.clone()).map_err(std::io::Error::other)?;
            let initial_volume = store.settings().volume;
            let audio = AudioController::create(app.handle().clone(), initial_volume);
            app.manage(AppState {
                data_dir,
                library: Arc::new(Mutex::new(store)),
                audio,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_library_snapshot,
            commands::pick_and_import_audio,
            commands::import_audio_paths,
            commands::update_track,
            commands::remove_track,
            commands::pick_lrc_for_track,
            commands::pick_cover_for_track,
            commands::set_plain_lyrics,
            commands::save_lyrics,
            commands::export_lrc,
            commands::cover_data_url,
            commands::search_online_lyrics,
            commands::save_settings,
            commands::play_track,
            commands::pause_audio,
            commands::resume_audio,
            commands::seek_audio,
            commands::set_volume,
            commands::stop_audio,
            commands::get_player_state,
            commands::save_alignment_draft,
            commands::load_alignment_draft,
            commands::clear_alignment_draft,
        ])
        .run(tauri::generate_context!())
        .expect("error while running KexGo");
}
