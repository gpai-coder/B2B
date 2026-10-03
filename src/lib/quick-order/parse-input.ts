import { assertQuickOrderInputSize, QUICK_ORDER_MAX_LINES } from './limits'

export type ParsedQuickOrderLine = {
  lineNumber: number
  sku: string
  quantity: number
}

export class QuickOrderParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QuickOrderParseError'
  }
}

function stripUtf8Bom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/** SKU text is literal (formula prefixes =+-@ stay part of the SKU). */
export function normalizeQuickOrderSku(raw: string): string {
  return raw.trim()
}

function parseQuantity(raw: string, lineNumber: number): number {
  const trimmed = raw.trim()
  if (!/^-?\d+$/.test(trimmed)) {
    throw new QuickOrderParseError(`Line ${lineNumber}: quantity must be a whole number.`)
  }
  const qty = Number(trimmed)
  if (!Number.isInteger(qty) || qty < 1) {
    throw new QuickOrderParseError(`Line ${lineNumber}: quantity must be at least 1.`)
  }
  return qty
}

/** Split a single pasted line on tabs, commas, or whitespace runs. */
function splitSkuQty(line: string): [string, string] | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const tab = trimmed.split('\t')
  if (tab.length >= 2) {
    return [tab[0]!, tab.slice(1).join('\t')]
  }
  const comma = trimmed.split(',')
  if (comma.length >= 2) {
    return [comma[0]!, comma.slice(1).join(',')]
  }
  const parts = trimmed.split(/\s+/)
  if (parts.length >= 2) {
    return [parts[0]!, parts[parts.length - 1]!]
  }
  return null
}

/** Parse RFC4180-ish CSV rows (quoted fields, doubled quotes). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }
    field += ch
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function isHeaderRow(cells: string[]): boolean {
  const a = cells[0]?.trim().toLowerCase() ?? ''
  const b = cells[1]?.trim().toLowerCase() ?? ''
  return (a === 'sku' || a === 'item') && (b === 'qty' || b === 'quantity')
}

export function parseQuickOrderPaste(raw: string): ParsedQuickOrderLine[] {
  assertQuickOrderInputSize(raw)
  const text = normalizeNewlines(stripUtf8Bom(raw))
  const lines = text.split('\n')
  const parsed: ParsedQuickOrderLine[] = []
  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    const pair = splitSkuQty(lines[i]!)
    if (!pair) {
      if (lines[i]!.trim()) {
        throw new QuickOrderParseError(`Line ${lineNumber}: expected "SKU qty".`)
      }
      continue
    }
    parsed.push({
      lineNumber,
      sku: normalizeQuickOrderSku(pair[0]),
      quantity: parseQuantity(pair[1], lineNumber),
    })
  }
  if (parsed.length > QUICK_ORDER_MAX_LINES) {
    throw new QuickOrderParseError(`Maximum ${QUICK_ORDER_MAX_LINES} lines allowed.`)
  }
  return parsed
}

export function parseQuickOrderCsv(raw: string): ParsedQuickOrderLine[] {
  assertQuickOrderInputSize(raw)
  const text = normalizeNewlines(stripUtf8Bom(raw))
  const rows = parseCsvRows(text).filter((r) => r.some((c) => c.trim()))
  if (rows.length === 0) return []
  let start = 0
  if (isHeaderRow(rows[0]!)) start = 1
  const parsed: ParsedQuickOrderLine[] = []
  for (let i = start; i < rows.length; i++) {
    const lineNumber = i + 1
    const cells = rows[i]!
    if (cells.length < 2) {
      throw new QuickOrderParseError(`Line ${lineNumber}: CSV row needs sku and qty columns.`)
    }
    parsed.push({
      lineNumber,
      sku: normalizeQuickOrderSku(cells[0]!),
      quantity: parseQuantity(cells[1]!, lineNumber),
    })
  }
  if (parsed.length > QUICK_ORDER_MAX_LINES) {
    throw new QuickOrderParseError(`Maximum ${QUICK_ORDER_MAX_LINES} lines allowed.`)
  }
  return parsed
}

/** Merge duplicate SKUs by summing quantity (stable order: first line number wins). */
export function mergeQuickOrderLines(lines: ParsedQuickOrderLine[]): ParsedQuickOrderLine[] {
  const map = new Map<string, ParsedQuickOrderLine>()
  for (const line of lines) {
    const key = line.sku.toUpperCase()
    const existing = map.get(key)
    if (existing) {
      existing.quantity += line.quantity
    } else {
      map.set(key, { ...line })
    }
  }
  return [...map.values()]
}
