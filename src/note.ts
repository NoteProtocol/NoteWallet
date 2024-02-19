import * as bitcore from "bitcore-lib";

import { NOTE_PROTOCOL_ENVELOPE_ID } from "./constants";
import { assert } from "./utils";

export function buildNoteScript(pubkey: Buffer) {
  //4e4f5445 -> NOTE
  const scriptASM = `${Buffer.from(NOTE_PROTOCOL_ENVELOPE_ID, "utf8").toString(
    "hex",
  )} OP_2DROP OP_2DROP OP_2DROP ${pubkey.toString("hex")} OP_CHECKSIG`;
  return scriptASM;
}

export function buildNoteMulitiSigScript(pubkeys: Buffer[], n: number) {
  assert(n <= pubkeys.length, "n should be less than pubkeys.length");
  assert(pubkeys.length > 0, "pubkeys should not be empty");
  //4e4f5445 -> NOTE
  let scriptASM = `${Buffer.from(NOTE_PROTOCOL_ENVELOPE_ID, "utf8").toString(
    "hex",
  )} OP_2DROP OP_2DROP OP_2DROP ${pubkeys[0]!.toString("hex")} OP_CHECKSIG`;
  for (let i = 1; i < pubkeys.length; i++) {
    scriptASM += ` ${pubkeys[i]!.toString("hex")} OP_CHECKSIGADD`;
  }
  scriptASM += ` ${n} OP_EQUAL`;
  return scriptASM;
}

export function sha256ripemd160(content: Buffer) {
  return bitcore.crypto.Hash.sha256ripemd160(content);
}

export function hash256(content: Buffer) {
  return bitcore.crypto.Hash.sha256(content);
}

export function signContent(content: Buffer, privateKey: string) {
  const msg = new bitcore.Message(content.toString("hex"));
  const signature = msg.sign(new bitcore.PrivateKey(privateKey)); 
  return Buffer.from(signature, "base64").toString("hex");
}

export function checkContentSig(
  content: Buffer,
  signature: string,
  publicKey: string,
) {
  const msg = new bitcore.Message(content.toString("hex"));
  const isValid = msg._verify(
    new bitcore.PublicKey(publicKey),
    bitcore.crypto.Signature.fromCompact(Buffer.from(signature, "hex")),
  );
  if (isValid) {
    return true;
  }
  const hash = bitcore.crypto.Hash.sha256(content);
  const sig = bitcore.crypto.Signature.fromCompact(
    Buffer.from(signature, "hex"),
  );
  return bitcore.crypto.ECDSA.verify(
    hash,
    sig,
    new bitcore.PublicKey(publicKey),
  );
}
