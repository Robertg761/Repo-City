#!/bin/sh
# Rebuild one prop set end to end: Blender script -> GLB -> generated module.
#   blender/props/run.sh trees        (trees.py -> trees.glb -> trees.model.ts)
set -e
cd "$(dirname "$0")/../.."
name=$1
camel=$(echo "$name" | sed -E 's/-(.)/\U\1/g')
script=blender/props/$(echo "$name" | tr - _).py
blender -b --python blender/export.py -- "$script" "$name" 2>&1 | grep -E "EXPORTED|Error|Traceback|line [0-9]" || true
node scripts/import-model.ts "assets/models/$name.glb" "components/city/models/props/$camel.model.ts" 2>/dev/null
