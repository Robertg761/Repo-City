"""
Procedural vs baked, under the same raking sun, shaded the way the app does:
albedo = palette colour x R, roughness = G x the material's, relief = a bump
of B over the layer's bump range. Top row procedural, bottom row baked.

    blender -b -t 2 --python blender/textures/compare.py -- <out.png> models|ground
Needs `DUMP_PROCEDURAL=1 pnpm vitest run blender/textures/dump-stats` and a pack.
"""
import math
import os
import sys

import bpy
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROC = os.path.join(ROOT, "blender", "out", "textures", "procedural")
PUB = os.path.join(ROOT, "public", "textures")

# name, palette colour, bump range (m), tile size (m), crop shown (m), roughness, file stem
MODELS = [
    ("brick", "#b5654a", 0.025, 2.0, 1.0, 0.9),
    ("stone", "#b8b0a0", 0.025, 2.0, 1.0, 0.9),
    ("roof", "#c0663e", 0.021, 2.0, 1.0, 0.9),
    ("slate", "#5a6470", 0.021, 2.0, 1.0, 0.9),
    ("thatch", "#c8a85a", 0.021, 2.0, 1.0, 0.95),
    ("wood", "#8a5f3c", 0.008, 1.3333, 1.0, 0.85),
    ("plaster", "#e4d8c0", 0.012, 2.0, 1.0, 0.9),
    ("foliage", "#3f7a34", 0.012, 1.6, 1.0, 0.9),
]
GROUND = [
    ("g-asphalt", "#4a4c50", 0.018, 9.0, 1.6, 0.95),
    ("g-pavers", "#a8a29a", 0.028, 1.2, 1.2, 0.92),
    ("g-setts", "#7d766c", 0.04, 4.0, 1.6, 0.95),
    ("g-concrete", "#a9a7a1", 0.014, 3.6, 1.6, 0.95),
    ("g-gravel", "#b3a58c", 0.03, 3.6, 1.2, 1.0),
    ("g-soil", "#6b5641", 0.03, 4.0, 1.2, 1.0),
    ("g-lawn", "#5c8f43", 0.025, 12.0, 1.6, 1.0),
    ("g-meadow", "#7a9a52", 0.025, 52.0, 1.6, 1.0),
]


def lin(h):
    h = h.lstrip("#")
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(f(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def procedural_image(stem):
    raw = np.fromfile(os.path.join(PROC, stem + ".raw"), np.uint8).reshape(512, 512, 4)
    img = bpy.data.images.new("proc-" + stem, 512, 512, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    px = raw.astype(np.float32) / 255.0
    px[:, :, 3] = 1.0
    img.pixels.foreach_set(px.ravel())
    img.pack()
    return img


def baked_image(stem):
    group = "ground" if stem.startswith("g-") else "surfaces"
    name = stem[2:] if stem.startswith("g-") else stem
    img = bpy.data.images.load(os.path.join(PUB, group, name + ".png"))
    img.colorspace_settings.name = "Non-Color"
    return img


def material(name, img, colour, bump, tile, crop, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Cubic"
    tex.extension = "REPEAT"
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (crop / tile, crop / tile, 1)
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tex.outputs["Color"], sep.inputs["Color"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["A"].default_value = lin(colour)
    tone = nt.nodes.new("ShaderNodeCombineColor")
    for c in ("Red", "Green", "Blue"):
        nt.links.new(sep.outputs["Red"], tone.inputs[c])
    nt.links.new(tone.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    rmul = nt.nodes.new("ShaderNodeMath")
    rmul.operation = "MULTIPLY"
    rmul.inputs[1].default_value = 0.85 + rough * 0.15
    nt.links.new(sep.outputs["Green"], rmul.inputs[0])
    nt.links.new(rmul.outputs["Value"], bsdf.inputs["Roughness"])
    bn = nt.nodes.new("ShaderNodeBump")
    bn.inputs["Distance"].default_value = bump
    bn.inputs["Strength"].default_value = 1.0
    nt.links.new(sep.outputs["Blue"], bn.inputs["Height"])
    nt.links.new(bn.outputs["Normal"], bsdf.inputs["Normal"])
    return m


def main():
    out = sys.argv[sys.argv.index("--") + 1]
    which = sys.argv[sys.argv.index("--") + 2]
    items = MODELS if which == "models" else GROUND
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 24
    sc.cycles.use_denoising = False
    try:
        pr = bpy.context.preferences.addons["cycles"].preferences
        pr.compute_device_type = "OPTIX"
        pr.get_devices()
        for d in pr.devices:
            d.use = d.type == "OPTIX"
        sc.cycles.device = "GPU"
    except Exception:
        pass
    cols = len(items)
    sc.render.resolution_x = 320 * cols
    sc.render.resolution_y = 640
    sc.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.68, 0.78, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.55
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.4
    sun.data.angle = math.radians(2)
    sun.rotation_euler = (math.radians(58), 0, math.radians(-125))
    sc.collection.objects.link(sun)
    cam_data = bpy.data.cameras.new("c")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = cols * 1.02
    cam = bpy.data.objects.new("c", cam_data)
    cam.location = (cols / 2, 1.0, 10)
    sc.collection.objects.link(cam)
    sc.camera = cam
    for k, (name, colour, bump, tile, crop, rough) in enumerate(items):
        for row, kind in enumerate(("proc", "baked")):
            bpy.ops.mesh.primitive_plane_add(size=1.0, location=(k + 0.5, 1.5 - row, 0))
            plane = bpy.context.active_object
            plane.scale = (0.98, 0.98, 1)
            img = procedural_image(name) if kind == "proc" else baked_image(name)
            plane.data.materials.append(material(f"{name}-{kind}", img, colour, bump, tile, crop, rough))
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)


main()
