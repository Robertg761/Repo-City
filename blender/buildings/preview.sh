#!/bin/sh
# Write the PLYs and render pairs: sh blender/buildings/preview.sh <tag> <id> [<id> ...]
cd "$(dirname "$0")/../.." || exit 1
tag=$1; shift
EXPORT_PLY=1 pnpm vitest run blender/buildings/export-procedural --reporter=verbose 2>&1 | grep -E "procedural [0-9]|Error|error" 
for id in "$@"; do
  blender -b --python blender/buildings/bstage.py -- pair "blender/out/buildings/$tag-$id" "blender/out/buildings/proc-$id.ply" "blender/out/buildings/bl-$id.ply" 2>&1 | grep -E "Error|Traceback" | grep -v HIP
done
