import type { Speeds } from './speeds'

type Vector3 = { x: number; y: number; z: number }

/** ROS 2 geometry_msgs/msg/TwistStamped */
export type TwistStamped = {
  header: {
    stamp: { sec: number; nanosec: number }
    frame_id: string
  }
  twist: {
    linear: Vector3
    angular: Vector3
  }
}

/** Wrap speeds in a TwistStamped. `nowMs` is a parameter so the function stays pure and testable. */
export function toTwistStamped(
  { linear, angular }: Speeds,
  nowMs: number = Date.now(),
): TwistStamped {
  return {
    header: {
      stamp: {
        sec: Math.floor(nowMs / 1000),
        nanosec: Math.round((nowMs % 1000) * 1e6),
      },
      frame_id: 'base_link',
    },
    twist: {
      linear: { x: linear, y: 0, z: 0 },
      angular: { x: 0, y: 0, z: angular },
    },
  }
}
