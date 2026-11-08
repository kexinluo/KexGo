use std::fs::File;
use std::io::BufReader;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use rodio::{Decoder, OutputStream, OutputStreamHandle, Sink, Source};
use tauri::{AppHandle, Emitter};

use crate::models::{PlayerSnapshot, PlayerTick};

type AudioReply = Sender<Result<(), String>>;

pub enum AudioCommand {
    Play {
        track_id: String,
        path: PathBuf,
        start_at: f64,
        duration: f64,
        reply: Option<AudioReply>,
    },
    Pause {
        fade_ms: u32,
        reply: Option<AudioReply>,
    },
    Resume {
        fade_ms: u32,
        reply: Option<AudioReply>,
    },
    SetSpeed {
        speed: f32,
        reply: Option<AudioReply>,
    },
    Seek {
        seconds: f64,
        reply: Option<AudioReply>,
    },
    SetVolume {
        volume: f32,
        fade_ms: u32,
        reply: Option<AudioReply>,
    },
    Stop {
        reply: Option<AudioReply>,
    },
}

pub struct AudioController {
    sender: Sender<AudioCommand>,
    snapshot: Arc<Mutex<PlayerSnapshot>>,
}

impl AudioController {
    pub fn create(app: AppHandle, initial_volume: f32) -> Self {
        let (sender, receiver) = mpsc::channel::<AudioCommand>();
        let snapshot = Arc::new(Mutex::new(PlayerSnapshot {
            track_id: None,
            position: 0.0,
            duration: 0.0,
            playing: false,
            volume: initial_volume,
            ended: false,
        }));

        {
            let worker_snapshot = snapshot.clone();
            let failure_snapshot = snapshot.clone();
            thread::Builder::new()
                .name("kexgo-audio".to_string())
                .spawn(move || {
                    let result = catch_unwind(AssertUnwindSafe(|| {
                        audio_loop(receiver, worker_snapshot)
                    }));
                    if result.is_err() {
                        eprintln!("KexGo audio engine stopped after a decoder panic");
                        if let Ok(mut state) = failure_snapshot.lock() {
                            state.track_id = None;
                            state.playing = false;
                            state.ended = false;
                        }
                    }
                })
                .expect("failed to start KexGo audio thread");
        }

        {
            let snapshot = snapshot.clone();
            thread::Builder::new()
                .name("kexgo-audio-ticker".to_string())
                .spawn(move || tick_loop(app, snapshot))
                .expect("failed to start KexGo audio ticker");
        }

        Self { sender, snapshot }
    }

    pub fn snapshot(&self) -> PlayerSnapshot {
        self.snapshot
            .lock()
            .map(|state| state.clone())
            .unwrap_or_default()
    }

    pub fn tick(&self) -> PlayerTick {
        let state = self.snapshot();
        PlayerTick {
            track_id: state.track_id,
            position: state.position,
            duration: state.duration,
            playing: state.playing,
            volume: state.volume,
            ended: state.ended,
        }
    }

