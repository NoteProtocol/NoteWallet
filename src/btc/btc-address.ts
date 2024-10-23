import type {AddressType, IAddressObject} from "../types";
import {calcScriptHash} from "../address";
import {buildNoteScript} from "../note";
import {bitcoin} from "./btc-ecc";
import {
  generateP2TRCommitDataInfo,
  generateP2TRNoteInfo,
  generateP2TRNoteInfoV1,
} from "./btc-note";

// Pay to Public Key Hash address
export function generateP2PHKAddress(pubkey: Buffer, network: bitcoin.Network) {
  const {address, output} = bitcoin.payments.p2pkh({
    pubkey,
    network,
  });
  const script = output!.toString("hex");
  // with SHA256 hash
  const scriptHash = calcScriptHash(output!);
  const type: AddressType = "P2PKH";

  return {
    address: address!,
    script,
    scriptHash,
    type,
  };
}

// Pay to Script Hash, where the redeem script is Pay to Public Key Hash
export function generateP2SHAddress(
  pubkey: Buffer,
  network: bitcoin.Network
): IAddressObject {
  const {address, output} = bitcoin.payments.p2sh({
    redeem: bitcoin.payments.p2pkh({pubkey, network}),
  });
  const script = output!.toString("hex");
  // with SHA256 hash
  const scriptHash = calcScriptHash(output!);

  const type: AddressType = "P2SH";

  return {
    address: address!,
    script,
    scriptHash,
    type,
  };
}

// Pay to Witness Script Hash, where the redeem script is NOTE protocol script
export function generateP2SHNoteAddress(
  pubkey: Buffer,
  network: bitcoin.Network
): IAddressObject {
  // Create redeem script
  const redeemScript = bitcoin.script.fromASM(buildNoteScript(pubkey));

  // Create P2WSH-NOTE address
  const {output, address} = bitcoin.payments.p2sh({
    redeem: {output: redeemScript, network},
    network,
  });

  const script = output!.toString("hex");
  // with SHA256 hash
  const scriptHash = calcScriptHash(output!);

  const type: AddressType = "P2SH-NOTE";

  return {
    address: address!,
    script,
    scriptHash,
    type,
  };
}

// Pay to Witness Public Key Hash address
export function generateP2WPHKAddress(
  pubkey: Buffer,
  network: bitcoin.Network
) {
  // Get P2WPKH format address and output script
  const {address, output} = bitcoin.payments.p2wpkh({
    pubkey,
    network,
  });
  const script = output!.toString("hex");
  // with SHA256 hash
  const scriptHash = calcScriptHash(output!);

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
  // Output script address
  const {scriptP2TR} = generateP2TRNoteInfoV1(pubkey, network);

  const script = scriptP2TR.output!.toString("hex");
  // with SHA256 hash
  const scriptHash = calcScriptHash(scriptP2TR.output!);

  const type: AddressType = "P2TR-NOTE-V1";

  return {
    address: scriptP2TR.address!,
    script,
    scriptHash,
    type,
  };
}

// Pay to Taproot Witness Script address, where the redeem script is NOTE protocol address
export function generateP2TRNoteAddress(
  pubkey: Buffer,
  network: bitcoin.Network
): IAddressObject {
  // Output script address
  const {scriptP2TR} = generateP2TRNoteInfo(pubkey, network);

  const script = scriptP2TR.output!.toString("hex");
  // with SHA256 hash
  const scriptHash = calcScriptHash(scriptP2TR.output!);

  const type: AddressType = "P2TR-NOTE";

  return {
    address: scriptP2TR.address!,
    script,
    scriptHash,
    type,
  };
}

// Pay to Taproot Witness Script address with full Payload embedding, where the redeem script contains the entire NOTE Payload
export function generateP2TRCommitDataAddress(
  msgpackEncodedData: Buffer,
  pubkey: Buffer,
  network: bitcoin.Network
): IAddressObject {
  // Output script address
  const {scriptP2TR} = generateP2TRCommitDataInfo(
    msgpackEncodedData,
    pubkey,
    network
  );

  const script = scriptP2TR.output!.toString("hex");
  // with SHA256 hash
  const scriptHash = calcScriptHash(scriptP2TR.output!);

  const type: AddressType = "P2TR-COMMIT-DATA";

  return {
    address: scriptP2TR.address!,
    script,
    scriptHash,
    type,
  };
}
