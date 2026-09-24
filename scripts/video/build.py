"""Assemble the demo: frames + overlays -> x264, and voice + ambience + music -> AAC."""
import json, os, subprocess, sys
import numpy as np
import soundfile as sf
from PIL import Image

FPS = 60
W, H = 1920, 1080
ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "out", "repo-city-demo.mp4")
PREVIEW = os.environ.get("PREVIEW")  # e.g. "0.5" renders half-size stills only

tl = json.load(open(os.path.join(ROOT, "timeline.json")))

# ---------- video ----------
def frames_of(clip):
    """List of source frame paths for a clip, honouring speed ramps and freezes."""
    d = os.path.join(ROOT, clip["dir"])
    out = []
    for part in clip["parts"]:
        a, b = part["in"], part["out"]
        speed = part.get("speed", 1.0)
        if part.get("freeze"):
            out += [os.path.join(d, f"{a:05d}.jpg")] * int(round(part["freeze"] * FPS))
            continue
        n = int(round((b - a) / speed))
        for i in range(n):
            out.append(os.path.join(d, f"{min(b - 1, int(a + i * speed)):05d}.jpg"))
    return out

clips = tl["clips"]
seq = []  # (clip index, frame path)
starts = []
t = 0
for ci, c in enumerate(clips):
    fs = frames_of(c)
    xf = int(round(c.get("xfade", 0) * FPS)) if ci > 0 else 0
    start = t - xf
    starts.append(start)
    c["_frames"] = fs
    c["_start"] = start
    c["_xf"] = xf
    t = start + len(fs)
total = t
print(f"video: {total} frames = {total / FPS:.2f}s")
json.dump({c["name"]: round(c["_start"] / FPS, 3) for c in clips}, open(os.path.join(ROOT, "out", "clip_starts.json"), "w"), indent=1)

overlays = {}
def ov(name):
    if name not in overlays:
        overlays[name] = np.asarray(Image.open(os.path.join(ROOT, "overlays", name + ".png")).convert("RGBA")).astype(np.float32) / 255.0
    return overlays[name]

cache = {}
def load(p):
    if p not in cache:
        if len(cache) > 400: cache.clear()
        cache[p] = np.asarray(Image.open(p).convert("RGB")).astype(np.float32) / 255.0
    return cache[p]

def kenburns(img, k):
    if k == 1.0: return img
    im = Image.fromarray((img * 255).astype(np.uint8))
    w, h = int(W / k), int(H / k)
    x, y = (W - w) // 2, (H - h) // 2
    return np.asarray(im.crop((x, y, x + w, y + h)).resize((W, H), Image.LANCZOS)).astype(np.float32) / 255.0

def frame_at(f):
    img = None
    for c in clips:
        s = c["_start"]; n = len(c["_frames"])
        if s <= f < s + n:
            fr = load(c["_frames"][f - s])
            if c.get("kenburns"):
                k0, k1 = c["kenburns"]; fr = kenburns(fr, k0 + (k1 - k0) * (f - s) / max(1, n - 1))
            if img is None:
                img = fr
            else:
                # crossfade: this clip fades in over its xfade frames
                a = min(1.0, (f - s + 1) / max(1, c["_xf"]))
                a = a * a * (3 - 2 * a)
                img = img * (1 - a) + fr * a
    # fade from and to black
    if f < tl.get("fade_in", 0) * FPS: img = img * (f / (tl["fade_in"] * FPS))
    tail = tl.get("fade_out", 0) * FPS
    if f > total - tail: img = img * max(0.0, (total - f) / tail)
    # overlays
    tsec = f / FPS
    for o in tl["overlays"]:
        if o["start"] - o.get("fade", 0.25) <= tsec <= o["end"] + o.get("fade", 0.25):
            fd = o.get("fade", 0.25)
            a = 1.0
            if tsec < o["start"]: a = (tsec - (o["start"] - fd)) / fd
            elif tsec > o["end"]: a = 1 - (tsec - o["end"]) / fd
            a = max(0.0, min(1.0, a)); a = a * a * (3 - 2 * a)
            layer = ov(o["name"])
            al = layer[..., 3:4] * a
            img = img * (1 - al) + layer[..., :3] * al
    return img

