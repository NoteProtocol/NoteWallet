import { bin2num, bsv, getValidatedHexString, num2bin } from "scryptlib";

import { MAX_DATA_SEGMENTS, MAX_SCRIPT_ELEMENT_SIZE } from "./constants";

export function splitBufferIntoSegments(
  buffer: Buffer,
  segmentSize = MAX_SCRIPT_ELEMENT_SIZE,
  maxSegments = MAX_DATA_SEGMENTS,
): Buffer[] {
  if (buffer.length / segmentSize > maxSegments) {
    throw new Error(
      `Buffer size exceeds the maximum allowed number of segments (${maxSegments}).`,
    );
  }

  const segments: Buffer[] = [];
  let i = 0;
  while (i < buffer.length) {
    const start = i;
    const end = Math.min((i += segmentSize), buffer.length);
    const segment = buffer.subarray(start, end);
    segments.push(segment);
  }

  return segments;
}

export function concatenateBuffers(buffers: Buffer[]): Buffer {
  return Buffer.concat(buffers);
}

export function bufferToScriptHex(buffer: Buffer | ""): string {
  //we can't use bitcore Script beacuse it have a empty bug
  return bsv.Script.fromASM(buffer.toString("hex")).toHex();
}

export function interpolate(template, params) {
  const names = Object.keys(params);
  const vals = Object.values(params);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(...names, `return \`${template}\`;`)(...vals);
}

export function assert(arg0: boolean, arg1?: string) {
  if (!arg0) {
    throw new Error(arg1 ?? `An assert was raised`);
  }
}

/**
 * bigint can be converted to string with int2ByteString.
 * If `size` is not passed, the number `n` is converted to a ByteString with as few bytes as possible.
 * Otherwise, converts the number `n` to a ByteString of the specified size, including the sign bit. Fails if the number cannot be accommodated.
 * @param n - a number being converts
 * @param size - the size of the ByteString
 * @category Bytes Operations
 */
export function int2ByteString(n: bigint, size?: number) {
  if (size === undefined) {
    const num = new bsv.crypto.BN(n);
    return num.toSM({ endian: "little" }).toString("hex");
  }
  return num2bin(n, Number(size));
}
/**
 * ByteString can be converted to bigint using function byteString2Int.
 * @category Bytes Operations
 */
export function byteString2Int(a: string) {
  return BigInt(bin2num(a));
}

export function stringToBytes(str: string) {
  const encoder = new TextEncoder();
  const uint8array = encoder.encode(str);
  return getValidatedHexString(Buffer.from(uint8array).toString("hex"));
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(() => resolve(), ms));
