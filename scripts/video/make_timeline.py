"""Build timeline.json from the takes' marks and the narration timing."""
import json, os
FPS = 60
R = os.path.dirname(os.path.abspath(__file__))
TAKE = os.environ.get("TAKE", "takes/run2")
TOUR = os.environ.get("TOUR_TAKE", "takes/run1")
marks = json.load(open(os.path.join(R, TAKE, "marks.json")))
tour_marks = json.load(open(os.path.join(R, TOUR, "marks.json")))
timing = json.load(open(os.path.join(R, "tts", "timing.json")))

def mk(seg, label, ms=marks):
    for m in ms:
        if m["seg"] == seg and m["label"].startswith(label):
            return m["frame"]
    raise KeyError((seg, label))

def nframes(d):
    return len([f for f in os.listdir(os.path.join(R, d)) if f.endswith(".jpg")])

clips, voice, overlays = [], [], []
t = 0.0  # output seconds at the end of the previous clip

def add(name, d, parts, xfade=0.0, **kw):
    global t
    n = 0
    for p in parts:
        n += p["freeze"] * FPS if p.get("freeze") else round((p["out"] - p["in"]) / p.get("speed", 1.0))
    start = t - xfade
    clips.append({"name": name, "dir": d, "parts": parts, "xfade": xfade, **kw})
    t = start + n / FPS
    return start

def say(vid, at, pos="bottom"):
    voice.append({"id": vid, "at": round(at, 3)})
    for i, c in enumerate(timing[vid]["chunks"]):
        overlays.append({"name": f"cap_{vid}_{i}_{pos}", "start": round(at + c["start"] - 0.05, 3), "end": round(at + c["end"] + 0.25, 3), "fade": 0.15})
    return at + timing[vid]["dur"]

# A: cold open
a = add("cold", f"{TAKE}/A_cold", [{"in": 0, "out": 420}])
overlays.append({"name": "title", "start": 0.6, "end": 5.9, "fade": 0.6})
v_end = say("v01", 1.0)

# B: landing, type, survey, reveal
E = mk("B_hono", "enter")
b_in = E - 125
b = add("hono", f"{TAKE}/B_hono", [{"in": b_in, "out": nframes(f"{TAKE}/B_hono")}], xfade=0.6)
v_end = say("v02", max(v_end + 0.3, b + 0.25))
v_end = say("v03", max(v_end + 0.35, b + (E - b_in) / FPS + 0.35))

# D: zoom, hover, click the long-standing issue
click = mk("D_issue", "click hero")
d = add("issue", f"{TAKE}/D_issue", [{"in": 0, "out": nframes(f"{TAKE}/D_issue")}], xfade=0.3)
want = d + click / FPS - timing["v04"]["chunks"][2]["start"] + 0.05
v_end = say("v04", max(v_end + 0.3, want))
print(f"v04 wanted {want:.2f}, placed {voice[-1]['at']:.2f}")

# E: a pull request's building site
hover = mk("E_pr", "hover pr")
e_in = hover - 45
e = add("pr", f"{TAKE}/E_pr", [{"in": e_in, "out": nframes(f"{TAKE}/E_pr") - 20}], xfade=0.35)
v_end = say("v05", max(v_end + 0.3, e + 0.25))

# F: night
night = mk("F_night", "night")
f_in = night - 55
f = add("night", f"{TAKE}/F_night", [{"in": f_in, "out": night + 150}], xfade=0.3)
v_end = say("v06", max(v_end + 0.3, f + (night - f_in) / FPS + 0.35))

# G: the village
E = mk("G_village", "enter"); C = mk("G_village", "constructed")
g_in = E - 110
g = add("village", f"{TAKE}/G_village", [{"in": g_in, "out": min(nframes(f"{TAKE}/G_village"), C + 150)}], xfade=0.3)
v_end = say("v07", max(v_end + 0.3, g + (E - g_in) / FPS - 0.6))

# H: the metropolis, the survey sped up
E = mk("H_react", "enter"); C = mk("H_react", "constructed"); chip = mk("H_react", "chip")
h_in = E - 100
parts = [{"in": h_in, "out": E + 40}, {"in": E + 40, "out": C - 20, "speed": 3.0}, {"in": C - 20, "out": min(nframes(f"{TAKE}/H_react"), chip + 45)}]
h = add("react", f"{TAKE}/H_react", parts, xfade=0.3)
c_out = h + ((E + 40 - h_in) + (C - 20 - E - 40) / 3.0 + 20) / FPS
v_end = say("v08", max(v_end + 0.3, c_out + 0.4))

# I: the tour, cut to its best stops
ts = mk("I_tour", "tour start", tour_marks)
i1 = add("tour1", f"{TOUR}/I_tour", [{"in": ts - 40, "out": 300}], xfade=0.3)
v_end = say("v09", max(v_end + 0.3, i1 + 0.9), pos="top")
for k, (a_, b_) in enumerate([(960, 1200), (1610, 1790), (2580, 2760), (4050, 4330)]):
    add(f"tour{k + 2}", f"{TOUR}/I_tour", [{"in": a_, "out": b_}], xfade=0.45)

# End card over the cold-open aerial, pushing in slowly
end = add("end", f"{TAKE}/A_cold", [{"in": 599, "out": 600, "freeze": 5.2}], xfade=0.8, kenburns=[1.0, 1.045])
overlays.append({"name": "end", "start": end + 0.35, "end": t + 1, "fade": 0.5})
say_at = end + 0.9
voice.append({"id": "v10", "at": round(say_at, 3)})

# Beds: the city's own soundscape, by scene.
F_night_t = f + (night - f_in) / FPS
amb = [
    {"file": "city_evening.wav", "from": 0.0, "to": F_night_t + 0.4, "gain": 1.0, "offset": 2.0},
    {"file": "close_city_fire_and_crane.wav", "from": d + click / FPS, "to": e + 0.4, "gain": 0.45, "offset": 3.0},
    {"file": "city_night.wav", "from": F_night_t - 0.2, "to": g + 0.4, "gain": 1.0, "offset": 2.0},
    {"file": "village_night.wav", "from": g, "to": h + 0.4, "gain": 1.0, "offset": 2.0},
    {"file": "metropolis_night.wav", "from": h, "to": t, "gain": 1.0, "offset": 2.0},
]
tl = {
    "clips": clips, "voice": voice, "overlays": overlays, "ambience": amb,
    "music": {"free": 0.5, "under_voice": 0.2}, "voice_gain": 1.0, "ambience_gain": 0.9,
    "fade_in": 0.5, "fade_out": 1.2, "audio_fade_out": 1.6,
}
json.dump(tl, open(os.path.join(R, "timeline.json"), "w"), indent=1)
print(f"total {t:.2f}s")
for c in clips: print(" ", c["name"])
for v in voice: print("  voice", v["id"], v["at"])
