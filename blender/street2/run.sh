#!/bin/sh
# Rebuild the street2 set end to end: Blender script -> GLB -> generated module.
#   blender/street2/run.sh
set -e
cd "$(dirname "$0")/../.."
blender -b --python blender/export.py -- blender/street2/street2.py street2 2>&1 | grep -E "EXPORTED|Error|Traceback|line [0-9]" | grep -v HIP || true
node scripts/import-model.ts assets/models/street2.glb components/city/models/props/street2.model.ts 2>&1 | tail -5
