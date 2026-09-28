#!/bin/sh
# Rebuild the fleet's wheel and lamps end to end:
#   parts.py -> vehicle-parts.glb -> vehicleParts.model.ts
# and the queue's signboard: overflow.py -> overflow-sign.glb -> overflowSign.model.ts
set -e
cd "$(dirname "$0")/../.."
blender -b --python blender/export.py -- blender/vehicles2/parts.py vehicle-parts 2>&1 | grep -E "TRIS|EXPORTED|Error|Traceback|line [0-9]" || true
node scripts/import-model.ts assets/models/vehicle-parts.glb components/city/models/vehicles/vehicleParts.model.ts 2>/dev/null
if [ -f blender/vehicles2/overflow.py ]; then
  blender -b --python blender/export.py -- blender/vehicles2/overflow.py overflow-sign 2>&1 | grep -E "TRIS|EXPORTED|Error|Traceback|line [0-9]" || true
  node scripts/import-model.ts assets/models/overflow-sign.glb components/city/models/vehicles/overflowSign.model.ts 2>/dev/null
fi
