"""Generate a small, original ambient demo loop for the browser preview."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np

RATE = 22_050
DURATION = 96.0
OUT = Path(__file__).resolve().parents[1] / 'dev-demo' / 'night-train.wav'

rng = np.random.default_rng(8)
samples = np.arange(int(RATE * DURATION), dtype=np.float64) / RATE

# Slow, warm chord bed in A minor-ish colours.
chords = [
    (55.00, 110.00, 164.81, 220.00, 261.63),
    (49.00, 98.00, 146.83, 196.00, 246.94),
    (43.65, 87.31, 130.81, 174.61, 220.00),
    (65.41, 130.81, 196.00, 261.63, 329.63),
]

mix = np.zeros_like(samples)
bar = 8.0
for index, chord in enumerate(chords):
    start = index * bar
    while start < DURATION:
        end = min(DURATION, start + bar + 2.2)
        mask = (samples >= start) & (samples < end)
        local = samples[mask] - start
        attack = np.clip(local / 2.2, 0, 1)
        release = np.clip((end - start - local) / 2.0, 0, 1)
        env = (attack * release) ** 1.3
        window = 1.0 + 0.06 * np.sin(local * 0.7)
        segment = np.zeros_like(local)
        for voice, freq in enumerate(chord):
            amp = 0.045 / (voice + 1) ** 0.55
            drift = 1 + 0.0008 * np.sin(local * (0.13 + voice * 0.07))
            segment += amp * np.sin(2 * np.pi * freq * drift * local + voice * 1.7)
        # A soft, breathy upper shimmer.
        segment += 0.005 * np.sin(2 * np.pi * 1046.5 * local + np.sin(local * 0.4))
        mix[mask] += segment * env * window
        start += bar * 2

# A sparse bell-ish motif.
motif = [0, 3, 7, 3, 10, 7, 3, 0]
for note_index, semitone in enumerate(motif):
    start = 12.0 + note_index * 8.0
    if start >= DURATION:
        break
    duration = 2.8
    count = int(RATE * duration)
    local = np.arange(count) / RATE
    freq = 440.0 * 2 ** (semitone / 12.0)
    envelope = np.exp(-local * 2.8) * np.clip(local / 0.035, 0, 1)
    bell = (
        np.sin(2 * np.pi * freq * local) * 0.035
        + np.sin(2 * np.pi * freq * 2.01 * local) * 0.011
        + np.sin(2 * np.pi * freq * 3.02 * local) * 0.004
    )
    begin = int(start * RATE)
    end = min(len(mix), begin + count)
    mix[begin:end] += (bell * envelope)[: end - begin]

# Gentle vinyl-like texture, gated by a slow envelope.
noise = rng.normal(0, 1, len(samples))
noise = np.convolve(noise, np.ones(7) / 7, mode='same')
mix += noise * 0.0018 * (0.6 + 0.4 * np.sin(samples * 0.09))

fade_in = np.clip(samples / 3.0, 0, 1)
fade_out = np.clip((DURATION - samples) / 5.0, 0, 1)
mix *= fade_in * fade_out

peak = np.max(np.abs(mix)) or 1.0
mix = (mix / peak) * 0.7
pcm = (mix * 32767).astype(np.int16)

OUT.parent.mkdir(parents=True, exist_ok=True)
import wave

with wave.open(str(OUT), 'wb') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(pcm.tobytes())

print(f'wrote {OUT} ({OUT.stat().st_size / 1024 / 1024:.2f} MB, {DURATION:.0f}s)')
