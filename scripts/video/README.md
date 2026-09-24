# Demo video pipeline

This folder builds the submission video. Every frame is the live production site, captured in headless Chrome on a real GPU. Nothing is mocked.

The finished cut runs 77 seconds at 1920 x 1080 and 60 fps. It shows:

- the React metropolis under the title;
- `honojs/hono` typed and surveyed;
- a click on a long-standing issue;
- a pull request's building site;
- night;
- `sindresorhus/p-limit` as a village and `facebook/react` as a metropolis;
- the best stops of the tour;
- the end card.

## How it works

| Step | File | What it does |
| --- | --- | --- |
| Record | `director.mjs` | Drives the live site shot by shot: moves the cursor, types, wheels, drags, clicks. Writes JPEG frames per segment and a `marks.json` of key moments. |
| | `recorder.mjs`, `cdp.mjs` | Run `chrome-headless-shell` on virtual time and render each frame with `HeadlessExperimental.beginFrame`. The video is a smooth 60 fps however heavy the scene is. The recorder draws the cursor and a click ring into the page. |
| | `scan.mjs` | Finds what is on screen: hovers a grid of points without advancing time and reads the tooltips. `director.mjs` uses the same `find()` to locate an issue or a PR before it moves the cursor there. |
| Narrate | `tts/lines.json`, `tts/batch.py` | Speaks each line with Kokoro-82M (voice `af_heart`), run locally. |
| | `tts/chunks.json`, `tts/align.py` | Splits each line into caption sentences and times them with Whisper `small.en` word timestamps. The output is `tts/timing.json`. |
| Sound | `render-audio.mjs` | Renders the app's own soundscape offline: city evening, city night, village night, metropolis night, and fire and crane. |
| | `audio/music.py` | Synthesizes the music bed with numpy: a D major pad, bell arpeggios and a convolution reverb. |
| Overlays | `overlays.mjs` | Renders the title, the caption pills and the end card as transparent PNGs, in Geist. |
| Edit | `make_timeline.py` | Lines each narration up with the recorded action, for example "Click one" with the click. It writes `timeline.json`. |
| | `build.py` | Handles cuts, speed ramps, crossfades, overlays and the slow push-in on the end card, then pipes to x264. Mixes the voice, the ambience and the ducked music, loudness-normalised to -15 LUFS. |
| Review | `sheet.py` | Contact sheet of any segment. |

## Run it

Run everything from this folder. You need Node 22+, ffmpeg, [uv](https://docs.astral.sh/uv/) and an NVIDIA or AMD GPU with Vulkan.

```bash
# One-time downloads (gitignored)
npx @puppeteer/browsers install chrome-headless-shell@stable --path ./browsers
curl -LO --output-dir tts https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -LO --output-dir tts https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

# Narration and caption timing
(cd tts && uv run --python 3.12 --with kokoro-onnx --with soundfile python batch.py af_heart 1.0)
(cd tts && uv run --python 3.12 --with faster-whisper --with soundfile python align.py)

# Record: about 12 minutes on an RTX 3060. Set TOUR=1 to record the tour as well.
TOUR=1 node director.mjs takes/run1

# Overlays, music, edit
node overlays.mjs
(cd audio && uv run --python 3.12 --with numpy --with scipy --with soundfile python music.py)
TAKE=takes/run1 TOUR_TAKE=takes/run1 python3 make_timeline.py
mkdir -p out && uv run --python 3.12 --with numpy --with scipy --with soundfile --with pillow python build.py out/repo-city-demo.mp4
```

`PREVIEW=1.0 python build.py` writes one still per second to `out/preview/` instead of encoding. Use it to check pacing before the full render.

## The soundscape

`render-audio.mjs` needs `next dev` on port 3210 with one extra line. The line makes `renderScene` in `components/audio/offline.ts` keep its buffer for the script to read:

```ts
// after `const channels = [buffer.getChannelData(0), buffer.getChannelData(1)];`
(globalThis as unknown as { __lastRender: Float32Array[] }).__lastRender = channels;
```

Then run:

```bash
node render-audio.mjs "city evening" "city night" "village night" "metropolis night" "close: city fire and crane"
for f in audio/*.s16le; do ffmpeg -f s16le -ar 44100 -ac 2 -i "$f" "${f%.s16le}.wav"; done
```

## Notes

- The data is live. Issue numbers, counts and health scores drift with the repositories. `director.mjs` finds its targets on screen rather than using fixed coordinates. It still looks for hono's issue #2723 first, so check that it is still open before a re-record.
- The recording Chrome runs with `--mute-audio`.
- The models used here are declared in [AI_MODELS.md](../../AI_MODELS.md#demo-video).
