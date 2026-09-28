"""
Build a scripted model and write it out three ways:

  assets/models/<name>.glb        the pipeline's source of truth (uncompressed)
  blender/out/<name>.meshopt.glb  the same, meshopt-compressed, to measure
                                  what serving the GLB itself would cost
  blender/out/<name>.blend        for opening in the Blender GUI

    blender -b --python blender/export.py -- blender/fire_truck.py fire-engine
"""

import os
import runpy
import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :]
script, name = argv[0], argv[1]
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

bpy.ops.wm.read_factory_settings(use_empty=True)
objs = runpy.run_path(os.path.abspath(script))["build"]()

for obj in objs:
    if obj.type == "MESH":
        obj.data.color_attributes.active_color = obj.data.color_attributes["AO"]

bpy.ops.object.select_all(action="DESELECT")
for obj in objs:
    obj.select_set(True)

common = dict(
    export_format="GLB",
    use_selection=True,
    export_apply=True,
    export_yup=True,
    export_normals=True,
    export_materials="EXPORT",
    export_vertex_color="ACTIVE",
    export_all_vertex_colors=False,
)
os.makedirs(os.path.join(root, "assets/models"), exist_ok=True)
os.makedirs(os.path.join(root, "blender/out"), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(root, f"assets/models/{name}.glb"), **common)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(root, f"blender/out/{name}.meshopt.glb"), export_meshopt_compression_enable=True, **common
)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(root, f"blender/out/{name}.blend"))
print("EXPORTED", name)
