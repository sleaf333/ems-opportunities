// The EMS wordmark with its five-dot mark, drawn in code (no image file).
export default function BrandLogo({ large }: { large?: boolean }) {
  return (
    <span className={`logo ${large ? 'logo-large' : ''}`}>
      <span className="logo-ems">EMS</span>
      <span className="logo-dots" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="logo-sub">Opportunities</span>
    </span>
  )
}
