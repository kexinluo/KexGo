use std::path::PathBuf;
use std::sync::MutexGuard;

use serde_json::Value;
use tauri::State;

use crate::audio::AudioController;
use crate::library::LibraryStore;
use crate::lyrics;
use crate::models::{
    AppSettings, ImportSummary, LibrarySnapshot, LyricsQuery, OnlineLyricsResult, PlayerTick,
    SaveLyricsResponse, Track,
};
use crate::AppState;

fn lock_library<'a>(
    state: &'a State<'_, AppState>,
) -> Result<MutexGuard<'a, LibraryStore>, String> {
    state
        .library
        .lock()
        .map_err(|_| "曲库状态暂时不可用，请重启 KexGo".to_string())
}

fn audio<'a>(state: &'a State<'_, AppState>) -> &'a AudioController {
    &state.audio
}

#[tauri::command]
pub fn get_library_snapshot(state: State<'_, AppState>) -> Result<LibrarySnapshot, String> {
    Ok(lock_library(&state)?.snapshot())
}

#[tauri::command]
pub fn pick_and_import_audio(state: State<'_, AppState>) -> Result<Option<ImportSummary>, String> {
    let picked = rfd::FileDialog::new()
        .add_filter(
            "音频文件",
            &["mp3", "flac", "m4a", "aac", "wav", "ogg", "opus"],
        )
        .set_title("选择音乐文件")
        .pick_files();
    let Some(paths) = picked else {
        return Ok(None);
    };
    if paths.is_empty() {
        return Ok(None);
    }
    let mut library = lock_library(&state)?;
    Ok(Some(library.import_paths(paths)))
}

