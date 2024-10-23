import {buildDataScript, buildNoteScript} from "../note";
import {bitcoin, Taptree, toXOnly} from "./btc-ecc";

// Generate a regular NOTE locking script
export function generateP2TRNoteInfo(pubkey: Buffer, network: bitcoin.Network) {
  const xOnlyPubkey = toXOnly(pubkey);

  // Construct a regular NOTE locking script
  const note_script = bitcoin.script.fromASM(buildNoteScript(xOnlyPubkey));

  const p2pk_script_asm = `${xOnlyPubkey.toString("hex")} OP_CHECKSIG`;
  const p2pk_script = bitcoin.script.fromASM(p2pk_script_asm);

  const scriptTree: Taptree = [
    {
      output: note_script,
    },
    {
      output: p2pk_script,
    },
  ];
  const script_p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    network,
  });

  const note_redeem = {
    output: note_script,
    redeemVersion: 192,
  };
  const p2pk_redeem = {
    output: p2pk_script,
    redeemVersion: 192,
  };

  const p2pk_p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    redeem: p2pk_redeem,
    network,
  });

  const note_p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    redeem: note_redeem,
    network,
  });

  return {
    scriptP2TR: script_p2tr,
    noteP2TR: note_p2tr,
    p2pkP2TR: p2pk_p2tr,
    noteRedeem: note_redeem,
    p2pkRedeem: p2pk_redeem,
  };
}

// Generate a Taproot transaction that packs all data into the redemption script
export function generateP2TRCommitDataInfo(
  msgpackEncodedData: Buffer,
  pubkey: Buffer,
  network: bitcoin.Network
) {
  const xOnlyPubkey = toXOnly(pubkey);

  const note_script = bitcoin.script.fromASM(
    buildDataScript(msgpackEncodedData, xOnlyPubkey)
  );

  const p2pk_script_asm = `${xOnlyPubkey.toString("hex")} OP_CHECKSIG`;
  const p2pk_script = bitcoin.script.fromASM(p2pk_script_asm);

  const scriptTree: Taptree = [
    {
      output: note_script,
    },
    {
      output: p2pk_script,
    },
  ];
  const script_p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    network,
  });

  const note_redeem = {
    output: note_script,
    redeemVersion: 192,
  };
  const p2pk_redeem = {
    output: p2pk_script,
    redeemVersion: 192,
  };

  const p2pk_p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    redeem: p2pk_redeem,
    network,
  });

  const note_p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    redeem: note_redeem,
    network,
  });

  return {
    scriptP2TR: script_p2tr,
    noteP2TR: note_p2tr,
    p2pkP2TR: p2pk_p2tr,
    noteRedeem: note_redeem,
    p2pkRedeem: p2pk_redeem,
  };
}

export function generateP2TRNoteInfoV1(
  pubkey: Buffer,
  network: bitcoin.Network
) {
  const xOnlyPubkey = toXOnly(pubkey);

  const note_script = bitcoin.script.fromASM(buildNoteScript(xOnlyPubkey));

  const p2pk_script_asm = `${pubkey.toString("hex")} OP_CHECKSIG`;
  const p2pk_script = bitcoin.script.fromASM(p2pk_script_asm);

  const scriptTree: Taptree = [
    {
      output: note_script,
    },
    {
      output: p2pk_script,
    },
  ];
  const script_p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    network,
  });

  const note_redeem = {
    output: note_script,
    redeemVersion: 192,
  };
  const p2pk_redeem = {
    output: p2pk_script,
    redeemVersion: 192,
  };

  const p2pk_p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    redeem: p2pk_redeem,
    network,
  });

  const note_p2tr = bitcoin.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    redeem: note_redeem,
    network,
  });

  return {
    scriptP2TR: script_p2tr,
    noteP2TR: note_p2tr,
    p2pkP2TR: p2pk_p2tr,
    noteRedeem: note_redeem,
    p2pkRedeem: p2pk_redeem,
  };
}
