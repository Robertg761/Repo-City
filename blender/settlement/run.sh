#!/bin/sh
# Rebuild one settlement model end to end: Blender script -> GLB -> module.
#   sh blender/settlement/run.sh cottage     (cottage.py -> cottage.glb -> cottage.model.ts)
set -e
cd "$(dirname "$0")/../.."
name=$1
camel=$(echo "$name" | sed -E 's/-(.)/\U\1/g')
script=blender/settlement/$(echo "$name" | tr - _).py
# apartment-low is built by apartment.py
[ -f "$script" ] || script=blender/settlement/$(echo "$name" | sed 's/-.*//').py
blender -b --python blender/export.py -- "$script" "$name" 2>&1 | grep -E "^TRIS|EXPORTED|Error|Traceback|line [0-9]" || true
node scripts/import-model.ts "assets/models/$name.glb" "components/city/models/buildings/$camel.model.ts" 2>/dev/null
