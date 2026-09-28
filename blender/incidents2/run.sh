#!/bin/sh
# Rebuild the construction and incident kits end to end: Blender script ->
# GLB -> generated module.
#   blender/incidents2/run.sh            both kits
#   blender/incidents2/run.sh site-kit   one
set -e
cd "$(dirname "$0")/../.."
for name in ${1:-site-kit incident-kit}; do
  camel=$(echo "$name" | sed -E 's/-(.)/\U\1/g')
  script=blender/incidents2/$(echo "$name" | tr - _).py
  blender -b --python blender/export.py -- "$script" "$name" 2>&1 | grep -E "EXPORTED|Error|Traceback|line [0-9]" || true
  node scripts/import-model.ts "assets/models/$name.glb" "components/city/models/props/$camel.model.ts" 2>/dev/null
done
