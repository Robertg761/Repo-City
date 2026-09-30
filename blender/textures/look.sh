#!/bin/sh
# Lit look at baked npy layers: look.sh <out.png> <model|ground> <bump m> <tile m> <hex> <name>...
cd "$(dirname "$0")/../.." || exit 1
out=$1; group=$2; bump=$3; tile=$4; hex=$5; shift 5
files=""
for n in "$@"; do
  python3 -c "import numpy as np,sys;from PIL import Image;Image.fromarray(np.load('blender/out/textures/$group/$n.npy')).save('blender/out/textures/tmp-$n.png')"
  files="$files blender/out/textures/tmp-$n.png"
done
python3 blender/textures/preview.py "$out" "$bump" "$tile" "$hex" $files
