use std::fs;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use lofty::{Accessor, AudioFile, TaggedFileExt};
use uuid::Uuid;

use crate::models::{
    AppSettings, ImportFailure, ImportSummary, LibraryFile, LibrarySnapshot, SaveLyricsResponse,
    SaveLyricsResult, Track, TrackCheck, TrackIssue,
};

const AUDIO_EXTENSIONS: &[&str] = &["mp3", "flac", "m4a", "aac", "wav", "ogg", "opus"];
const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];

#[derive(Default)]
struct ImportedMetadata {
    title: Option<String>,
    artist: Option<String>,
    album: Option<String>,
    duration: f64,
    embedded_cover: Option<Vec<u8>>,
}

pub struct LibraryStore {
    pub data_dir: PathBuf,
    tracks: Vec<Track>,
    settings: AppSettings,
}

impl LibraryStore {
    pub fn load(data_dir: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&data_dir).map_err(|error| format!("无法创建应用数据目录：{error}"))?;
        fs::create_dir_all(data_dir.join("lyrics")).map_err(|error| error.to_string())?;
        fs::create_dir_all(data_dir.join("covers")).map_err(|error| error.to_string())?;
        fs::create_dir_all(data_dir.join("drafts")).map_err(|error| error.to_string())?;

        let library_path = data_dir.join("library.json");
        let file = if library_path.exists() {
            match fs::read_to_string(&library_path) {
                Ok(text) => serde_json::from_str::<LibraryFile>(&text).unwrap_or_default(),
                Err(_) => LibraryFile::default(),
            }
        } else {
            LibraryFile::default()
        };

