#!/bin/sh
# Render each fleet body beside its procedural counterpart:
#   sh blender/fleet/compare.sh <tag> [body ...]
# PLYs first: EXPORT_PLY=1 pnpm vitest run blender/fleet/export-procedural
cd "$(dirname "$0")/../.." || exit 1
tag=$1; shift
bodies=${*:-"hatchback sedan taxi van pickup bus"}
i=0
for b in hatchback sedan taxi van pickup bus; do
  case " $bodies " in *" $b "*)
    blender -b --python blender/stage.py -- "blender/out/fleet/$tag-$b" "blender/out/fleet/proc-$b.ply" "blender/fleet/fleet.py@$i" 2>&1 | grep -E "^TRIS|^TRIANGLES|Error|Traceback|line [0-9]" ;;
  esac
  i=$((i + 1))
done
