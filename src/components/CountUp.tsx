import { useCountUp } from '../lib/motion'

// A number that counts up on first load (under a second), then stays put.
export default function CountUp({ value }: { value: number }) {
  return <span className="count-up">{useCountUp(value)}</span>
}
