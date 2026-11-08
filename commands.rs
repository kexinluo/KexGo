use std::path::PathBuf;
use std::sync::MutexGuard;

use serde_json::Value;
use tauri::State;

use crate::audio::AudioController;
use crate::library::LibraryStore;
use crate::lyrics;
use crate::models::{
    AppSettings, ImportSummary, LibrarySnapshot, LyricsQuery, OnlineLyricsResult, PlayerTick,
    SaveLyricsResponse, Track, TrackCheck, TrackIssue,
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
pub fn validate_library_paths(state: State<'_, AppState>) -> Result<Vec<TrackIssue>, String> {
    Ok(lock_library(&state)?.validate_library_paths())
}

#[tauri::command]
pub fn preflight_track(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<TrackCheck, String> {
    let (path, duration) = {
        let library = lock_library(&state)?;
        let track = library
            .track(&track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        (PathBuf::from(track.file_path), track.duration)
    };
    Ok(crate::library::check_audio_file(&path, duration))
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
pub fn set_track_tags(
    state: State<'_, AppState>,
    track_id: String,
    tags: Vec<String>,
) -> Result<Track, String> {
    lock_library(&state)?.set_track_tags(&track_id, tags)
}

#[tauri::command]
pub fn increment_play_count(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<Track, String> {
    lock_library(&state)?.increment_play_count(&track_id)
}

#[tauri::command]
pub fn remove_track(state: State<'_, AppState>, track_id: String) -> Result<(), String> {
    lock_library(&state)?.remove_track(&track_id)
}

#[tauri::command]
pub fn save_playlist_json(
    content: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    if content.trim().is_empty() {
        return Err("歌单内容为空".to_string());
    }
    let base = sanitize_file_name(&suggested_name);
    let file_name = if base.to_ascii_lowercase().ends_with(".json") {
        base
    } else {
        format!("{base}.json")
    };
    let Some(target) = rfd::FileDialog::new()
        .add_filter("KexGo 歌单", &["json"])
        .set_title("导出 KexGo 歌单")
        .set_file_name(file_name)
        .save_file()
    else {
        return Ok(None);
    };
    std::fs::write(&target, content)
        .map_err(|error| format!("无法写入歌单：{error}"))?;
    Ok(Some(target.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn pick_playlist_json() -> Result<Option<String>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("KexGo 歌单", &["json"])
        .set_title("导入 KexGo 歌单")
        .pick_file()
    else {
        return Ok(None);
    };
    let metadata = std::fs::metadata(&path)
        .map_err(|error| format!("无法读取歌单文件：{error}"))?;
    if metadata.len() > 10 * 1024 * 1024 {
        return Err("歌单文件过大".to_string());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|error| format!("无法读取歌单：{error}"))?;
    Ok(Some(content))
}

#[tauri::command]
pub fn set_track_pause_fade(
    state: State<'_, AppState>,
    track_id: String,
    enabled: bool,
) -> Result<Track, String> {
    lock_library(&state)?.set_track_pause_fade(&track_id, enabled)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataLocation {
    current: String,
    default: String,
    custom_css_path: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationResult {
    old_path: String,
    new_path: String,
    restart_required: bool,
}

#[tauri::command]
pub fn get_data_location(state: State<'_, AppState>) -> DataLocation {
    DataLocation {
        current: state.data_dir.to_string_lossy().to_string(),
        default: state.default_data_dir.to_string_lossy().to_string(),
        custom_css_path: state
            .data_dir
            .join("custom.css")
            .to_string_lossy()
            .to_string(),
    }
}

#[tauri::command]
pub fn pick_data_directory() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .set_title("选择 KexGo 数据目录")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string()))
}

fn copy_tree(source: &std::path::Path, target: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(target).map_err(|error| format!("无法创建目标目录：{error}"))?;
    let entries =
        std::fs::read_dir(source).map_err(|error| format!("无法读取数据目录：{error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("无法读取数据项：{error}"))?;
        let file_type = entry
            .file_type()
            .map_err(|error| format!("无法读取数据项类型：{error}"))?;
        let destination = target.join(entry.file_name());
        if file_type.is_dir() {
            copy_tree(&entry.path(), &destination)?;
        } else if file_type.is_file() {
            std::fs::copy(entry.path(), &destination)
                .map_err(|error| format!("无法复制 {}：{error}", entry.path().display()))?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn migrate_data_directory(
    state: State<'_, AppState>,
    target: String,
) -> Result<MigrationResult, String> {
    let target = PathBuf::from(target);
    std::fs::create_dir_all(&target).map_err(|error| format!("无法创建目标目录：{error}"))?;
    if target.join("library.json").exists() {
        return Err("目标目录已有 KexGo 曲库数据，请选择一个空目录".to_string());
    }
    let _library = lock_library(&state)?;
    let source_canonical = std::fs::canonicalize(&state.data_dir)
        .map_err(|error| format!("无法读取当前数据目录：{error}"))?;
    let target_canonical = std::fs::canonicalize(&target)
        .map_err(|error| format!("无法读取目标数据目录：{error}"))?;
    if target_canonical == source_canonical
        || target_canonical.starts_with(&source_canonical)
        || source_canonical.starts_with(&target_canonical)
    {
        return Err("新旧数据目录不能相同或互相包含".to_string());
    }

    copy_tree(&state.data_dir, &target)?;
    let pointer = serde_json::json!({ "dataDir": target.to_string_lossy() });
    let pointer_path = state.config_dir.join("location.json");
    std::fs::write(
        &pointer_path,
        serde_json::to_vec_pretty(&pointer).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("无法保存数据目录设置：{error}"))?;

    Ok(MigrationResult {
        old_path: state.data_dir.to_string_lossy().to_string(),
        new_path: target.to_string_lossy().to_string(),
        restart_required: true,
    })
}

fn custom_css_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("custom.css")
}

fn last_good_css_path(data_dir: &std::path::Path) -> PathBuf {
    data_dir.join("custom.last-good.css")
}

#[tauri::command]
pub fn read_custom_css(state: State<'_, AppState>) -> Result<String, String> {
    let path = custom_css_path(&state.data_dir);
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(path).map_err(|error| format!("无法读取自定义 CSS：{error}"))
}

#[tauri::command]
pub fn save_custom_css(state: State<'_, AppState>, content: String) -> Result<(), String> {
    if content.len() > 1024 * 1024 {
        return Err("自定义 CSS 不能超过 1 MB".to_string());
    }
    let path = custom_css_path(&state.data_dir);
    std::fs::write(&path, &content).map_err(|error| format!("无法写入自定义 CSS：{error}"))?;
    std::fs::write(last_good_css_path(&state.data_dir), content)
        .map_err(|error| format!("无法保存自定义 CSS 备份：{error}"))?;
    Ok(())
}

#[tauri::command]
pub fn read_last_good_css(state: State<'_, AppState>) -> Result<String, String> {
    let path = last_good_css_path(&state.data_dir);
    if !path.exists() {
        return Ok(String::new());
    }
    std::fs::read_to_string(path).map_err(|error| format!("无法读取自定义 CSS 备份：{error}"))
}

#[tauri::command]
pub fn restore_custom_css(state: State<'_, AppState>) -> Result<(), String> {
    let backup = last_good_css_path(&state.data_dir);
    if !backup.exists() {
        return Err("还没有可回滚的 CSS 版本".to_string());
    }
    let last_good =
        std::fs::read_to_string(&backup).map_err(|error| format!("无法读取 CSS 备份：{error}"))?;
    let path = custom_css_path(&state.data_dir);
    std::fs::write(path, last_good).map_err(|error| format!("无法回滚自定义 CSS：{error}"))
}

fn notes_path(data_dir: &std::path::Path, track_id: &str) -> Result<PathBuf, String> {
    let safe = safe_track_id(track_id)?;
    Ok(data_dir.join("notes").join(format!("{safe}.json")))
}

#[tauri::command]
pub fn read_lyrics_notes(
    state: State<'_, AppState>,
    track_id: String,
) -> Result<Option<String>, String> {
    let path = notes_path(&state.data_dir, &track_id)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = std::fs::read_to_string(path)
        .map_err(|error| format!("无法读取歌词注音：{error}"))?;
    Ok(Some(content))
}

#[tauri::command]
pub fn save_lyrics_notes(
    state: State<'_, AppState>,
    track_id: String,
    content: String,
) -> Result<(), String> {
    if content.len() > 1024 * 1024 {
        return Err("歌词注音文件过大".to_string());
    }
    serde_json::from_str::<serde_json::Value>(&content)
        .map_err(|error| format!("歌词注音格式无效：{error}"))?;
    let path = notes_path(&state.data_dir, &track_id)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| format!("无法创建注音目录：{error}"))?;
    }
    std::fs::write(path, content).map_err(|error| format!("无法保存歌词注音：{error}"))
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
    settings.lyrics_font_size = settings.lyrics_font_size.clamp(12, 20);
    let volume = settings.volume;
    lock_library(&state)?.save_settings(settings)?;
    let _ = audio(&state).set_volume(volume, 0);
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
    if !path.is_file() {
        let _ = audio(&state).stop();
        return Err("文件不存在或已被移动，请重新导入或从曲库移除。".to_string());
    }
    if let Some(reason) = crate::library::unsupported_container_reason(&path) {
        let _ = audio(&state).stop();
        return Err(reason);
    }
    let start = if start_at.is_finite() {
        start_at.max(0.0)
    } else {
        0.0
    };
    audio(&state).play(track_id, path, start, duration)?;
    Ok(audio(&state).tick())
}

#[tauri::command]
pub fn pause_audio(
    state: State<'_, AppState>,
    fade_ms: Option<u32>,
) -> Result<(), String> {
    audio(&state).pause(fade_ms.unwrap_or(0))
}

#[tauri::command]
pub fn resume_audio(
    state: State<'_, AppState>,
    fade_ms: Option<u32>,
) -> Result<(), String> {
    audio(&state).resume(fade_ms.unwrap_or(0))
}

#[tauri::command]
pub fn set_speed(state: State<'_, AppState>, speed: f32) -> Result<(), String> {
    audio(&state).set_speed(speed.clamp(0.5, 2.0))
}

#[tauri::command]
pub fn seek_audio(state: State<'_, AppState>, seconds: f64) -> Result<(), String> {
    if !seconds.is_finite() {
        return Err("无效的播放位置".to_string());
    }
    audio(&state).seek(seconds.max(0.0))
}

#[tauri::command]
pub fn set_volume(
    state: State<'_, AppState>,
    volume: f32,
    fade_ms: Option<u32>,
) -> Result<(), String> {
    audio(&state).set_volume(volume.clamp(0.0, 1.0), fade_ms.unwrap_or(0))
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