    pub fn play(
        &self,
        track_id: String,
        path: PathBuf,
        start_at: f64,
        duration: f64,
    ) -> Result<(), String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.sender
            .send(AudioCommand::Play {
                track_id,
                path,
                start_at,
                duration,
                reply: Some(reply_tx),
            })
            .map_err(|_| "音频引擎未启动".to_string())?;
        wait_for_reply(reply_rx)
    }

    pub fn pause(&self, fade_ms: u32) -> Result<(), String> {
        self.send_simple(AudioCommand::Pause {
            fade_ms,
            reply: None,
        })
    }

    pub fn resume(&self, fade_ms: u32) -> Result<(), String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.sender
            .send(AudioCommand::Resume {
                fade_ms,
                reply: Some(reply_tx),
            })
            .map_err(|_| "音频引擎未启动".to_string())?;
        wait_for_reply(reply_rx)
    }

    pub fn set_speed(&self, speed: f32) -> Result<(), String> {
        self.send_simple(AudioCommand::SetSpeed {
            speed,
            reply: None,
        })
    }

    pub fn seek(&self, seconds: f64) -> Result<(), String> {
        let (reply_tx, reply_rx) = mpsc::channel();
        self.sender
            .send(AudioCommand::Seek {
                seconds,
                reply: Some(reply_tx),
            })
            .map_err(|_| "音频引擎未启动".to_string())?;
        wait_for_reply(reply_rx)
    }

    pub fn set_volume(&self, volume: f32, fade_ms: u32) -> Result<(), String> {
        self.send_simple(AudioCommand::SetVolume {
            volume,
            fade_ms,
            reply: None,
        })
    }

    pub fn stop(&self) -> Result<(), String> {
        self.send_simple(AudioCommand::Stop { reply: None })
    }

    fn send_simple(&self, command: AudioCommand) -> Result<(), String> {
        self.sender
            .send(command)
            .map_err(|_| "音频引擎未启动".to_string())
    }
}

fn wait_for_reply(receiver: Receiver<Result<(), String>>) -> Result<(), String> {
    match receiver.recv_timeout(Duration::from_secs(8)) {
        Ok(result) => result,
        Err(_) => Err("音频引擎响应超时".to_string()),
    }
}

struct VolumeFade {
    from: f32,
    to: f32,
    started: Instant,
    duration: Duration,
}