#[tauri::command]
pub fn import_audio_paths(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<ImportSummary, String> {
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    let mut library = lock_library(&state)?;
    Ok(library.import_paths(paths))
}

#[tauri::command]
pub fn update_track(
    state: State<'_, AppState>,
    track_id: String,
    title: String,
    artist: String,
    album: String,
) -> Result<Track, String> {
    lock_library(&state)?.update_track(&track_id, title, artist, album)
}

#[tauri::command]
pub fn remove_track(state: State<'_, AppState>, track_id: String) -> Result<(), String> {
    lock_library(&state)?.remove_track(&track_id)
}

#[tauri::command]
pub fn pick_lrc_for_track(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<Option<Track>, String> {
    lock_library(&state)?.pick_lrc_for_track(&track_id)
}

#[tauri::command]
pub fn pick_cover_for_track(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<Option<Track>, String> {
    lock_library(&state)?.pick_cover_for_track(&track_id)
}

#[tauri::command]
pub fn set_plain_lyrics(
    state: State<'_, AppState>,
    track_id: String,
    text: String,
    origin: String,
) -> Result<Track, String> {
    lock_library(&state)?.set_plain_lyrics(&track_id, text, origin)
}

#[tauri::command]
pub fn save_lyrics(
    state: State<'_, AppState>,
    track_id: String,
    content: String,
    origin: String,
    write_sidecar: bool,
) -> Result<SaveLyricsResponse, String> {
    lock_library(&state)?.save_lyrics(&track_id, content, origin, write_sidecar)
}

#[tauri::command]
pub fn export_lrc(
    state: State<'_, AppState>,
    track_id: String,
    content: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    if content.trim().is_empty() {
        return Err("没有可导出的歌词".to_string());
    }
    let suggested = sanitize_file_name(&suggested_name);
    let library = lock_library(&state)?;
    let mut dialog = rfd::FileDialog::new()
        .add_filter("LRC 歌词", &["lrc"])
        .set_title("导出 LRC")
        .set_file_name(if suggested.to_ascii_lowercase().ends_with(".lrc") {
            suggested
        } else {
            format!("{suggested}.lrc")
        });
    if let Some(path) = library.export_path_suggestion(&track_id, "kexgo.lrc") {
        if let Some(parent) = path.parent() {
            dialog = dialog.set_directory(parent);
        }
    }
    let Some(target) = dialog.save_file() else {
        return Ok(None);
    };
    std::fs::write(&target, content.replace("\r\n", "\n"))
        .map_err(|error| format!("无法写入 LRC：{error}"))?;
    Ok(Some(target.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn cover_data_url(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<Option<String>, String> {
    lock_library(&state)?.cover_data_url(&track_id)
}

#[tauri::command]
pub async fn search_online_lyrics(query: LyricsQuery) -> Result<Vec<OnlineLyricsResult>, String> {
    lyrics::search_lrclib(&query).await
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, mut settings: AppSettings) -> Result<(), String> {
    settings.volume = settings.volume.clamp(0.0, 1.0);
    if !settings.last_position.is_finite() || settings.last_position < 0.0 {
        settings.last_position = 0.0;
    }
    settings.compensation_ms = settings.compensation_ms.clamp(-2000, 2000);
    let volume = settings.volume;
    lock_library(&state)?.save_settings(settings)?;
    let _ = audio(&state).set_volume(volume);
    Ok(())
}

#[tauri::command]
pub fn play_track(
    state: State<'_, AppState>,
    track_id: String,
    start_at: f64,
) -> Result<PlayerTick, String> {
    let (path, duration) = {
        let library = lock_library(&state)?;
        let track = library
            .track(&track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        (PathBuf::from(track.file_path), track.duration)
    };
    let start = if start_at.is_finite() {
        start_at.max(0.0)
    } else {
        0.0
    };
    audio(&state).play(track_id, path, start, duration)?;
    Ok(audio(&state).tick())
}

#[tauri::command]
pub fn pause_audio(state: State<'_, AppState>) -> Result<(), String> {
    audio(&state).pause()
}

#[tauri::command]
pub fn resume_audio(state: State<'_, AppState>) -> Result<(), String> {
    audio(&state).resume()
}

#[tauri::command]
pub fn seek_audio(state: State<'_, AppState>, seconds: f64) -> Result<(), String> {
    if !seconds.is_finite() {
        return Err("无效的播放位置".to_string());
    }
    audio(&state).seek(seconds.max(0.0))
}

#[tauri::command]
pub fn set_volume(state: State<'_, AppState>, volume: f32) -> Result<(), String> {
    audio(&state).set_volume(volume.clamp(0.0, 1.0))
}

#[tauri::command]
pub fn stop_audio(state: State<'_, AppState>) -> Result<(), String> {
    audio(&state).stop()
}

#[tauri::command]
pub fn get_player_state(state: State<'_, AppState>) -> PlayerTick {
    audio(&state).tick()
}

#[tauri::command]
pub fn save_alignment_draft(
    state: State<'_, AppState>,
    track_id: String,
    draft: Value,
) -> Result<(), String> {
    let safe = safe_track_id(&track_id)?;
    let serialized = serde_json::to_string_pretty(&draft).map_err(|error| error.to_string())?;
    if serialized.len() > 2_000_000 {
        return Err("草稿过大，无法保存".to_string());
    }
    let path = state.data_dir.join("drafts").join(format!("{safe}.json"));
    std::fs::write(path, serialized).map_err(|error| format!("无法保存草稿：{error}"))
}

#[tauri::command]
pub fn load_alignment_draft(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<Option<Value>, String> {
    let safe = safe_track_id(&track_id)?;
    let path = state.data_dir.join("drafts").join(format!("{safe}.json"));
    if !path.exists() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(path).map_err(|error| format!("无法读取草稿：{error}"))?;
    let value =
        serde_json::from_str::<Value>(&text).map_err(|error| format!("草稿内容损坏：{error}"))?;
    Ok(Some(value))
}

#[tauri::command]
pub fn clear_alignment_draft(state: State<'_, AppState>, track_id: String) -> Result<(), String> {
    let safe = safe_track_id(&track_id)?;
    let path = state.data_dir.join("drafts").join(format!("{safe}.json"));
    if path.exists() {
        std::fs::remove_file(path).map_err(|error| format!("无法清理草稿：{error}"))?;
    }
    Ok(())
}

fn safe_track_id(track_id: &str) -> Result<String, String> {
    if track_id.is_empty()
        || track_id.len() > 128
        || !track_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("无效的歌曲标识".to_string());
    }
    Ok(track_id.to_string())
}

fn sanitize_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|character| {
            if matches!(
                character,
                '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'
            ) {
                '_'
            } else {
                character
            }
        })
        .collect();
    let trimmed = cleaned.trim().trim_end_matches(".lrc").trim();
    if trimmed.is_empty() {
        "KexGo 歌词".to_string()
    } else {
        trimmed.to_string()
    }
}
