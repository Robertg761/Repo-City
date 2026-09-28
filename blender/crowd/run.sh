#!/bin/sh
# Rebuild the crowd forms end to end: forms.py -> crowd-forms.glb -> crowd.model.ts
set -e
cd "$(dirname "$0")/../.."
blender -b --python blender/export.py -- blender/crowd/forms.py crowd-forms 2>&1 | grep -E "EXPORTED|Error|Traceback|line [0-9]" || true
node scripts/import-model.ts assets/models/crowd-forms.glb components/city/backlog/crowd.model.ts 2>/dev/null