os.makedirs(os.path.dirname(OUT), exist_ok=True)
if PREVIEW:
    step = int(float(PREVIEW) * FPS)
    os.makedirs(os.path.join(ROOT, "out", "preview"), exist_ok=True)
    for f in range(0, total, step):
        Image.fromarray((frame_at(f) * 255).astype(np.uint8)).resize((640, 360)).save(os.path.join(ROOT, "out", "preview", f"{f:05d}.jpg"), quality=80)
    print("previews written"); sys.exit(0)

# ---------- audio ----------
SR = 48000
N = int(total / FPS * SR) + SR
voice = np.zeros((N, 2)); bed = np.zeros((N, 2)); vmask = np.zeros(N)

def read(path):
    x, sr = sf.read(path, always_2d=True)
    if sr != SR:
        import scipy.signal as ss
        x = ss.resample_poly(x, SR, sr, axis=0)
    if x.shape[1] == 1: x = np.repeat(x, 2, axis=1)
    return x

for v in tl["voice"]:
    x = read(os.path.join(ROOT, "tts", v["id"] + ".wav")) * v.get("gain", 1.0)
    i = int(v["at"] * SR); n = min(len(x), N - i)
    voice[i:i + n] += x[:n]; vmask[i:i + n] = 1

for a in tl["ambience"]:
    x = read(os.path.join(ROOT, "audio", a["file"]))
    i0, i1 = int(a["from"] * SR), int(a["to"] * SR)
    off = int(a.get("offset", 2.0) * SR)
    src = x[off:]
    need = i1 - i0
    if len(src) < need:
        # loop with a 1 s crossfade at each seam
        cf = SR
        out_ = src.copy()
        while len(out_) < need:
            ramp = np.linspace(0, 1, cf)[:, None]
            out_ = np.concatenate([out_[:-cf], out_[-cf:] * (1 - ramp) + src[:cf] * ramp, src[cf:]])
        src = out_
    seg = src[:need]
    fd = int(a.get("fade", 0.6) * SR)
    env = np.ones(i1 - i0); env[:fd] = np.linspace(0, 1, fd); env[-fd:] = np.minimum(env[-fd:], np.linspace(1, 0, fd))
    bed[i0:i1] += seg * env[:, None] * a.get("gain", 1.0)

music = read(os.path.join(ROOT, "audio", "music.wav"))[:N]
if len(music) < N: music = np.pad(music, ((0, N - len(music)), (0, 0)))
# duck under the voice, smoothed
k = int(0.35 * SR)
sm = np.convolve(vmask, np.ones(k) / k, mode="same")
mgain = tl["music"]["free"] - (tl["music"]["free"] - tl["music"]["under_voice"]) * sm
mix = voice * tl.get("voice_gain", 1.0) + bed * tl.get("ambience_gain", 1.0) + music * mgain[:, None]
end = int(total / FPS * SR)
mix = mix[:end]
fo = int(tl.get("audio_fade_out", 1.5) * SR); mix[-fo:] *= np.linspace(1, 0, fo)[:, None]
fi = int(0.5 * SR); mix[:fi] *= np.linspace(0, 1, fi)[:, None]
raw_wav = os.path.join(ROOT, "out", "mix_raw.wav")
sf.write(raw_wav, mix.astype(np.float32), SR)
mix_wav = os.path.join(ROOT, "out", "mix.wav")
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw_wav, "-af", "loudnorm=I=-15:TP=-1.5:LRA=11", "-ar", "48000", mix_wav], check=True)

# ---------- encode ----------
enc = subprocess.Popen([
    "ffmpeg", "-v", "error", "-y",
    "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
    "-i", mix_wav,
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-pix_fmt", "yuv420p", "-profile:v", "high",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT,
], stdin=subprocess.PIPE)
for f in range(total):
    enc.stdin.write((np.clip(frame_at(f), 0, 1) * 255 + 0.5).astype(np.uint8).tobytes())
    if f % 600 == 0: print(f"  frame {f}/{total}", flush=True)
enc.stdin.close(); enc.wait()
print("wrote", OUT)
