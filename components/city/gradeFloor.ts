import { Effect } from "postprocessing";

/**
 * A floor at zero for the grade's chain. `HueSaturation` only clamps from
 * above (`min(color, 1.0)`), so pushing saturation up drives the weakest
 * channel of every saturated colour (a green field's red and blue, a red
 * roof's green) below zero. The effect pass then converts to sRGB and back
 * around `BrightnessContrast`, and that conversion takes
 * `pow(negative, 2.4)`, which is NaN on desktop OpenGL (NVIDIA through ANGLE's
 * GL backend, so Firefox and Chrome on Linux): every pixel of those colours
 * came out black -- fields, hedges, red and green houses -- while Vulkan's
 * `pow` happened to swallow it. A channel below zero has no meaning in the
 * picture anyway, so it is cut off right after the saturation, where the
 * values are still linear.
 */
export const GRADE_FLOOR_FRAGMENT = /* glsl */ `
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(max(inputColor.rgb, vec3(0.0)), inputColor.a);
}
`;

export class GradeFloorEffect extends Effect {
  constructor() {
    super("GradeFloorEffect", GRADE_FLOOR_FRAGMENT);
  }
}
