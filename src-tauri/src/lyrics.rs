use std::time::Duration;

use reqwest::Client;
use serde::Deserialize;

use crate::models::{LyricsQuery, OnlineLyricsResult};

const LRCLIB_BASE: &str = "https://lrclib.net/api";
const USER_AGENT: &str = "KexGo/0.1.0 (local-first desktop music player)";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrcLibRecord {
    id: u64,
    #[serde(default)]
    track_name: String,
    #[serde(default)]
    artist_name: String,
    #[serde(default)]
    album_name: String,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    instrumental: bool,
    #[serde(default)]
    plain_lyrics: Option<String>,
    #[serde(default)]
    synced_lyrics: Option<String>,
}

impl LrcLibRecord {
    fn usable(&self) -> bool {
        self.synced_lyrics
            .as_deref()
            .map(|text| !text.trim().is_empty())
            .unwrap_or(false)
            || self
                .plain_lyrics
                .as_deref()
                .map(|text| !text.trim().is_empty())
                .unwrap_or(false)
    }

    fn into_result(self) -> OnlineLyricsResult {
        OnlineLyricsResult {
            id: self.id,
            track_name: self.track_name,
            artist_name: self.artist_name,
            album_name: self.album_name,
            duration: self.duration,
            instrumental: self.instrumental,
            plain_lyrics: self.plain_lyrics,
            synced_lyrics: self.synced_lyrics,
        }
    }
}

pub async fn search_lrclib(query: &LyricsQuery) -> Result<Vec<OnlineLyricsResult>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(14))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|error| format!("无法初始化歌词请求：{error}"))?;

    let mut results: Vec<OnlineLyricsResult> = Vec::new();
    let mut exact: Option<LrcLibRecord> = None;

    if !query.track_name.trim().is_empty() && !query.artist_name.trim().is_empty() {
        let mut params: Vec<(&str, String)> = vec![
            ("track_name", query.track_name.trim().to_string()),
            ("artist_name", query.artist_name.trim().to_string()),
        ];
        if let Some(album) = query
            .album_name
            .as_ref()
            .filter(|album| !album.trim().is_empty())
        {
            params.push(("album_name", album.trim().to_string()));
        }
        if let Some(duration) = query.duration.filter(|value| *value > 1.0) {
            params.push(("duration", format!("{}", duration.round() as i64)));
        }
        if let Ok(response) = client
            .get(format!("{LRCLIB_BASE}/get"))
            .query(&params)
            .send()
            .await
        {
            if response.status().is_success() {
                if let Ok(record) = response.json::<LrcLibRecord>().await {
                    if record.usable() {
                        exact = Some(record);
                    }
                }
            }
        }
    }

    if let Some(record) = exact {
        results.push(record.into_result());
    }

    let mut params: Vec<(&str, String)> = Vec::new();
    if !query.track_name.trim().is_empty() {
        params.push(("track_name", query.track_name.trim().to_string()));
    }
    if !query.artist_name.trim().is_empty() {
        params.push(("artist_name", query.artist_name.trim().to_string()));
    }
    if let Some(album) = query
        .album_name
        .as_ref()
        .filter(|album| !album.trim().is_empty())
    {
        params.push(("album_name", album.trim().to_string()));
    }

    if params.is_empty() {
        return Ok(results);
    }

    let response = client
        .get(format!("{LRCLIB_BASE}/search"))
        .query(&params)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                "连接歌词库超时，请稍后重试".to_string()
            } else {
                format!("无法连接 LRCLIB：{error}")
            }
        })?;

    if response.status().as_u16() == 429 {
        return Err("歌词库请求太频繁，请稍歇一会儿再试".to_string());
    }
    if !response.status().is_success() {
        return Err(format!("歌词库返回错误（{}）", response.status().as_u16()));
    }

    let records = response
        .json::<Vec<LrcLibRecord>>()
        .await
        .map_err(|error| format!("歌词库返回了无法识别的数据：{error}"))?;

    let mut seen: Vec<u64> = results.iter().map(|item| item.id).collect();
    for record in records {
        if !record.usable() || seen.contains(&record.id) {
            continue;
        }
        seen.push(record.id);
        results.push(record.into_result());
        if results.len() >= 12 {
            break;
        }
    }

    results.sort_by(|left, right| {
        let left_synced = left.synced_lyrics.is_some();
        let right_synced = right.synced_lyrics.is_some();
        let synced_order = right_synced.cmp(&left_synced);
        if synced_order != std::cmp::Ordering::Equal {
            return synced_order;
        }
        let target = query.duration.unwrap_or(0.0);
        let left_diff = left
            .duration
            .map(|duration| (duration - target).abs())
            .unwrap_or(f64::MAX);
        let right_diff = right
            .duration
            .map(|duration| (duration - target).abs())
            .unwrap_or(f64::MAX);
        left_diff
            .partial_cmp(&right_diff)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    Ok(results)
}
