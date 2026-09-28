#!/bin/sh
# Export, import and preview building archetypes:
#   sh blender/buildings/make.sh <script-stem> <id> [<script-stem> <id> ...]
# e.g.  sh blender/buildings/make.sh house house midrise_mech midrise-mech
cd "$(dirname "$0")/../.." || exit 1
while [ $# -ge 2 ]; do
  stem=$1; id=$2; shift 2
  name="building-$id"
  camel=$(node -e "console.log(process.argv[1].replace(/-(.)/g,(_,c)=>c.toUpperCase()))" "$name")
  blender -b --python blender/export.py -- "blender/buildings/$stem.py" "$name" 2>&1 | grep -E "^TRIS|^META|Error|Traceback|line [0-9]"
  node scripts/import-model.ts "assets/models/$name.glb" "components/city/models/buildings/$camel.model.ts"
done
