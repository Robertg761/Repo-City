import numpy as np, soundfile as sf
from scipy.signal import fftconvolve
SR = 48000; L = 84.0; N = int(SR * L)
rng = np.random.default_rng(3)
t = np.arange(N) / SR
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
# MIDI chords, 8 s each: Dmaj9, Bm9, Gmaj9, A6/9sus
chords = [[38, 45, 54, 61, 64], [35, 42, 50, 57, 61], [31, 38, 47, 54, 57], [33, 40, 49, 54, 59]]
CH = 8.0
L_out = np.zeros(N); R_out = np.zeros(N)
def env(n, a, r):
    e = np.ones(n); ai = int(a * SR); ri = int(r * SR)
    e[:ai] = np.sin(np.linspace(0, np.pi / 2, ai)) ** 2
    e[-ri:] *= np.cos(np.linspace(0, np.pi / 2, ri)) ** 2
    return e
k = 0; start = 0.0
while start < L - 2:
    notes = chords[k % 4]
    dur = CH + 3.0
    i0 = int(start * SR); n = min(int(dur * SR), N - i0)
    tt = np.arange(n) / SR
    e = env(n, 2.2, 3.0)
    for j, m in enumerate(notes):
        f = hz(m + 12) if j == 0 and m < 36 else hz(m)
        for det, pan in ((-6, 0.3), (0, 0.5), (6, 0.7)):
            fd = f * 2 ** (det / 1200)
            ph = rng.uniform(0, 2 * np.pi)
            wave = np.zeros(n)
            # warm additive tone, harmonics rolled off, slowly breathing brightness
            bright = 1.5 + 0.25 * np.sin(2 * np.pi * 0.07 * (tt + start))
            for h in range(1, 9):
                if fd * h > 5000: break
                wave += np.sin(2 * np.pi * fd * h * tt + ph * h) / h ** bright
            amp = 0.05 * (0.8 if j == 0 else 1.0)
            L_out[i0:i0 + n] += wave * e * amp * np.cos(pan * np.pi / 2)
            R_out[i0:i0 + n] += wave * e * amp * np.sin(pan * np.pi / 2)
    # sub root
    root = hz(notes[0] - 12 if notes[0] > 36 else notes[0])
    sub = np.sin(2 * np.pi * root * tt) * e * 0.06
    L_out[i0:i0 + n] += sub; R_out[i0:i0 + n] += sub
    # bell arpeggio from the upper chord tones, from 7 s on
    if start >= 6:
        pool = [m + 24 for m in notes[2:]] + [notes[1] + 24]
        step = 0.5
        for b in range(int(CH / step)):
            if rng.random() < 0.28: continue
            bt = start + b * step + rng.normal(0, 0.012)
            m = pool[rng.integers(len(pool))]
            bi = int(bt * SR); bn = min(int(2.4 * SR), N - bi)
            if bn <= 0: continue
            bt_ = np.arange(bn) / SR
            f = hz(m)
            tone = (np.sin(2 * np.pi * f * bt_) + 0.25 * np.sin(2 * np.pi * 2.01 * f * bt_) * np.exp(-bt_ * 6)) * np.exp(-bt_ * 2.6)
            tone *= np.minimum(1, bt_ / 0.004)
            v = 0.035 * rng.uniform(0.6, 1.0)
            p = rng.uniform(0.2, 0.8)
            L_out[bi:bi + bn] += tone * v * np.cos(p * np.pi / 2); R_out[bi:bi + bn] += tone * v * np.sin(p * np.pi / 2)
    start += CH; k += 1
# reverb: decaying stereo noise
irn = int(3.8 * SR); it = np.arange(irn) / SR
ir_l = rng.normal(0, 1, irn) * np.exp(-it * 1.9); ir_r = rng.normal(0, 1, irn) * np.exp(-it * 1.9)
# darken the tail
for ir in (ir_l, ir_r):
    ir[:] = np.convolve(ir, np.ones(6) / 6, mode="same")
wl = fftconvolve(L_out, ir_l)[:N]; wr = fftconvolve(R_out, ir_r)[:N]
wl /= np.max(np.abs(wl)); wr /= np.max(np.abs(wr))
dl = L_out / np.max(np.abs(L_out)); dr = R_out / np.max(np.abs(R_out))
out = np.stack([0.55 * dl + 0.45 * wl, 0.55 * dr + 0.45 * wr], axis=1)
out /= np.max(np.abs(out)) / 0.5
fade = int(3 * SR); out[-fade:] *= np.linspace(1, 0, fade)[:, None]; out[:int(1.5*SR)] *= np.linspace(0, 1, int(1.5*SR))[:, None]
sf.write("music.wav", out.astype(np.float32), SR)
print("ok", out.shape, float(np.sqrt(np.mean(out**2))))
