import { parseDocument, ElementType } from 'htmlparser2'
import { filter, removeElement, textContent } from 'domutils'

const DECLS = String.raw`\{\s*(?:[a-z-]+\s*:\s*[^;{}]+;?\s*)+\}`
const RULE = String.raw`(?:[.#][a-z][\w-]*|[a-z]+)(?:[ \t]*[>+~]?[ \t]*(?:[.#]?[a-z][\w-]*))*[ \t]*${DECLS}`
const MEDIA = String.raw`@media[^{}]*\{\s*(?:${RULE}\s*)*\}`
const LOOSE_CSS = new RegExp(String.raw`(^|\s)(?:${MEDIA}|(?=[.#@])${RULE})`, 'gi')

function htmlToPlainText(raw: string): string {
  const doc = parseDocument(raw)
  const stripTags = new Set(['script', 'style', 'noscript'])
  let removed = true
  while (removed) {
    removed = false
    const nodes = filter(
      (elem) => elem.type === ElementType.Tag && stripTags.has(elem.name),
      doc.children,
      true,
    )
    for (const node of nodes) {
      removeElement(node)
      removed = true
    }
  }
  return textContent(doc) ?? ''
}

function stripLooseCss(text: string): string {
  let prev = ''
  let next = text
  while (next !== prev) {
    prev = next
    next = next.replace(LOOSE_CSS, '$1')
  }
  return next
}

/**
 * Plain-text product descriptions: strip HTML/script/style and trailing CSS rule blocks.
 */
export function sanitizeProductDescription(raw: string | null | undefined): string {
  if (!raw) return ''
  const text = stripLooseCss(htmlToPlainText(raw))
  return text.replace(/\s{2,}/g, ' ').trim()
}
