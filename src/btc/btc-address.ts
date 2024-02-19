import * as bitcoinjs from "bitcoinjs-lib";
import * as bitcore from "bitcore-lib";

import type { AddressType, IAddressObject } from "../types";
import { generateP2TRNoteInfo } from "./btc-p2tr-note";
import { toXOnly } from "./btc-tweak";


export function generateP2WPHKAddress(
  pubkey: Buffer,
  network: bitcoinjs.Network,
) {
  const { address, output } = bitcoinjs.payments.p2wpkh({
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

export function generateP2TRAddress(
  pubkey: Buffer,
  network: bitcoinjs.Network,
): IAddressObject {
  const xOnlyPubkey = toXOnly(pubkey);

  const { address, output } = bitcoinjs.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    network,
  });

  const script = output!.toString("hex");
  // with SHA256 hash
  const scriptHash = bitcore.crypto.Hash.sha256(output)
    .reverse()
    .toString("hex");
  const type: AddressType = "P2TR";

  return {
    address: address!,
    script,
    scriptHash,
    type,
  };
}

export function generateP2TRNoteAddress(
  pubkey: Buffer,
  network: bitcoinjs.Network,
): IAddressObject {
  const { scriptP2TR } = generateP2TRNoteInfo(pubkey, network);

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
