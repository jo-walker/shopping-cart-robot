export type Speeds = { linear: number; angular: number }

/**
 * Joystick vector (-1..1, y positive = pushed up) → robot speeds.
 * In ROS, positive angular.z means turn LEFT, so pushing right (x > 0) must give a negative turn.
 */
export function joystickToSpeeds(
  x: number,
  y: number,
  maxLinear: number,
  maxAngular: number,
): Speeds {
  return {
    linear: y * maxLinear,
    angular: -x * maxAngular,
  }
}
