use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Track {
    pub id: String,
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    pub cover_path: Option<String>,
    pub lrc_path: Option<String>,
    pub lyrics_text: String,
    pub lyrics_origin: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub play_count: u64,
    #[serde(default)]
    pub pause_fade: bool,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    #[serde(default)]
    pub last_track_id: Option<String>,
    #[serde(default)]
    pub last_position: f64,
    #[serde(default = "default_volume")]
    pub volume: f32,
    #[serde(default = "default_compensation")]
    pub compensation_ms: i32,
    #[serde(default)]
    pub queue: Option<Vec<String>>,
    #[serde(default = "default_play_mode")]
    pub play_mode: String,
    #[serde(default = "default_sort_mode")]
    pub sort_mode: String,
    #[serde(default)]
    pub library_order: Vec<String>,
    #[serde(default = "default_theme")]
    pub theme: String,
    #[serde(default = "default_close_to_tray")]
    pub close_to_tray: bool,
    #[serde(default = "default_lyrics_font_size")]
    pub lyrics_font_size: i32,
    #[serde(default = "default_visualizer_enabled")]
    pub visualizer_enabled: bool,
    #[serde(default)]
    pub preferences: serde_json::Value,
}

fn default_volume() -> f32 {
    0.78
}

fn default_compensation() -> i32 {
    -150
}

fn default_play_mode() -> String {
    "sequential".to_string()
}

fn default_sort_mode() -> String {
    "custom".to_string()
}

fn default_theme() -> String {
    "dark".to_string()
}

fn default_close_to_tray() -> bool {
    true
}

fn default_lyrics_font_size() -> i32 {
    15
}

fn default_visualizer_enabled() -> bool {
    false
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            last_track_id: None,
            last_position: 0.0,
            volume: 0.78,
            compensation_ms: -150,
            queue: None,
            play_mode: default_play_mode(),
            sort_mode: default_sort_mode(),
            library_order: Vec::new(),
            theme: default_theme(),
            close_to_tray: default_close_to_tray(),
            lyrics_font_size: default_lyrics_font_size(),
            visualizer_enabled: default_visualizer_enabled(),
            preferences: serde_json::json!({}),
        }
    }
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFile {
    #[serde(default)]
    pub tracks: Vec<Track>,
    #[serde(default)]
    pub settings: AppSettings,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySnapshot {
    pub tracks: Vec<Track>,
    pub settings: AppSettings,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub added: Vec<Track>,
    pub skipped: Vec<String>,
    pub failed: Vec<ImportFailure>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFailure {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LyricsQuery {
    pub track_name: String,
    pub artist_name: String,
    #[serde(default)]
    pub album_name: Option<String>,
    #[serde(default)]
    pub duration: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnlineLyricsResult {
    pub id: u64,
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub duration: Option<f64>,
    pub instrumental: bool,
    pub plain_lyrics: Option<String>,
    pub synced_lyrics: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLyricsResult {
    pub lrc_path: String,
    pub sidecar_path: Option<String>,
    pub warning: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveLyricsResponse {
    pub track: Track,
    pub result: SaveLyricsResult,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackIssue {
    pub track_id: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackCheck {
    pub status: String,
    pub message: String,
}

impl TrackCheck {
    pub fn ok() -> Self {
        Self {
            status: "ok".to_string(),
            message: String::new(),
        }
    }

    pub fn issue(status: &str, message: impl Into<String>) -> Self {
        Self {
            status: status.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerTick {
    pub track_id: Option<String>,
    pub position: f64,
    pub duration: f64,
    pub playing: bool,
    pub volume: f32,
    pub ended: bool,
}

#[derive(Debug, Clone, Default)]
pub struct PlayerSnapshot {
    pub track_id: Option<String>,
    pub position: f64,
    pub duration: f64,
    pub playing: bool,
    pub volume: f32,
    pub ended: bool,
}
