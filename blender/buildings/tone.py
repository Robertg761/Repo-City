"""
Keeps a near model's baked occlusion at the lean model's tone, so the swap
from one to the other does not flash lighter or darker.

The near level is baked with far more relief (sills, reveals, courses) than the
lean one, and its roof slates carry a spread of tones, so its average shade
drifts. `match` reads the lean model's own GLB (the source of truth for its
occlusion), takes for every material role -- the material name without its
`.tNN` tone -- the mean occlusion over the surface it covers (area weighted, at
the instance size), and bends the near model's occlusion by a power law per
role until the two means agree. A power law keeps 1.0 at 1.0 and darkens the
creases most; roles the lean model does not have are left alone.
"""

import math
import os
import re

import bpy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _role(name):
    """`wall.plaster.t80` and `wall.plaster.001` are both `wall.plaster`."""
    name = re.sub(r"\.\d{3}$", "", name)
    return re.sub(r"\.t\d+$", "", name)


def _tone(name):
    """The material's tone (`.t80` is 0.8): the importer multiplies it into the
    occlusion, so it is part of the shade the city draws."""
    m = re.search(r"\.t(\d+)$", re.sub(r"\.\d{3}$", "", name))
    return int(m.group(1)) / 100 if m else 1.0


def _polys(obj, scale, attr):
    """Per role: a list of (area, tone, [occlusion at each corner])."""
    sx, sy, sz = scale
    k = (sx, sz, sy)  # the object is stored in Blender's frame: x, depth, up
    me = obj.data
    col = me.color_attributes[attr].data
    verts = me.vertices
    out = {}
    for p in me.polygons:
        vs = [verts[i].co for i in p.vertices]
        area = 0.0
        for a in range(1, len(vs) - 1):
            u = [(vs[a][i] - vs[0][i]) * k[i] for i in range(3)]
            w = [(vs[a + 1][i] - vs[0][i]) * k[i] for i in range(3)]
            c = (u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0])
            area += math.sqrt(c[0] ** 2 + c[1] ** 2 + c[2] ** 2) / 2
        name = me.materials[p.material_index].name
        out.setdefault(_role(name), []).append((area, _tone(name), [col[li].color[0] for li in p.loop_indices]))
    return out


def _mean(polys, gamma=1.0):
    total = weight = 0.0
    for area, tone, values in polys:
        total += area * tone * sum(max(0.0, min(1.0, v)) ** gamma for v in values) / len(values)
        weight += area
    return total / weight if weight else 0.0


def _means(obj, scale, attr):
    return {r: (_mean(p), sum(a for a, _, _ in p)) for r, p in _polys(obj, scale, attr).items()}


def lean_means(glb, node, scale):
    """The mean occlusion per role of `node` in the lean model's GLB."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, "assets/models", glb))
    made = [o for o in bpy.data.objects if o not in before]
    target = next((o for o in made if o.type == "MESH" and o.name.split(".")[0] == node), None)
    if target is None:
        raise RuntimeError(f"tone: no {node} in {glb}: {[o.name for o in made]}")
    attr = target.data.color_attributes.active_color.name if target.data.color_attributes.active_color else target.data.color_attributes[0].name
    means = _means(target, scale, attr)
    meshes = {o.data for o in made if o.type == "MESH"}
    for o in made:
        bpy.data.objects.remove(o, do_unlink=True)
    for m in meshes:
        if m.users == 0:
            for mat in list(m.materials):
                if mat.users <= 1:
                    bpy.data.materials.remove(mat)
            bpy.data.meshes.remove(m)
    return means


def match(obj, glb, node, scale, low=0.4, high=2.5):
    """Bend `obj`'s baked `AO` so the shade of each role (occlusion times tone)
    has the mean the lean model's has."""
    lean = lean_means(glb, node, scale)
    polys = _polys(obj, scale, "AO")
    gamma = {}
    for role, ps in polys.items():
        if role not in lean or not ps:
            continue
        target = lean[role][0]
        lo, hi = low, high
        if _mean(ps, lo) < target:
            gamma[role] = lo
        elif _mean(ps, hi) > target:
            gamma[role] = hi
        else:
            for _ in range(40):
                mid = (lo + hi) / 2
                if _mean(ps, mid) > target:
                    lo = mid
                else:
                    hi = mid
            gamma[role] = (lo + hi) / 2
    data = obj.data.color_attributes["AO"].data
    for p in obj.data.polygons:
        g = gamma.get(_role(obj.data.materials[p.material_index].name))
        if g is None:
            continue
        for li in p.loop_indices:
            v = max(0.0, min(1.0, data[li].color[0])) ** g
            data[li].color = (v, v, v, 1.0)
    after = _means(obj, scale, "AO")
    print("TONE", " ".join(f"{r}:{_mean(polys[r]):.3f}>{after[r][0]:.3f}~{lean[r][0]:.3f}" for r in sorted(polys) if r in lean))
