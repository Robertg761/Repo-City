import sys
from faster_whisper import WhisperModel
m = WhisperModel("small.en", device="cpu", compute_type="int8")
for f in sys.argv[1:]:
    segs, _ = m.transcribe(f, beam_size=5)
    print(f, "|", " ".join(s.text.strip() for s in segs))
