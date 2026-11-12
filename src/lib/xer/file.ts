import { parseXer } from "./parser";
import type { XerEncoding, XerParseResult } from "./types";

/**
 * Prefer valid UTF-8; fall back to the legacy encoding used by the public samples.
 * An explicit encoding handles files whose byte sequences are valid in both.
 * File read failures and explicitly selected UTF-8 decoding failures reject/throw.
 */
export function parseXerBuffer(buffer: ArrayBuffer, encoding?: XerEncoding): XerParseResult {
  let text: string;
  let detected: XerEncoding = encoding ?? "utf-8";
  if (encoding) {
    text = new TextDecoder(encoding, { fatal: true }).decode(buffer);
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      detected = "windows-1252";
      text = new TextDecoder(detected).decode(buffer);
    }
  }
  return { ...parseXer(text), encoding: detected };
}

export async function readXerFile(file: File, encoding?: XerEncoding): Promise<XerParseResult> {
  return parseXerBuffer(await file.arrayBuffer(), encoding);
}
