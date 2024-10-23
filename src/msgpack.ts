import type {EncoderOptions} from "@msgpack/msgpack";
import {decodeMulti, encode} from "@msgpack/msgpack";

/**
 * Check if a string is a valid hexadecimal string
 * @param {string} str - The string to check
 * @returns {boolean} - Returns true if it's a valid hexadecimal string
 */
function isValidHexString(str: string): boolean {
  return (
    typeof str === "string" &&
    str.length % 2 === 0 &&
    /^[0-9a-fA-F]+$/.test(str)
  );
}

/**
 * Convert BigInt to Buffer
 * @param {bigint} value - The BigInt to convert
 * @returns {Buffer} - The Buffer representing the BigInt
 */
function bigintToBuffer(value: bigint): Buffer {
  const hex = value.toString(16); // Convert BigInt to hex string
  const paddedHex = hex.length % 2 === 0 ? hex : "0" + hex; // Ensure even-length hex string
  return Buffer.from(paddedHex, "hex"); // Convert to Buffer
}

/**
 * Convert Buffer to BigInt
 * @param {Buffer} buffer - The Buffer to convert
 * @returns {bigint} - The BigInt representing the Buffer
 */
function bufferToBigint(buffer: Buffer): bigint {
  return BigInt("0x" + buffer.toString("hex"));
}

/**
 * Recursively traverse an object, converting Buffer fields back to hexadecimal strings
 * and converting BigInt marked fields back to BigInt if they were encoded
 * @param {any} obj - The object or array to be decoded
 * @returns {any} - The converted object or array
 */
function convertObjectBufferToHexOrBigInt(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => convertObjectBufferToHexOrBigInt(item));
  }

  if (obj != null && typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Buffer.isBuffer(value)) {
        // If it's a Buffer, treat it as a hexadecimal string
        result[key] = value.toString("hex");
      } else if (value && typeof value === "object" && "_b" in value) {
        // Only convert _b to BigInt if its value is actually a Buffer
        if (Buffer.isBuffer(value._b)) {
          result[key] = bufferToBigint(value._b as Buffer);
        } else {
          // Otherwise, keep the original _b value (it's not a BigInt marker)
          result[key] = value;
        }
      } else {
        // Recursively handle nested objects or arrays
        result[key] = convertObjectBufferToHexOrBigInt(value);
      }
    }
    // If this object itself is a BigInt encoding object with _b, and _b is the only field
    const keys = Object.keys(result);
    if (
      keys.length === 1 &&
      keys[0] === "_b" &&
      typeof result._b === "string" &&
      isValidHexString(result._b)
    ) {
      return bufferToBigint(Buffer.from(result._b, "hex"));
    }
    return result;
  }

  // Handle primitive types, return directly
  return obj;
}

/**
 * Check if a BigInt is within the range of Int64
 * @param {bigint} value - The BigInt value to check
 * @returns {boolean} - Returns true if the value is within Int64 range
 */
function isWithinInt64Range(value: bigint): boolean {
  const INT64_MIN = BigInt("-9223372036854775808");
  const INT64_MAX = BigInt("9223372036854775807");
  return value >= INT64_MIN && value <= INT64_MAX;
}

/**
 * Encoding function: Automatically convert hexadecimal strings and BigInt values larger than Int64 to Buffer
 * @param {any} obj - The object to be encoded
 * @param {EncoderOptions} options - Encoding options, supports useBigInt64
 * @returns {Buffer} - The encoded binary data
 */
export function encodeWithHexConversion(
  obj: any,
  options: EncoderOptions = {useBigInt64: true, sortKeys: true}
): Buffer {
  const convertedObj = convertObjectHexToBufferAndEncodeBigInt(obj);
  return Buffer.from(encode(convertedObj, options));
}

/**
 * Recursively traverse an object, converting all hexadecimal string fields to Buffer
 * and converting BigInt values larger than Int64 to Buffer with a special marker
 * @param {any} obj - The object or array to be encoded
 * @returns {any} - The converted object or array
 */
function convertObjectHexToBufferAndEncodeBigInt(obj: any): any {
  if (typeof obj === "bigint") {
    if (isWithinInt64Range(obj)) {
      // If BigInt is within Int64 range, return it directly (handled by MessagePack natively)
      return obj;
    } else {
      // Convert BigInt to Buffer and add a shorter marker (_b) for values beyond Int64
      return {_b: bigintToBuffer(obj)};
    }
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => convertObjectHexToBufferAndEncodeBigInt(item));
  }

  if (obj != null && typeof obj === "object") {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string" && isValidHexString(value)) {
        // If it's a valid hexadecimal string, convert to Buffer
        result[key] = Buffer.from(value, "hex");
      } else {
        // Recursively handle nested objects, arrays, and convert BigInt
        result[key] = convertObjectHexToBufferAndEncodeBigInt(value);
      }
    }
    return result;
  }

  // Handle other primitive types, return directly
  return obj;
}

/**
 * Decoding function: Handle multiple consecutive MessagePack packages when decoding, combine them into one object to return
 * @param {Buffer | Uint8Array} buffer - The encoded binary data
 * @returns {any} - The decoded object
 */
export function decodeWithHexConversion(buffer: Buffer | Uint8Array): any {
  const results: any[] = []; // Explicitly declare the type of results as any[]

  // Iterate through the Generator, collect all decoded results
  for (const result of decodeMulti(buffer, {useBigInt64: true})) {
    results.push(convertObjectBufferToHexOrBigInt(result));
  }
  if (results.length > 0) {
    if (typeof results[0] !== "object") {
      return results.length === 1 ? results[0] : results;
    } else {
      return Object.assign({}, ...results);
    }
  } else {
    return null;
  }
}

export {
  encodeWithHexConversion as msgpackEncode,
  decodeWithHexConversion as msgpackDecode,
};
