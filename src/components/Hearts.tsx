import { MAX_HEARTS, type LinkHealth } from '../useLinkHealth'

const LABEL: Record<LinkHealth['mode'], string> = {
  robot: 'ROBOT',
  wait: '?',
  phone: 'PHONE',
  missing: 'NO TOPIC',
  offline: '',
}

/** Wi-Fi hearts: how healthy the link looks. ROBOT = measured from the robot's heartbeat. */
export default function Hearts({ health }: { health: LinkHealth }) {
  const { hearts, mode } = health
  const laggy = mode !== 'offline' && mode !== 'wait' && hearts <= 1
  return (
    <span id="hearts" className="hearts" data-hearts={hearts} data-mode={mode}>
      {Array.from({ length: MAX_HEARTS }, (_, i) => (
        <i key={i} className={`nes-icon is-small heart ${i < hearts ? '' : 'is-empty'}`} />
      ))}
      <span className={`hearts-label ${laggy ? 'blink' : ''}`}>{laggy ? 'LAGGY!' : LABEL[mode]}</span>
    </span>
  )
}
