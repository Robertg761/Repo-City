#!/bin/sh
# Render each fleet car with its procedural wheels and lamps beside the
# modelled ones:  sh blender/vehicles2/compare.sh <tag> [n ...]
# n: 0 hatchback 1 sedan 2 taxi 3 van 4 pickup 5 bus 6 tractor 7 wheels.
# PLYs first: EXPORT_PLY=1 pnpm vitest run blender/vehicles2/export-procedural
cd "$(dirname "$0")/../.." || exit 1
tag=$1; shift
names="hatchback sedan taxi van pickup bus tractor wheels"
for n in ${*:-0 1 2 3 4 5 6 7}; do
  name=$(echo $names | cut -d' ' -f$((n + 1)))
  blender -b --python blender/stage.py -- "blender/out/vehicles2/$tag-$name" "blender/out/vehicles2/proc-$name.ply" "blender/vehicles2/parts.py@$n" 2>&1 | grep -E "^TRIS|^TRIANGLES|Error|Traceback|line [0-9]"
done
