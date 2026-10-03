/** Approximate swatch colors for American Standard finish names. */
const FINISH_COLORS: Record<string, string> = {
  'Polished Chrome': '#d4d4d4',
  'Polished Nickel': '#c8c8c8',
  'Brushed Nickel': '#a8a8a8',
  'Legacy Bronze': '#6b4e2e',
  'Matte Black': '#1a1a1a',
  'Brushed Cool Sunrise': '#e8c4a8',
  'Stainless Steel': '#b5b5b5',
  White: '#f5f5f5',
  Bone: '#f0ead8',
  Linen: '#e8dcc8',
}

export function finishSwatchColor(finish: string): string {
  return FINISH_COLORS[finish] ?? '#cccccc'
}
