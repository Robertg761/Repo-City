#!/bin/sh
# Rebuild the construction and incident scenes' near models end to end:
# Blender script -> GLB -> generated module.
#   blender/scenes_near/run.sh                  all of them
#   blender/scenes_near/run.sh crane-near       one (a name from the table below)
set -e
cd "$(dirname "$0")/../.."
# name : script : module (without .model.ts)
TABLE="
crane-near:crane_near:props/craneNear
construction-props-near:props_near:props/constructionPropsNear
site-kit-near:site_near:props/siteKitNear
incident-props-near:incident_props_near:props/incidentPropsNear
incident-kit-near:incident_kit_near:props/incidentKitNear
finished-dressing-near:dressing_near:props/finishedDressingNear
ambulance-near:ambulance_near:vehicles/ambulanceNear
police-car-near:police_car_near:vehicles/policeCarNear
fire-engine-near:fire_engine_near:vehicles/fireEngineNear
tow-truck-near:tow_truck_near:vehicles/towTruckNear
works-truck-near:works_truck_near:vehicles/worksTruckNear
"
for row in $TABLE; do
  name=${row%%:*}
  rest=${row#*:}
  script=${rest%%:*}
  dest=${rest#*:}
  case " ${*:-$name} " in *" $name "*) ;; *) continue ;; esac
  nice -n 19 blender -b -t 2 --python blender/export.py -- "blender/scenes_near/$script.py" "$name" 2>&1 | grep -E "EXPORTED|Error|Traceback|line [0-9]" || true
  node scripts/import-model.ts "assets/models/$name.glb" "components/city/models/$dest.model.ts" 2>/dev/null
done
