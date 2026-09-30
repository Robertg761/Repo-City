#!/bin/sh
# Bake layers, one Blender process each (memory), then pack them:
#   blender/textures/run.sh <layer|g:ground|models|ground|all>...
cd "$(dirname "$0")/../.." || exit 1
models="plaster brick stone wood roof slate thatch metal glass foliage fabric concrete bark"
ground="g:asphalt g:pavers g:setts g:gravel g:soil g:concrete g:lawn g:turf g:meadow"
for a in "$@"; do
  case "$a" in
    models) list="$models" ;;
    ground) list="$ground" ;;
    all) list="$models $ground" ;;
    *) list="$a" ;;
  esac
  for n in $list; do
    nice -n 19 blender -b -t 2 --python blender/textures/bake.py -- "$n" 2>&1 | grep -E "REPORT|Error|Traceback|File \"|vertices|error|Killed"
  done
done
nice -n 19 python3 blender/textures/pack.py
