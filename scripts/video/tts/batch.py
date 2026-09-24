import sys, json, soundfile as sf
from kokoro_onnx import Kokoro
k = Kokoro("kokoro-v1.0.onnx", "voices-v1.0.bin")
voice, speed = sys.argv[1], float(sys.argv[2])
out = {}
for key, text in json.load(open("lines.json")):
    s, sr = k.create(text, voice=voice, speed=speed, lang="en-us")
    sf.write(f"{key}.wav", s, sr); out[key] = round(len(s)/sr, 2)
print(json.dumps(out)); print("total", round(sum(out.values()),1))
