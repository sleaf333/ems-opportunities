// Renders plain text where lines starting with "- " become bullet points.
// Text is never interpreted as HTML.
export default function Description({ text }: { text: string }) {
  const blocks: { kind: 'p' | 'ul'; lines: string[] }[] = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = /^[-*•]\s+/.test(line)
    const content = line.replace(/^[-*•]\s+/, '')
    const last = blocks[blocks.length - 1]
    if (bullet && last?.kind === 'ul') last.lines.push(content)
    else blocks.push({ kind: bullet ? 'ul' : 'p', lines: [content] })
  }
  return (
    <div className="description">
      {blocks.map((block, i) =>
        block.kind === 'ul' ? (
          <ul key={i}>
            {block.lines.map((line, j) => (
              <li key={j}>{line}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{block.lines[0]}</p>
        ),
      )}
    </div>
  )
}
