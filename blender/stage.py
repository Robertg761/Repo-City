"""
A turntable stage for looking at a model: ground, sun, sky and a few cameras
pitched the way the city camera looks at things. Spike tooling.

    blender -b --python blender/stage.py -- <out-prefix> <script-or-ply> [...]

Each source is a .ply (vertex colours) or a .py whose `build()` returns the
objects it made. Sources are laid out left to right along +X.
"""

import math
import os
import runpy
import sys

import bpy
from mathutils import Vector


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def vertex_colour_material(name="VertexColour"):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    attr = nodes.new("ShaderNodeVertexColor")
    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.7
    return mat


def import_ply(path):
    bpy.ops.wm.ply_import(filepath=path)
    obj = bpy.context.selected_objects[0]
    obj.data.materials.append(vertex_colour_material())
    return [obj]


def load(source):
    if source.endswith(".ply"):
        return import_ply(source)
    # `station.py@2` calls the script's `preview(2)`.
    if "@" in source:
        path, arg = source.rsplit("@", 1)
        return runpy.run_path(path)["preview"](int(arg))
    module = runpy.run_path(source)
    return module["build"]()


def bounds(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in objs:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            p = obj.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    return lo, hi


def world_and_light():
    scene = bpy.context.scene
    world = bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.62, 0.72, 0.85, 1)
    bg.inputs["Strength"].default_value = 0.9

    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(4)
    sun.color = (1.0, 0.96, 0.9)
    obj = bpy.data.objects.new("Sun", sun)
    obj.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    scene.collection.objects.link(obj)

    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    ground = bpy.context.active_object
    mat = bpy.data.materials.new("Ground")
    mat.use_nodes = True
    mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.32, 0.33, 0.34, 1)
    mat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
    ground.data.materials.append(mat)


def camera(name, target, distance, yaw, pitch, ortho=None):
    cam = bpy.data.cameras.new(name)
    cam.lens = 50
    cam.clip_end = 500
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    obj = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(obj)
    y, p = math.radians(yaw), math.radians(pitch)
    offset = Vector((math.sin(y) * math.cos(p), -math.cos(y) * math.cos(p), math.sin(p))) * distance
    obj.location = target + offset
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return obj


def render(prefix, views, size=(1100, 700), samples=48):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for kind in ("OPTIX", "CUDA"):
        try:
            prefs.compute_device_type = kind
            prefs.get_devices()
            for d in prefs.devices:
                d.use = True
            scene.cycles.device = "GPU"
            break
        except Exception:
            continue
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Punchy"
    for name, cam in views:
        scene.camera = cam
        scene.render.filepath = f"{prefix}-{name}.png"
        bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    prefix, sources = argv[0], argv[1:]
    clear()
    world_and_light()
    x = 0.0
    groups = []
    for source in sources:
        objs = load(os.path.abspath(source))
        lo, hi = bounds(objs)
        shift = x - lo.x
        for obj in objs:
            if obj.parent is None:
                obj.location.x += shift
        x += (hi.x - lo.x) + 1.2
        groups.append(objs)
    bpy.context.view_layer.update()
    lo, hi = bounds([o for g in groups for o in g])
    for g, source in zip(groups, sources):
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in g if o.type == "MESH")
        print(f"TRIANGLES {os.path.basename(source)} {tris}")
    # Frame the trucks, not the ladders: the ladders run off the top.
    centre = Vector(((lo.x + hi.x) / 2, 0.2, 0.9))
    span = (hi.x - lo.x) + 3.5
    views = [
        ("front34", camera("front34", centre, span * 1.5, -35, 22)),
        ("rear34", camera("rear34", centre, span * 1.5, 145, 28)),
        ("side", camera("side", centre, span * 1.6, -90, 8)),
        ("city", camera("city", centre, span * 3.2, -40, 48)),
    ]
    render(prefix, views)


if __name__ == "__main__":
    main()
