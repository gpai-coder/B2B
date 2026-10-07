import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (name.endsWith('.tsx') || name.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('media facade imports', () => {
  it('components do not import legacy product-media or blob-media-url paths', () => {
    const files = walk(path.join('src', 'components'))
    const bad: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      if (text.includes('@/lib/product-media') || text.includes('@/lib/blob-media-url')) {
        bad.push(file)
      }
    }
    expect(bad).toEqual([])
  })
})
