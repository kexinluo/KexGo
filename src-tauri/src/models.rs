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
}

fn default_volume() -> f32 {
    0.78
}

fn default_compensation() -> i32 {
    -150
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            last_track_id: None,
            last_position: 0.0,
            volume: 0.78,
            compensation_ms: -150,
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
