import json, soundfile as sf
from faster_whisper import WhisperModel
m = WhisperModel("small.en", device="cpu", compute_type="int8")
chunks = json.load(open("chunks.json")); out = {}
for k, cs in chunks.items():
    dur = sf.info(f"{k}.wav").duration
    segs, _ = m.transcribe(f"{k}.wav", word_timestamps=True)
    words = [w for s in segs for w in s.words]
    res, i = [], 0
    for c in cs:
        n = len(c.replace(",", " ").split())
        # "five hundred" is transcribed as "500": one word for two.
        n -= c.count("five hundred")
        ws = words[i:i+n]; i += n
        res.append({"text": c, "start": round(ws[0].start, 2) if ws else 0, "end": round(ws[-1].end, 2) if ws else dur})
    out[k] = {"dur": round(dur, 2), "chunks": res}
    print(k, [(r["start"], r["end"]) for r in res], "words left", len(words) - i)
json.dump(out, open("timing.json", "w"), indent=1)
