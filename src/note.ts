import * as bitcore from "bitcore-lib";

import type {NotePayload} from "./types";
import {
  MAX_DATA_SEGMENTS_LIMIT,
  MAX_SCRIPT_ELEMENT_SIZE,
  MAX_SCRIPT_FULL_SIZE,
  MAX_STACK_FULL_SIZE,
  MAX_STANDARD_STACK_ITEM_SIZE,
  NOTE_PROTOCOL_ENVELOPE_ID,
} from "./constants";
import {msgpackEncode} from "./msgpack";
import {splitBufferIntoSegments} from "./utils";

// Construct NOTE script without embedded data
export function buildNoteScript(xOnlyPubkey: Buffer) {
  return buildNoteScriptV2(xOnlyPubkey, true);
}

// Construct script that only contains the data section
export function buildDataScript(
  msgpackEncodedData: Buffer,
  xOnlyPubkey: Buffer
) {
  return buildNoteScriptV2(xOnlyPubkey, false, msgpackEncodedData);
}

// Construct NOTE locking script with data section and Payload unlock script
export function buildCommitNoteScript(
  msgpackEncodedData: Buffer,
  xOnlyPubkey: Buffer
) {
  return buildNoteScriptV2(xOnlyPubkey, true, msgpackEncodedData);
}

// Construct locking script with embedded data placed after the NOTE identifier, split into 520-byte segments, data is msgpack encoded
export function buildNoteScriptV2(
  xOnlyPubkey: Buffer,
  hasPayload: boolean = true,
  msgpackEncodedData?: Buffer
): string {
  // Complete data format
  // data0,data1,data2,data3,data4 NOTE OP_FALSE OP_IF data<520bytes> ... OP_ENDIF OP_2DROP OP_2DROP OP_2DROP xOnlyPubkey OP_CHECKSIG

  // Protocol tag 4e4f5445 -> NOTE
  let scriptASM = `${Buffer.from(NOTE_PROTOCOL_ENVELOPE_ID, "utf8").toString(
    "hex"
  )}`;
  // If there's a data section, split it into 520-byte segments
  if (msgpackEncodedData) {
    scriptASM += ` OP_FALSE OP_IF`;
    // Split data into 520-byte segments, up to 100K in total
    const dataList = splitBufferIntoSegments(
      msgpackEncodedData,
      MAX_SCRIPT_ELEMENT_SIZE,
      MAX_DATA_SEGMENTS_LIMIT
    );
    for (let i = 0; i < dataList.length; i++) {
      scriptASM += ` ${dataList[i]!.toString("hex")}`;
    }
    scriptASM += ` OP_ENDIF`;
  }
  // If there's a payload, add 2DROP to remove the data section of the unlock script
  if (hasPayload) {
    scriptASM += ` OP_2DROP OP_2DROP OP_2DROP`;
  } else {
    // If there's no payload, remove the NOTE identifier
    scriptASM += ` OP_DROP`;
  }
  scriptASM += ` ${xOnlyPubkey.toString("hex")} OP_CHECKSIG`;
  return scriptASM;
}

// Test code: Construct unlock script with embedded data placed after the NOTE identifier, split into 520-byte segments, data is msgpack encoded
export function buildNoteUnlockScriptV2(
  signature: string,
  notePayload: NotePayload
): string {
  // Complete data format
  // data0,data1,data2,data3,data4 NOTE OP_FALSE OP_IF data<520bytes> ... OP_ENDIF OP_2DROP OP_2DROP OP_2DROP xOnlyPubkey OP_CHECKSIG

  const scriptSolution = [
    Buffer.from(signature, "hex"),
    Buffer.from(notePayload.data0, "hex"),
    Buffer.from(notePayload.data1, "hex"),
    Buffer.from(notePayload.data2, "hex"),
    Buffer.from(notePayload.data3, "hex"),
    Buffer.from(notePayload.data4, "hex"),
  ];
  const script = new bitcore.Script();
  for (let i = 0; i < scriptSolution.length; i++) {
    script.add(scriptSolution[i]!);
  }
  return script.toASM();
}

// Used to calculate public key hash
export function sha256ripemd160(content: Buffer) {
  return bitcore.crypto.Hash.sha256ripemd160(content);
}

// Used to calculate sha256
export function hash256(content: Buffer) {
  return bitcore.crypto.Hash.sha256(content);
}

// Sign the sha256 of encrypted data using the private key, return hash256 and sig signature
export function signContent(content: Buffer, privateKey: string) {
  const msg = new bitcore.Message(content.toString("hex"));
  // Sign the message using the private key
  const signature = msg.sign(new bitcore.PrivateKey(privateKey)); // Signature result is in base64
  // Return compressed signature in hex format
  return Buffer.from(signature, "base64").toString("hex");
}

// Check signature to prevent data forgery, return true or false
export function checkContentSig(
  content: Buffer,
  signature: string,
  publicKey: string
) {
  // NOTE v2.0 signature check. A compressed signature
  const msg = new bitcore.Message(content.toString("hex"));
  // Get output signature
  const isValid = msg._verify(
    new bitcore.PublicKey(publicKey),
    bitcore.crypto.Signature.fromCompact(Buffer.from(signature, "hex"))
  );
  if (isValid) {
    return true;
  }
  // NOTE v1.0 signature check. An uncompressed signature
  const hash = hash256(content);
  const sig = bitcore.crypto.Signature.fromCompact(
    Buffer.from(signature, "hex")
  );
  // Verify signature using root address public key to ensure transaction is not forged
  return bitcore.crypto.ECDSA.verify(
    hash,
    sig,
    new bitcore.PublicKey(publicKey)
  );
}

// Build note payload, if singleMode=true, put all data in data0
export function buildNotePayload(data: string | object, singleMode = false) {
  // New v2 uses sorted msgpack encoding method, compressing results while ensuring key order is irrelevant
  const encodedData = msgpackEncode(data);
  // Construct note structure
  const payload: NotePayload = {
    data0: "",
    data1: "",
    data2: "",
    data3: "",
    data4: "",
  };
  const buffer = Buffer.from(encodedData);

  if (singleMode) {
    payload.data0 = buffer.toString("hex");
    payload.data1 = "";
    payload.data2 = "";
    payload.data3 = "";
    payload.data4 = "";
  } else {
    let dataList;
    if (buffer.length <= MAX_STACK_FULL_SIZE) {
      // Stack length limit is 80 bytes x 5 = 400 bytes
      dataList = splitBufferIntoSegments(buffer, MAX_STANDARD_STACK_ITEM_SIZE);
    } else if (buffer.length <= MAX_SCRIPT_FULL_SIZE) {
      // Script length limit is 520 bytes x 5 = 2600 bytes, only used in special cases when all data is placed in the redemption script
      dataList = splitBufferIntoSegments(buffer, MAX_SCRIPT_ELEMENT_SIZE);
    }
    payload.data0 =
      dataList[0] !== undefined ? dataList[0].toString("hex") : "";
    payload.data1 =
      dataList[1] !== undefined ? dataList[1].toString("hex") : "";
    payload.data2 =
      dataList[2] !== undefined ? dataList[2].toString("hex") : "";
    payload.data3 =
      dataList[3] !== undefined ? dataList[3].toString("hex") : "";
    payload.data4 =
      dataList[4] !== undefined ? dataList[4].toString("hex") : "";
  }
  return payload;
}
