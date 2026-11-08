mod audio;
mod commands;
mod library;
mod lyrics;
mod models;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde_json::Value;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Shortcut, ShortcutState};

use crate::audio::AudioController;
use crate::library::LibraryStore;

pub struct AppState {
    pub data_dir: PathBuf,
    pub default_data_dir: PathBuf,
    pub config_dir: PathBuf,
    pub library: Arc<Mutex<LibraryStore>>,
    pub audio: AudioController,
}

fn resolve_data_dir(config_dir: &Path, fallback: &Path) -> PathBuf {
    let pointer = config_dir.join("location.json");
    if let Ok(raw) = std::fs::read_to_string(&pointer) {
        if let Ok(Value::Object(object)) = serde_json::from_str::<Value>(&raw) {
            if let Some(path) = object.get("dataDir").and_then(Value::as_str) {
                let candidate = PathBuf::from(path);
                if candidate.is_dir() {
                    return candidate;
                }
            }
        }
    }
    fallback.to_path_buf()
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let Some(icon) = app.default_window_icon().cloned() else {
        return Ok(());
    };
    let show = MenuItem::with_id(app, "show", "显示 KexGo", true, None::<&str>)?;
    let previous = MenuItem::with_id(app, "previous", "上一首", true, None::<&str>)?;
    let play = MenuItem::with_id(app, "play-pause", "播放 / 暂停", true, None::<&str>)?;
    let next = MenuItem::with_id(app, "next", "下一首", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "退出 KexGo", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &previous, &play, &next, &separator, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(icon)
        .tooltip("KexGo")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "previous" => {
                let _ = app.emit("tray:action", "previous");
            }
            "play-pause" => {
                let _ = app.emit("tray:action", "play-pause");
            }
            "next" => {
                let _ = app.emit("tray:action", "next");
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    let shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_handler(|app, shortcut, event| {
            if event.state != ShortcutState::Pressed {
                return;
            }
            let play_shortcut = Shortcut::new(None, Code::MediaPlayPause);
            let next_shortcut = Shortcut::new(None, Code::MediaTrackNext);
            let previous_shortcut = Shortcut::new(None, Code::MediaTrackPrevious);
            let action = if shortcut == &play_shortcut {
                Some("play-pause")
            } else if shortcut == &next_shortcut {
                Some("next")
            } else if shortcut == &previous_shortcut {
                Some("previous")
            } else {
                None
            };
            if let Some(action) = action {
                let _ = app.emit("tray:action", action);
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(shortcut_plugin)
        .setup(|app| {
            let config_dir = app
                .path()
                .app_config_dir()
                .map_err(|error| std::io::Error::other(format!("无法定位应用配置目录：{error}")))?;
            std::fs::create_dir_all(&config_dir).map_err(std::io::Error::other)?;
            let default_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| std::io::Error::other(format!("无法定位应用数据目录：{error}")))?;
            let data_dir = resolve_data_dir(&config_dir, &default_data_dir);
            let store = LibraryStore::load(data_dir.clone()).map_err(std::io::Error::other)?;
            let initial_volume = store.settings().volume;
            let audio = AudioController::create(app.handle().clone(), initial_volume);
            app.manage(AppState {
                data_dir,
                default_data_dir,
                config_dir,
                library: Arc::new(Mutex::new(store)),
                audio,
            });
            if let Err(error) = setup_tray(app) {
                eprintln!("KexGo tray icon unavailable: {error}");
            }
            for code in [Code::MediaPlayPause, Code::MediaTrackNext, Code::MediaTrackPrevious] {
                if let Err(error) = app.global_shortcut().register(Shortcut::new(None, code)) {
                    eprintln!("KexGo media key unavailable ({code:?}): {error}");
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_library_snapshot,
            commands::validate_library_paths,
            commands::preflight_track,
            commands::pick_and_import_audio,
            commands::import_audio_paths,
            commands::update_track,
            commands::set_track_tags,
            commands::increment_play_count,
            commands::remove_track,
            commands::save_playlist_json,
            commands::pick_playlist_json,
            commands::get_data_location,
            commands::pick_data_directory,
            commands::migrate_data_directory,
            commands::read_custom_css,
            commands::save_custom_css,
            commands::read_last_good_css,
            commands::restore_custom_css,
            commands::read_lyrics_notes,
            commands::save_lyrics_notes,
            commands::set_track_pause_fade,
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
            commands::set_speed,
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
