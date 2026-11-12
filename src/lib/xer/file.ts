import type { XerEncoding, XerParseResult } from './types'

import { parseXer } from './parser'

/**
 * Prefer valid UTF-8; otherwise default to Windows-1252 for legacy exports.
 * An explicit encoding handles legacy code pages such as Arabic Windows-1256,
 * which cannot be reliably distinguished from Windows-1252 from bytes alone.
 * File read failures and explicitly selected decoding failures reject/throw.
 */
export function parseXerBuffer(buffer: ArrayBuffer, encoding?: XerEncoding): XerParseResult {
  let text: string
  let detected: XerEncoding = encoding ?? 'utf-8'
  if (encoding) {
    text = new TextDecoder(encoding, { fatal: true }).decode(buffer)
  } else {
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
    } catch {
      detected = 'windows-1252'
      text = new TextDecoder(detected).decode(buffer)
    }
  }
  return { ...parseXer(text), encoding: detected }
}

export async function readXerFile(file: File, encoding?: XerEncoding): Promise<XerParseResult> {
  return parseXerBuffer(await file.arrayBuffer(), encoding)
}