        let mut store = Self {
            data_dir,
            tracks: file.tracks,
            settings: file.settings,
        };
        store.repair_paths();
        store.persist()?;
        Ok(store)
    }

    fn repair_paths(&mut self) {
        for track in &mut self.tracks {
            if let Some(path) = &track.cover_path {
                if !Path::new(path).exists() {
                    track.cover_path = None;
                }
            }
            if let Some(path) = &track.lrc_path {
                if !Path::new(path).exists() {
                    track.lrc_path = None;
                }
            }
        }
    }

    pub fn snapshot(&self) -> LibrarySnapshot {
        LibrarySnapshot {
            tracks: self.tracks.clone(),
            settings: self.settings.clone(),
        }
    }

    /// Cheap startup check: path presence/readability and known unsupported
    /// containers only. Decoding and duration probing happen before playback.
    pub fn validate_library_paths(&self) -> Vec<TrackIssue> {
        self.tracks
            .iter()
            .filter_map(|track| {
                let path = Path::new(&track.file_path);
                let issue = if !path.exists() {
                    Some((
                        "missing",
                        "文件不存在或已被移动，请重新导入或从曲库移除。".to_string(),
                    ))
                } else if !path.is_file() {
                    Some(("missing", "该路径不是音频文件。".to_string()))
                } else if fs::File::open(path).is_err() {
                    Some((
                        "unreadable",
                        "无法读取该文件，请检查文件权限或磁盘状态。".to_string(),
                    ))
                } else if let Some(reason) = unsupported_container_reason(path) {
                    Some(("unsupported", reason))
                } else if fs::metadata(path).map(|meta| meta.len()).unwrap_or(0) == 0 {
                    Some(("undecodable", "文件为空或已损坏。".to_string()))
                } else {
                    None
                };
                issue.map(|(status, message)| TrackIssue {
                    track_id: track.id.clone(),
                    status: status.to_string(),
                    message,
                })
            })
            .collect()
    }

    pub fn persist(&self) -> Result<(), String> {
        let file = LibraryFile {
            tracks: self.tracks.clone(),
            settings: self.settings.clone(),
        };
        let json = serde_json::to_string_pretty(&file).map_err(|error| error.to_string())?;
        fs::write(self.data_dir.join("library.json"), json)
            .map_err(|error| format!("无法写入曲库：{error}"))
    }

    pub fn save_settings(&mut self, settings: AppSettings) -> Result<(), String> {
        self.settings = settings;
        self.persist()
    }

    pub fn update_track(
        &mut self,
        track_id: &str,
        title: String,
        artist: String,
        album: String,
    ) -> Result<Track, String> {
        let now = now_ms();
        let track = self
            .tracks
            .iter_mut()
            .find(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        track.title = if title.trim().is_empty() {
            track.title.clone()
        } else {
            title.trim().to_string()
        };
        track.artist = if artist.trim().is_empty() {
            "未知歌手".to_string()
        } else {
            artist.trim().to_string()
        };
        track.album = album.trim().to_string();
        track.updated_at = now;
        let updated = track.clone();
        self.persist()?;
        Ok(updated)
    }

    pub fn set_track_tags(&mut self, track_id: &str, tags: Vec<String>) -> Result<Track, String> {
        let normalized = normalize_tags(tags);
        let track = self
            .tracks
            .iter_mut()
            .find(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        track.tags = normalized;
        track.updated_at = now_ms();
        let updated = track.clone();
        self.persist()?;
        Ok(updated)
    }

    pub fn set_track_pause_fade(&mut self, track_id: &str, enabled: bool) -> Result<Track, String> {
        let track = self
            .tracks
            .iter_mut()
            .find(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        track.pause_fade = enabled;
        track.updated_at = now_ms();
        let updated = track.clone();
        self.persist()?;
        Ok(updated)
    }

    pub fn increment_play_count(&mut self, track_id: &str) -> Result<Track, String> {
        let track = self
            .tracks
            .iter_mut()
            .find(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        track.play_count = track.play_count.saturating_add(1);
        track.updated_at = now_ms();
        let updated = track.clone();
        self.persist()?;
        Ok(updated)
    }

    pub fn remove_track(&mut self, track_id: &str) -> Result<(), String> {
        let position = self
            .tracks
            .iter()
            .position(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        let track = self.tracks.remove(position);
        if let Some(cover) = &track.cover_path {
            let _ = fs::remove_file(cover);
        }
        if let Some(lrc) = &track.lrc_path {
            let _ = fs::remove_file(lrc);
        }
        if self.settings.last_track_id.as_deref() == Some(track_id) {
            self.settings.last_track_id = self.tracks.first().map(|item| item.id.clone());
            self.settings.last_position = 0.0;
        }
        self.persist()
    }

    pub fn track_path(&self, track_id: &str) -> Result<PathBuf, String> {
        self.tracks
            .iter()
            .find(|track| track.id == track_id)
            .map(|track| PathBuf::from(&track.file_path))
            .ok_or_else(|| "歌曲不存在".to_string())
    }

    pub fn import_paths(&mut self, paths: Vec<PathBuf>) -> ImportSummary {
        let mut summary = ImportSummary {
            added: Vec::new(),
            skipped: Vec::new(),
            failed: Vec::new(),
        };
        let has_audio_candidate = paths.iter().any(|path| is_audio_file(path));

        for path in paths {
            if !is_audio_file(&path) {
                // Sidecar LRCs and cover images commonly arrive in the same drop.
                // They are handled by directory detection; only complain when the
                // drop contained no audio at all.
                if !has_audio_candidate && path.is_file() {
                    summary.failed.push(ImportFailure {
                        path: path.display().to_string(),
                        reason: "不是受支持的音频文件".to_string(),
                    });
                }
                continue;
            }
            if let Some(reason) = unsupported_container_reason(&path) {
                summary.failed.push(ImportFailure {
                    path: path.to_string_lossy().to_string(),
                    reason,
                });
                continue;
            }
            let normalized = path.to_string_lossy().to_string();
            if self
                .tracks
                .iter()
                .any(|track| paths_equal(&track.file_path, &normalized))
            {
                summary.skipped.push(
                    path.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string(),
                );
                continue;
            }
            match self.import_one(&path) {
                Ok(track) => summary.added.push(track),
                Err(error) => summary.failed.push(ImportFailure {
                    path: normalized,
                    reason: error,
                }),
            }
        }

        if !summary.added.is_empty() {
            if let Err(error) = self.persist() {
                summary.failed.push(ImportFailure {
                    path: String::new(),
                    reason: error,
                });
                summary.added.clear();
            }
        }
        summary
    }

    fn import_one(&mut self, path: &Path) -> Result<Track, String> {
        if !path.exists() {
            return Err("文件不存在或已被移动".to_string());
        }
        let file_stem = path
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .unwrap_or_else(|| "未命名歌曲".to_string());
        let metadata = read_metadata(path);
        let (fallback_artist, fallback_title) = title_artist_from_filename(&file_stem);
        let id = Uuid::new_v4().to_string();
        let now = now_ms();

        let (lrc_source, lyrics_text) = match find_sidecar_lrc(path) {
            Some(lrc_path) => match read_text_any_encoding(&lrc_path) {
                Ok(text) => (Some(lrc_path), text),
                Err(_) => (None, String::new()),
            },
            None => (None, String::new()),
        };

        let mut lrc_path: Option<String> = None;
        if lrc_source.is_some() {
            let managed = self.data_dir.join("lyrics").join(format!("{id}.lrc"));
            if fs::write(&managed, lyrics_text.as_bytes()).is_ok() {
                lrc_path = Some(managed.to_string_lossy().to_string());
            }
        }

        let sidecar_cover = find_sidecar_cover(path);
        let mut cover_path: Option<String> = None;
        if let Some(cover_source) = sidecar_cover {
            cover_path = self.copy_cover_from_file(&id, &cover_source);
        }
        if cover_path.is_none() {
            if let Some(bytes) = metadata.embedded_cover.as_ref() {
                cover_path = self.copy_embedded_cover(&id, bytes);
            }
        }

        let duration = if metadata.duration > 0.0 {
            metadata.duration
        } else {
            probe_duration(path).unwrap_or(0.0)
        };

        let title = metadata
            .title
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(fallback_title);
        let artist = metadata
            .artist
            .filter(|value| !value.trim().is_empty())
            .unwrap_or(fallback_artist);
        let album = metadata.album.unwrap_or_default();

        let track = Track {
            id,
            file_path: path.to_string_lossy().to_string(),
            title,
            artist,
            album,
            duration,
            cover_path,
            lrc_path: lrc_path.clone(),
            lyrics_text,
            lyrics_origin: if lrc_path.is_some() {
                "sidecar".to_string()
            } else {
                "unknown".to_string()
            },
            tags: Vec::new(),
            play_count: 0,
            pause_fade: false,
            created_at: now,
            updated_at: now,
        };
        self.tracks.push(track.clone());
        Ok(track)
    }

    fn copy_cover_from_file(&self, id: &str, source: &Path) -> Option<String> {
        let extension = source
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase())
            .filter(|value| IMAGE_EXTENSIONS.contains(&value.as_str()))
            .unwrap_or_else(|| "jpg".to_string());
        let destination = self
            .data_dir
            .join("covers")
            .join(format!("{id}.{extension}"));
        fs::copy(source, &destination).ok()?;
        Some(destination.to_string_lossy().to_string())
    }

    fn copy_embedded_cover(&self, id: &str, bytes: &[u8]) -> Option<String> {
        let extension = image_extension(bytes);
        let destination = self
            .data_dir
            .join("covers")
            .join(format!("{id}.{extension}"));
        fs::write(&destination, bytes).ok()?;
        Some(destination.to_string_lossy().to_string())
    }

    pub fn track(&self, track_id: &str) -> Option<Track> {
        self.tracks
            .iter()
            .find(|track| track.id == track_id)
            .cloned()
    }

    pub fn pick_lrc_for_track(&mut self, track_id: &str) -> Result<Option<Track>, String> {
        let file = rfd::FileDialog::new()
            .add_filter("LRC 歌词", &["lrc", "txt"])
            .set_title("选择 LRC 歌词")
            .pick_file();
        let Some(path) = file else {
            return Ok(None);
        };
        let text = read_text_any_encoding(&path)?;
        if text.trim().is_empty() {
            return Err("这个歌词文件是空的".to_string());
        }
        let track = self
            .tracks
            .iter_mut()
            .find(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        let managed = self
            .data_dir
            .join("lyrics")
            .join(format!("{}.lrc", track.id));
        fs::write(&managed, normalize_newlines(&text))
            .map_err(|error| format!("无法写入歌词：{error}"))?;
        track.lyrics_text = normalize_newlines(&text);
        track.lrc_path = Some(managed.to_string_lossy().to_string());
        track.lyrics_origin = "sidecar".to_string();
        track.updated_at = now_ms();
        let updated = track.clone();
        self.persist()?;
        Ok(Some(updated))
    }

    pub fn pick_cover_for_track(&mut self, track_id: &str) -> Result<Option<Track>, String> {
        let file = rfd::FileDialog::new()
            .add_filter("图片", &["jpg", "jpeg", "png", "webp", "gif"])
            .set_title("选择封面图片")
            .pick_file();
        let Some(path) = file else {
            return Ok(None);
        };
        let (track_id_value, old_cover) = self
            .tracks
            .iter()
            .find(|track| track.id == track_id)
            .map(|track| (track.id.clone(), track.cover_path.clone()))
            .ok_or_else(|| "歌曲不存在".to_string())?;
        let cover = self
            .copy_cover_from_file(&track_id_value, &path)
            .ok_or_else(|| "无法复制封面图片".to_string())?;
        if let Some(old_cover) = old_cover {
            let _ = fs::remove_file(old_cover);
        }
        let track = self
            .tracks
            .iter_mut()
            .find(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        track.cover_path = Some(cover);
        track.updated_at = now_ms();
        let updated = track.clone();
        self.persist()?;
        Ok(Some(updated))
    }

    pub fn cover_data_url(&self, track_id: &str) -> Result<Option<String>, String> {
        let track = self
            .tracks
            .iter()
            .find(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        let Some(path) = &track.cover_path else {
            return Ok(None);
        };
        let bytes = fs::read(path).map_err(|error| format!("无法读取封面：{error}"))?;
        let mime = match image_extension(&bytes) {
            "png" => "image/png",
            "webp" => "image/webp",
            "gif" => "image/gif",
            _ => "image/jpeg",
        };
        let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
        Ok(Some(format!("data:{mime};base64,{encoded}")))
    }

    pub fn set_plain_lyrics(
        &mut self,
        track_id: &str,
        text: String,
        origin: String,
    ) -> Result<Track, String> {
        let track = self
            .tracks
            .iter_mut()
            .find(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        track.lyrics_text = normalize_newlines(&text);
        track.lrc_path = None;
        track.lyrics_origin = normalize_origin(&origin);
        track.updated_at = now_ms();
        let updated = track.clone();
        self.persist()?;
        Ok(updated)
    }

    pub fn save_lyrics(
        &mut self,
        track_id: &str,
        content: String,
        origin: String,
        write_sidecar: bool,
    ) -> Result<SaveLyricsResponse, String> {
        if content.trim().is_empty() {
            return Err("歌词内容为空".to_string());
        }
        let track = self
            .tracks
            .iter_mut()
            .find(|track| track.id == track_id)
            .ok_or_else(|| "歌曲不存在".to_string())?;
        let normalized = normalize_newlines(&content);
        let managed = self
            .data_dir
            .join("lyrics")
            .join(format!("{}.lrc", track.id));
        fs::write(&managed, normalized.as_bytes())
            .map_err(|error| format!("无法保存 LRC：{error}"))?;

        let mut sidecar_path = None;
        let mut warning = None;
        if write_sidecar {
            let audio_path = PathBuf::from(&track.file_path);
            if let Some(parent) = audio_path.parent() {
                let file_name = audio_path
                    .file_stem()
                    .map(|stem| format!("{}.lrc", stem.to_string_lossy()))
                    .unwrap_or_else(|| format!("{}.lrc", track.title));
                let target = parent.join(file_name);
                match fs::write(&target, normalized.as_bytes()) {
                    Ok(_) => sidecar_path = Some(target.to_string_lossy().to_string()),
                    Err(error) => {
                        warning = Some(format!("无法写入歌曲同目录 .lrc：{error}"));
                    }
                }
            }
        }

        track.lyrics_text = normalized;
        track.lrc_path = Some(managed.to_string_lossy().to_string());
        track.lyrics_origin = normalize_origin(&origin);
        track.updated_at = now_ms();
        let updated = track.clone();
        self.persist()?;

        Ok(SaveLyricsResponse {
            track: updated,
            result: SaveLyricsResult {
                lrc_path: managed.to_string_lossy().to_string(),
                sidecar_path,
                warning,
            },
        })
    }

    pub fn export_path_suggestion(&self, track_id: &str, suggested_name: &str) -> Option<PathBuf> {
        let track = self.tracks.iter().find(|track| track.id == track_id)?;
        let audio = PathBuf::from(&track.file_path);
        let parent = audio.parent()?;
        Some(parent.join(suggested_name))
    }

    pub fn settings(&self) -> &AppSettings {
        &self.settings
    }
}

fn read_metadata(path: &Path) -> ImportedMetadata {
    let mut metadata = ImportedMetadata::default();
    let Ok(tagged) = lofty::read_from_path(path) else {
        return metadata;
    };
    let duration = tagged.properties().duration();
    metadata.duration = duration.as_secs_f64();
    let tag = tagged.primary_tag().or_else(|| tagged.first_tag());
    if let Some(tag) = tag {
        metadata.title = tag.title().map(|value| value.to_string());
        metadata.artist = tag.artist().map(|value| value.to_string());
        metadata.album = tag.album().map(|value| value.to_string());
        if let Some(picture) = tag.pictures().first() {
            metadata.embedded_cover = Some(picture.data().to_vec());
        }
    }
    metadata
}

pub fn probe_duration(path: &Path) -> Option<f64> {
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let file = fs::File::open(path).ok()?;
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            source,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .ok()?;
    let track = probed.format.default_track()?;
    let time_base = track.codec_params.time_base?;
    let frames = track.codec_params.n_frames?;
    let time = time_base.calc_time(frames);
    Some(time.seconds as f64 + time.frac)
}

/// Reject fragmented MP4 files before they enter the player.
///
/// The import dialog and the player previously relied on the file extension.
/// A fragmented MP4 renamed to `.mp3` can have a zero `mdhd` duration and can
/// crash some decoder paths, so detect it up front and return a human-readable
/// reason instead of trying to decode it.
pub fn unsupported_container_reason(path: &Path) -> Option<String> {
    if !is_fragmented_mp4(path) {
        return None;
    }
    Some(
        "检测到该文件实际是 fragmented MP4（分片 MP4，常见音轨为 AAC），不是普通的 MP3/M4A 文件。当前版本暂不支持分片 MP4，已停止导入和播放以避免闪退。请先将它转换为普通 M4A 或 MP3 后再导入。"
            .to_string(),
    )
}

struct IsoBoxHeader {
    kind: [u8; 4],
    header_size: u64,
    size: u64,
}

fn read_iso_box_header(file: &mut fs::File, pos: u64, limit: u64) -> Option<IsoBoxHeader> {
    if pos.checked_add(8)? > limit {
        return None;
    }
    file.seek(SeekFrom::Start(pos)).ok()?;
    let mut header = [0u8; 16];
    let available = (limit - pos).min(header.len() as u64) as usize;
    file.read_exact(&mut header[..available]).ok()?;

    let size32 = u32::from_be_bytes(header[0..4].try_into().ok()?);
    let kind: [u8; 4] = header[4..8].try_into().ok()?;
    let (header_size, size) = if size32 == 1 {
        if available < 16 {
            return None;
        }
        let size64 = u64::from_be_bytes(header[8..16].try_into().ok()?);
        (16u64, size64)
    } else if size32 == 0 {
        (8u64, limit - pos)
    } else {
        (8u64, u64::from(size32))
    };

    if size < header_size || pos.checked_add(size)? > limit {
        return None;
    }
    Some(IsoBoxHeader {
        kind,
        header_size,
        size,
    })
}

fn moov_contains_mvex(file: &mut fs::File, start: u64, length: u64) -> bool {
    let end = start.saturating_add(length);
    let mut pos = start;
    let mut boxes = 0usize;
    while boxes < 100_000 {
        let Some(header) = read_iso_box_header(file, pos, end) else {
            break;
        };
        if &header.kind == b"mvex" {
            return true;
        }
        pos = pos.saturating_add(header.size);
        boxes += 1;
    }
    false
}

fn is_fragmented_mp4(path: &Path) -> bool {
    let Ok(mut file) = fs::File::open(path) else {
        return false;
    };
    let Ok(file_len) = file.metadata().map(|metadata| metadata.len()) else {
        return false;
    };
    if file_len < 12 {
        return false;
    }

    let mut prefix = [0u8; 16];
    let available = (file_len.min(prefix.len() as u64)) as usize;
    if file.read_exact(&mut prefix[..available]).is_err() {
        return false;
    }
    let first_kind = &prefix[4..8];
    if first_kind == b"styp" {
        // A standalone fMP4 media segment has no moov/mvex. It is not a file
        // that the current decoder can play on its own.
        return true;
    }
    if first_kind != b"ftyp" {
        return false;
    }

    let mut pos = 0u64;
    let mut boxes = 0usize;
    while pos < file_len && boxes < 100_000 {
        let Some(header) = read_iso_box_header(&mut file, pos, file_len) else {
            break;
        };
        if &header.kind == b"moof" || &header.kind == b"styp" {
            return true;
        }
        if &header.kind == b"moov"
            && moov_contains_mvex(
                &mut file,
                pos + header.header_size,
                header.size - header.header_size,
            )
        {
            return true;
        }
        pos = pos.saturating_add(header.size);
        boxes += 1;
    }
    false
}

/// Full validation before a track is handed to the audio engine.
pub fn check_audio_file(path: &Path, stored_duration: f64) -> TrackCheck {
    use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
    use symphonia::core::errors::Error as SymphoniaError;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    if !path.is_file() {
        return TrackCheck::issue("missing", "文件不存在或已被移动，请重新导入或从曲库移除。");
    }
    if let Some(reason) = unsupported_container_reason(path) {
        return TrackCheck::issue("unsupported", reason);
    }
    let file = match fs::File::open(path) {
        Ok(file) => file,
        Err(_) => {
            return TrackCheck::issue(
                "unreadable",
                "无法读取该文件，请检查文件权限或磁盘状态。",
            );
        }
    };
    let source = MediaSourceStream::new(Box::new(file), Default::default());
    let mut hint = Hint::new();
    if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(extension);
    }
    let mut probed = match symphonia::default::get_probe().format(
        &hint,
        source,
        &FormatOptions::default(),
        &MetadataOptions::default(),
    ) {
        Ok(probed) => probed,
        Err(error) => {
            return TrackCheck::issue(
                "undecodable",
                format!("无法解码此文件，可能已损坏或格式不受支持（{error}）。"),
            );
        }
    };

    let Some(track) = probed.format.default_track() else {
        return TrackCheck::issue("undecodable", "文件中没有可解码的音轨。");
    };
    let track_id = track.id;
    let codec = track.codec_params.codec;
    let codec_params = track.codec_params.clone();
    if codec == CODEC_TYPE_NULL {
        return TrackCheck::issue("undecodable", "文件中没有受支持的音频编码。");
    }

    let probed_duration = codec_params
        .time_base
        .as_ref()
        .zip(codec_params.n_frames.as_ref())
        .map(|(timebase, frames)| {
            let time = timebase.calc_time(*frames);
            time.seconds as f64 + time.frac
        })
        .unwrap_or(0.0);
    if probed_duration <= 0.0 && stored_duration <= 0.0 {
        return TrackCheck::issue(
            "duration-unknown",
            "无法探测音频时长，播放和对轴暂不可用。",
        );
    }

    let mut decoder = match symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
    {
        Ok(decoder) => decoder,
        Err(error) => {
            return TrackCheck::issue("undecodable", format!("无法创建音频解码器：{error}"));
        }
    };

    let mut decoded_any = false;
    let mut decode_errors = 0usize;
    for _ in 0..64 {
        let packet = match probed.format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(_)) => break,
            Err(_) => break,
        };
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(_) => {
                decoded_any = true;
                break;
            }
            Err(SymphoniaError::DecodeError(_)) => {
                decode_errors += 1;
                if decode_errors > 8 {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    if !decoded_any {
        return TrackCheck::issue(
            "undecodable",
            "无法解码音频数据，文件可能已损坏或编码格式不受支持。",
        );
    }

    TrackCheck::ok()
}

pub fn read_text_any_encoding(path: &Path) -> Result<String, String> {
    let mut bytes = Vec::new();
    fs::File::open(path)
        .and_then(|mut file| file.read_to_end(&mut bytes))
        .map_err(|error| format!("无法读取歌词文件：{error}"))?;
    if bytes.is_empty() {
        return Ok(String::new());
    }
    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8(bytes[3..].to_vec()).map_err(|_| "歌词编码无法识别".to_string());
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let mut utf16 = Vec::with_capacity((bytes.len() - 2) / 2);
        for chunk in bytes[2..].chunks_exact(2) {
            utf16.push(u16::from_le_bytes([chunk[0], chunk[1]]));
        }
        return String::from_utf16(&utf16).map_err(|_| "UTF-16 歌词解码失败".to_string());
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let mut utf16 = Vec::with_capacity((bytes.len() - 2) / 2);
        for chunk in bytes[2..].chunks_exact(2) {
            utf16.push(u16::from_be_bytes([chunk[0], chunk[1]]));
        }
        return String::from_utf16(&utf16).map_err(|_| "UTF-16 歌词解码失败".to_string());
    }
    if let Ok(text) = std::str::from_utf8(&bytes) {
        return Ok(text.to_string());
    }
    let (decoded, _, _) = encoding_rs::GB18030.decode(&bytes);
    Ok(decoded.into_owned())
}

fn find_sidecar_lrc(audio: &Path) -> Option<PathBuf> {
    let parent = audio.parent()?;
    let stem = audio.file_stem()?.to_string_lossy().to_lowercase();
    let entries = fs::read_dir(parent).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let matches_stem = path
            .file_stem()
            .map(|value| value.to_string_lossy().to_lowercase() == stem)
            .unwrap_or(false);
        let is_lrc = path
            .extension()
            .map(|value| value.to_string_lossy().eq_ignore_ascii_case("lrc"))
            .unwrap_or(false);
        if matches_stem && is_lrc {
            return Some(path);
        }
    }
    None
}

fn find_sidecar_cover(audio: &Path) -> Option<PathBuf> {
    let parent = audio.parent()?;
    let stem = audio.file_stem()?.to_string_lossy().to_lowercase();
    let entries = fs::read_dir(parent).ok()?.flatten();
    let mut candidates = Vec::new();
    for entry in entries {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let extension = path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.to_ascii_lowercase());
        if !extension
            .as_deref()
            .map(|value| IMAGE_EXTENSIONS.contains(&value))
            .unwrap_or(false)
        {
            continue;
        }
        let file_stem = path
            .file_stem()
            .map(|value| value.to_string_lossy().to_lowercase())
            .unwrap_or_default();
        let priority = if file_stem == stem {
            0
        } else if matches!(file_stem.as_str(), "cover" | "folder" | "front") {
            1
        } else {
            continue;
        };
        candidates.push((priority, path));
    }
    candidates.sort_by_key(|(priority, _)| *priority);
    candidates.into_iter().map(|(_, path)| path).next()
}

fn title_artist_from_filename(stem: &str) -> (String, String) {
    let normalized = stem.replace('_', " ");
    let parts: Vec<&str> = normalized.split(" - ").collect();
    if parts.len() >= 2 {
        (
            parts[0].trim().to_string(),
            parts[1..].join(" - ").trim().to_string(),
        )
    } else {
        ("未知歌手".to_string(), normalized.trim().to_string())
    }
}

fn image_extension(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        "png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "webp"
    } else if bytes.starts_with(b"GIF8") {
        "gif"
    } else {
        "jpg"
    }
}

fn normalize_newlines(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn normalize_origin(origin: &str) -> String {
    match origin {
        "sidecar" | "embedded" | "lrclib" | "manual" => origin.to_string(),
        _ => "unknown".to_string(),
    }
}

fn is_audio_file(path: &Path) -> bool {
    path.is_file()
        && path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| AUDIO_EXTENSIONS.contains(&value.to_ascii_lowercase().as_str()))
            .unwrap_or(false)
}

fn paths_equal(left: &str, right: &str) -> bool {
    left.eq_ignore_ascii_case(right)
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized: Vec<String> = Vec::new();
    for raw in tags {
        let tag = raw.trim();
        if tag.is_empty() {
            continue;
        }
        let tag = tag.chars().take(24).collect::<String>();
        if normalized
            .iter()
            .any(|existing| existing.eq_ignore_ascii_case(&tag))
        {
            continue;
        }
        normalized.push(tag);
        if normalized.len() >= 20 {
            break;
        }
    }
    normalized
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::sync::atomic::{AtomicU32, Ordering};

    static NEXT_TEMP_FILE: AtomicU32 = AtomicU32::new(0);

    fn iso_box(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::with_capacity(payload.len() + 8);
        bytes.extend_from_slice(&((payload.len() + 8) as u32).to_be_bytes());
        bytes.extend_from_slice(kind);
        bytes.extend_from_slice(payload);
        bytes
    }

    fn temp_audio_file(bytes: &[u8]) -> PathBuf {
        let id = NEXT_TEMP_FILE.fetch_add(1, Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("kexgo-test-{}-{id}.bin", std::process::id()));
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(bytes).unwrap();
        path
    }

    #[test]
    fn detects_fragmented_mp4() {
        let mut bytes = iso_box(b"ftyp", b"isom\0\0\0\0isom");
        bytes.extend(iso_box(b"moov", &iso_box(b"mvex", &[])));
        bytes.extend(iso_box(b"moof", &[]));
        let path = temp_audio_file(&bytes);
        assert!(is_fragmented_mp4(&path));
        assert!(unsupported_container_reason(&path).is_some());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn allows_regular_mp4() {
        let mut bytes = iso_box(b"ftyp", b"isom\0\0\0\0isom");
        bytes.extend(iso_box(b"moov", &iso_box(b"mvhd", &[])));
        bytes.extend(iso_box(b"mdat", &[0, 0, 0, 0]));
        let path = temp_audio_file(&bytes);
        assert!(!is_fragmented_mp4(&path));
        assert!(unsupported_container_reason(&path).is_none());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn allows_regular_audio() {
        let path = temp_audio_file(b"ID3\x04\x00\x00\x00\x00\x00\x00");
        assert!(!is_fragmented_mp4(&path));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn detects_standalone_fragment_segment() {
        let path = temp_audio_file(&iso_box(b"styp", b"msdh\0\0\0\0msdhmsix"));
        assert!(is_fragmented_mp4(&path));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn normalizes_tags() {
        let tags = normalize_tags(vec![
            " 夜晚 ".to_string(),
            "独立".to_string(),
            "夜晚".to_string(),
            "".to_string(),
            "这是一个超过二十四个字符限制的标签名称会被截断处理".to_string(),
        ]);
        assert_eq!(tags[0], "夜晚");
        assert_eq!(tags[1], "独立");
        assert_eq!(tags.len(), 3);
        assert_eq!(tags[2].chars().count(), 24);
    }

    #[test]
    fn check_audio_file_reports_missing_paths() {
        let path = std::env::temp_dir().join(format!(
            "kexgo-missing-{}-{}.mp3",
            std::process::id(),
            NEXT_TEMP_FILE.fetch_add(1, Ordering::Relaxed)
        ));
        let result = check_audio_file(&path, 0.0);
        assert_eq!(result.status, "missing");
    }

    #[test]
    fn check_audio_file_reports_fragmented_mp4_before_decoding() {
        let mut bytes = iso_box(b"ftyp", b"isom\0\0\0\0isom");
        bytes.extend(iso_box(b"moov", &iso_box(b"mvex", &[])));
        let path = temp_audio_file(&bytes);
        let result = check_audio_file(&path, 0.0);
        assert_eq!(result.status, "unsupported");
        let _ = fs::remove_file(path);
    }
}
