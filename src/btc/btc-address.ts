import * as bitcore from "bitcore-lib";

import type {AddressType, IAddressObject, NotePayload} from "../types";
import {bitcoin} from "./btc-ecc";
import {
  generateP2TRCommitNoteInfo,
  generateP2TRNoteInfo,
  generateP2TRNoteInfoV1,
} from "./btc-note";

export function generateP2WPHKAddress(
  pubkey: Buffer,
  network: bitcoin.Network
) {
  const {address, output} = bitcoin.payments.p2wpkh({
    pubkey,
    network,
  });
  const script = output!.toString("hex");
  // with SHA256 hash
  const scriptHash = bitcore.crypto.Hash.sha256(output)
    .reverse()
    .toString("hex");
  const type: AddressType = "P2WPKH";

  return {
    address: address!,
    script,
    scriptHash,
    type,
  };
}

export function generateP2TRNoteAddressV1(
  pubkey: Buffer,
  network: bitcoin.Network
): IAddressObject {
  const {scriptP2TR} = generateP2TRNoteInfoV1(pubkey, network);

  const script = scriptP2TR.output!.toString("hex");
  // with SHA256 hash
  const scriptHash = bitcore.crypto.Hash.sha256(scriptP2TR.output)
    .reverse()
    .toString("hex");
  const type: AddressType = "P2TR-NOTE-V1";

  return {
    address: scriptP2TR.address!,
    script,
    scriptHash,
    type,
  };
}

export function generateP2TRNoteAddress(
  pubkey: Buffer,
  network: bitcoin.Network
): IAddressObject {
  const {scriptP2TR} = generateP2TRNoteInfo(pubkey, network);

  const script = scriptP2TR.output!.toString("hex");
  // with SHA256 hash
  const scriptHash = bitcore.crypto.Hash.sha256(scriptP2TR.output)
    .reverse()
    .toString("hex");
  const type: AddressType = "P2TR-NOTE";

  return {
    address: scriptP2TR.address!,
    script,
    scriptHash,
    type,
  };
}

export function generateP2TRCommitNoteAddress(
  payload: NotePayload,
  pubkey: Buffer,
  network: bitcoin.Network
): IAddressObject {
  const {scriptP2TR} = generateP2TRCommitNoteInfo(payload, pubkey, network);

  const script = scriptP2TR.output!.toString("hex");
  // with SHA256 hash
  const scriptHash = bitcore.crypto.Hash.sha256(scriptP2TR.output)
    .reverse()
    .toString("hex");
  const type: AddressType = "P2TR-COMMIT-NOTE";

  return {
    address: scriptP2TR.address!,
    script,
    scriptHash,
    type,
  };
}