fn audio_loop(receiver: Receiver<AudioCommand>, snapshot: Arc<Mutex<PlayerSnapshot>>) {
    let mut output: Option<(OutputStream, OutputStreamHandle)> = None;
    let mut sink: Option<Sink> = None;
    let mut active_track: Option<String> = None;
    let mut volume_target: f32 = snapshot.lock().map(|state| state.volume).unwrap_or(0.78);
    let mut applied_volume = volume_target;
    let mut volume_fade: Option<VolumeFade> = None;
    let mut pause_after_fade = false;
    let mut playback_speed: f32 = 1.0;
    let mut current_duration = 0.0;

    loop {
        let poll_interval = if volume_fade.is_some() {
            Duration::from_millis(16)
        } else {
            Duration::from_millis(200)
        };
        match receiver.recv_timeout(poll_interval) {
            Ok(command) => match command {
                AudioCommand::Play {
                    track_id,
                    path,
                    start_at,
                    duration,
                    reply,
                } => {
                    let result = (|| -> Result<(), String> {
                        if output.is_none() {
                            let created = OutputStream::try_default()
                                .map_err(|error| format!("无法打开音频输出设备：{error}"))?;
                            output = Some(created);
                        }
                        let (_, handle) = output.as_ref().expect("output initialized above");
                        let file = File::open(&path)
                            .map_err(|error| format!("无法打开音频文件：{error}"))?;
                        let decoder = Decoder::new(BufReader::new(file))
                            .map_err(|error| format!("无法解码这个音频文件：{error}"))?;
                        let decoded_duration = decoder
                            .total_duration()
                            .map(|value| value.as_secs_f64())
                            .filter(|value| *value > 0.0)
                            .unwrap_or(duration);
                        let new_sink = Sink::try_new(handle)
                            .map_err(|error| format!("无法创建播放通道：{error}"))?;
                        new_sink.set_volume(applied_volume);
                        new_sink.set_speed(playback_speed);
                        new_sink.append(decoder);
                        let mut actual_start = 0.0_f64;
                        if start_at > 0.05
                            && new_sink
                                .try_seek(Duration::from_secs_f64(start_at.max(0.0)))
                                .is_ok()
                        {
                            actual_start = start_at;
                        }
                        new_sink.play();
                        if let Some(old) = sink.take() {
                            old.stop();
                        }
                        sink = Some(new_sink);
                        active_track = Some(track_id.clone());
                        current_duration = decoded_duration;
                        volume_fade = None;
                        pause_after_fade = false;
                        if let Ok(mut state) = snapshot.lock() {
                            state.track_id = Some(track_id);
                            state.position = actual_start;
                            state.duration = decoded_duration;
                            state.playing = true;
                            state.ended = false;
                        }
                        Ok(())
                    })();
                    if result.is_err() {
                        if let Some(old) = sink.take() {
                            old.stop();
                        }
                        active_track = None;
                        current_duration = 0.0;
                        if let Ok(mut state) = snapshot.lock() {
                            state.track_id = None;
                            state.position = 0.0;
                            state.duration = 0.0;
                            state.playing = false;
                            state.ended = false;
                        }
                    }
                    if let Some(reply) = reply {
                        let _ = reply.send(result);
                    }
                }
                AudioCommand::Pause { fade_ms, reply } => {
                    if let Some(current) = &sink {
                        if fade_ms > 0 && !current.empty() {
                            applied_volume = current.volume();
                            volume_fade = Some(VolumeFade {
                                from: applied_volume,
                                to: 0.0,
                                started: Instant::now(),
                                duration: Duration::from_millis(u64::from(fade_ms.min(2_000))),
                            });
                            pause_after_fade = true;
                        } else {
                            current.pause();
                            current.set_volume(volume_target);
                            applied_volume = volume_target;
                            volume_fade = None;
                            pause_after_fade = false;
                            if let Ok(mut state) = snapshot.lock() {
                                state.playing = false;
                                state.volume = volume_target;
                            }
                        }
                    } else if let Ok(mut state) = snapshot.lock() {
                        state.playing = false;
                    }
                    if let Some(reply) = reply {
                        let _ = reply.send(Ok(()));
                    }
                }
                AudioCommand::Resume { fade_ms, reply } => {
                    let result = if let Some(current) = &sink {
                        if current.empty() {
                            Err("播放已结束".to_string())
                        } else {
                            if fade_ms > 0 {
                                current.set_volume(0.0);
                                applied_volume = 0.0;
                                volume_fade = Some(VolumeFade {
                                    from: 0.0,
                                    to: volume_target,
                                    started: Instant::now(),
                                    duration: Duration::from_millis(u64::from(fade_ms.min(2_000))),
                                });
                                if let Ok(mut state) = snapshot.lock() {
                                    state.volume = 0.0;
                                }
                            } else {
                                current.set_volume(volume_target);
                                applied_volume = volume_target;
                                volume_fade = None;
                            }
                            pause_after_fade = false;
                            current.play();
                            if let Ok(mut state) = snapshot.lock() {
                                state.playing = true;
                                state.ended = false;
                            }
                            Ok(())
                        }
                    } else {
                        Err("没有正在加载的歌曲".to_string())
                    };
                    if let Some(reply) = reply {
                        let _ = reply.send(result);
                    }
                }
                AudioCommand::SetSpeed { speed, reply } => {
                    playback_speed = speed.clamp(0.5, 2.0);
                    if let Some(current) = &sink {
                        current.set_speed(playback_speed);
                    }
                    if let Some(reply) = reply {
                        let _ = reply.send(Ok(()));
                    }
                }
                AudioCommand::Seek { seconds, reply } => {
                    let result = if let Some(current) = &sink {
                        let target = seconds.max(0.0);
                        match current.try_seek(Duration::from_secs_f64(target)) {
                            Ok(_) => {
                                if let Ok(mut state) = snapshot.lock() {
                                    state.position = target;
                                    state.ended = false;
                                }
                                Ok(())
                            }
                            Err(error) => Err(format!("无法跳转到这个位置：{error}")),
                        }
                    } else {
                        Err("没有正在加载的歌曲".to_string())
                    };
                    if let Some(reply) = reply {
                        let _ = reply.send(result);
                    }
                }
                AudioCommand::SetVolume {
                    volume: next_volume,
                    fade_ms,
                    reply,
                } => {
                    volume_target = next_volume.clamp(0.0, 1.0);
                    if let Some(current) = &sink {
                        if fade_ms > 0 {
                            applied_volume = current.volume();
                            volume_fade = Some(VolumeFade {
                                from: applied_volume,
                                to: volume_target,
                                started: Instant::now(),
                                duration: Duration::from_millis(u64::from(fade_ms.min(1_000))),
                            });
                        } else {
                            current.set_volume(volume_target);
                            applied_volume = volume_target;
                            volume_fade = None;
                        }
                    } else {
                        applied_volume = volume_target;
                        volume_fade = None;
                    }
                    if let Ok(mut state) = snapshot.lock() {
                        state.volume = applied_volume;
                    }
                    if let Some(reply) = reply {
                        let _ = reply.send(Ok(()));
                    }
                }
                AudioCommand::Stop { reply } => {
                    if let Some(current) = sink.take() {
                        current.stop();
                    }
                    active_track = None;
                    current_duration = 0.0;
                    volume_fade = None;
                    pause_after_fade = false;
                    if let Ok(mut state) = snapshot.lock() {
                        state.track_id = None;
                        state.position = 0.0;
                        state.duration = 0.0;
                        state.playing = false;
                        state.ended = false;
                    }
                    if let Some(reply) = reply {
                        let _ = reply.send(Ok(()));
                    }
                }
            },
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => break,
        }

        let mut fade_finished = false;
        if let Some(fade) = &volume_fade {
            let progress = (fade.started.elapsed().as_secs_f32()
                / fade.duration.as_secs_f32().max(0.001))
            .clamp(0.0, 1.0);
            let next = fade.from + (fade.to - fade.from) * progress;
            applied_volume = next;
            if let Some(current) = &sink {
                current.set_volume(next);
            }
            if let Ok(mut state) = snapshot.lock() {
                state.volume = next;
            }
            fade_finished = progress >= 1.0;
        }
        if fade_finished {
            volume_fade = None;
            if pause_after_fade {
                pause_after_fade = false;
                applied_volume = volume_target;
                if let Some(current) = &sink {
                    current.pause();
                    current.set_volume(volume_target);
                }
                if let Ok(mut state) = snapshot.lock() {
                    state.playing = false;
                    state.volume = volume_target;
                }
            } else {
                applied_volume = volume_target;
                if let Some(current) = &sink {
                    current.set_volume(volume_target);
                }
            }
        }

        if let Some(current) = &sink {
            let position = current.get_pos().as_secs_f64();
            let empty = current.empty();
            let paused = current.is_paused();
            if let Ok(mut state) = snapshot.lock() {
                if active_track.is_some() {
                    state.position = if current_duration > 0.0 {
                        position.min(current_duration)
                    } else {
                        position
                    };
                    if current_duration > 0.0 {
                        state.duration = current_duration;
                    }
                    if empty && !paused && !state.ended {
                        state.playing = false;
                        state.ended = true;
                    } else {
                        state.playing = !empty && !paused;
                    }
                }
            }
        }
    }
}

fn tick_loop(app: AppHandle, snapshot: Arc<Mutex<PlayerSnapshot>>) {
    let mut previous_track_id: Option<String> = None;
    loop {
        thread::sleep(Duration::from_millis(250));
        let tick = {
            let state = match snapshot.lock() {
                Ok(state) => state.clone(),
                Err(_) => continue,
            };
            PlayerTick {
                track_id: state.track_id,
                position: state.position,
                duration: state.duration,
                playing: state.playing,
                volume: state.volume,
                ended: state.ended,
            }
        };
        // Emit while active, plus one final idle tick after playback stops.
        let should_emit = tick.track_id.is_some() || previous_track_id.is_some();
        previous_track_id = tick.track_id.clone();
        if should_emit {
            let _ = app.emit("player:tick", tick);
        }
    }
}
