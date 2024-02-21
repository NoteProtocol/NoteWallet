import type { Taptree } from "bitcoinjs-lib/src/types";
import type { ECPairInterface } from "ecpair";
import * as bitcoinjs from "bitcoinjs-lib";

import type { ISendToAddress, IUtxo, NotePayload } from "../types";
import { MAX_SEQUENCE } from "../constants";
import { buildNoteScript } from "../note";
import { assert } from "../utils";
import { schnorrValidator, toXOnly, validator } from "./btc-tweak";
import { witnessStackToScriptWitness } from "./witness_stack_to_script_witness";

export function generateP2TRNoteInfo(
  pubkey: Buffer,
  network: bitcoinjs.Network,
) {
  const xOnlyPubkey = toXOnly(pubkey);

  //note
  const note_script = bitcoinjs.script.fromASM(buildNoteScript(xOnlyPubkey));

  //burn
  const p2pk_script_asm = `${pubkey.toString("hex")} OP_CHECKSIG`;
  const p2pk_script = bitcoinjs.script.fromASM(p2pk_script_asm);

  const scriptTree: Taptree = [
    {
      output: note_script,
    },
    {
      output: p2pk_script,
    },
  ];
  const script_p2tr = bitcoinjs.payments.p2tr({
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

  const p2pk_p2tr = bitcoinjs.payments.p2tr({
    internalPubkey: xOnlyPubkey,
    scriptTree,
    redeem: p2pk_redeem,
    network,
  });

  const note_p2tr = bitcoinjs.payments.p2tr({
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
export function createP2TRNotePsbt(
  privateKey: ECPairInterface,
  notePayload: NotePayload,
  noteUtxo: IUtxo,
  payUtxos: IUtxo[],
  to: ISendToAddress,
  change: string, 
  network: bitcoinjs.Network,
  feeRate: number,
  fee = 1000, 
) {
  assert(noteUtxo.type === "P2TR-NOTE");

  const pubkey = privateKey.publicKey;
  const xOnlyPubkey = toXOnly(pubkey);

  const tweakedPrivateKey = privateKey.tweak(
    bitcoinjs.crypto.taggedHash("TapTweak", xOnlyPubkey),
  );

  // const tweakedPublicKey = tweakedPrivateKey.publicKey;

  const p2note = generateP2TRNoteInfo(pubkey, network);

  const tapLeafScript = {
    leafVersion: p2note.noteRedeem.redeemVersion,
    script: p2note.noteRedeem.output,
    controlBlock:
      p2note.noteP2TR.witness![p2note.noteP2TR.witness!.length - 1]!,
  };

  const psbt = new bitcoinjs.Psbt({ network });
  //     psbt.setVersion(2); // These are defaults. This line is not needed.
  psbt.setLocktime(notePayload.locktime ?? 0); // to change tx
  let totalInput = 0;
  const input = {
    hash: noteUtxo.txId,
    index: noteUtxo.outputIndex,
    sequence: MAX_SEQUENCE,
    witnessUtxo: {
      script: p2note.noteP2TR.output!,
      value: noteUtxo.satoshis,
    },
    tapLeafScript: [tapLeafScript], 
  };
  psbt.addInput(input);
  totalInput += noteUtxo.satoshis;

  for (const utxo of payUtxos) {
    if (utxo.type === "P2WPKH") {
      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: MAX_SEQUENCE,
        witnessUtxo: {
          script: Buffer.from(utxo.script, "hex"),
          value: utxo.satoshis,
        },
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    } else if (utxo.type === "P2WSH") {
      const redeem = bitcoinjs.payments.p2wpkh({
        pubkey,
        network,
      });
      const redeemScript = redeem?.output;

      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: MAX_SEQUENCE,
        witnessUtxo: {
          script: Buffer.from(utxo.script, "hex"),
          value: utxo.satoshis,
        },
        witnessScript: redeemScript, //. A Buffer of the witnessScript for P2WSH
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    } else if (utxo.type === "P2TR") {
      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: MAX_SEQUENCE,
        witnessUtxo: {
          script: Buffer.from(utxo.script, "hex"),
          value: utxo.satoshis,
        },
        tapInternalKey: xOnlyPubkey,
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    }
  }

  let totalOutput = 0;
  psbt.addOutput({
    address: to.address,
    value: to.satoshis,
  });
  totalOutput += to.satoshis;

  const value = totalInput - totalOutput - fee;
  if (value < 0) throw new Error("NoFund");
  if (value > 546) {
    psbt.addOutput({
      address: change,
      value: value,
    });
  }

  for (let i = 0; i < psbt.inputCount; i++) {
    if (psbt.data.inputs[i]!.tapLeafScript) {
      psbt.signInput(i, privateKey);
      psbt.validateSignaturesOfInput(i, schnorrValidator);
    } else if (psbt.data.inputs[i]!.tapInternalKey) {
      psbt.signInput(i, tweakedPrivateKey);
      psbt.validateSignaturesOfInput(i, schnorrValidator);
    } else {
      psbt.signInput(i, privateKey);
      psbt.validateSignaturesOfInput(i, validator);
    }
  }

  function getNoteFinalScripts(index, input) {
    const scriptSolution = [
      input.tapScriptSig[0].signature,
      Buffer.from(notePayload.data0, "hex"),
      Buffer.from(notePayload.data1, "hex"),
      Buffer.from(notePayload.data2, "hex"),
      Buffer.from(notePayload.data3, "hex"),
      Buffer.from(notePayload.data4, "hex"),
    ];
    const witness = scriptSolution
      .concat(tapLeafScript.script)
      .concat(tapLeafScript.controlBlock);

    const finalScriptWitness = witnessStackToScriptWitness(witness);

    return {
      finalScriptWitness,
    };
  }
  psbt.finalizeInput(0, getNoteFinalScripts);

  for (let i = 1; i < psbt.inputCount; i++) {
    psbt.finalizeInput(i);
  }
  return psbt.extractTransaction();
}

export function createClearP2TRNotePsbt(
  privateKey: ECPairInterface,
  notePayload: NotePayload,
  noteUtxos: IUtxo[],
  payUtxos: IUtxo[],
  change: string,
  network: bitcoinjs.Network,
  feeRate: number,
  fee = 1000,
) {
  // assert(noteUtxo.type === "P2TR-NOTE");

  const pubkey = privateKey.publicKey;
  const xOnlyPubkey = toXOnly(pubkey);

  const tweakedPrivateKey = privateKey.tweak(
    bitcoinjs.crypto.taggedHash("TapTweak", xOnlyPubkey),
  );

  // const tweakedPublicKey = tweakedPrivateKey.publicKey;

  const p2note = generateP2TRNoteInfo(pubkey, network);

  const tapLeafScript = {
    leafVersion: p2note.p2pkRedeem.redeemVersion,
    script: p2note.p2pkRedeem.output,
    controlBlock:
      p2note.p2pkP2TR.witness![p2note.p2pkP2TR.witness!.length - 1]!,
  };

  const psbt = new bitcoinjs.Psbt({ network });
  //     psbt.setVersion(2); // These are defaults. This line is not needed.
  //     psbt.setLocktime(0); // These are defaults. This line is not needed.
  let totalInput = 0;
  for (const noteUtxo of noteUtxos) {
    const input = {
      hash: noteUtxo.txId,
      index: noteUtxo.outputIndex,
      sequence: 0xffffffff,
      witnessUtxo: {
        script: p2note.p2pkP2TR.output!,
        value: noteUtxo.satoshis,
      },
      tapLeafScript: [tapLeafScript],
    };
    psbt.addInput(input);
    totalInput += noteUtxo.satoshis;
  }

  for (const utxo of payUtxos) {
    if (utxo.type === "P2WPKH") {
      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: 0xffffffff, // These are defaults. This line is not needed.
        witnessUtxo: {
          script: Buffer.from(utxo.script, "hex"),
          value: utxo.satoshis,
        },
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    } else if (utxo.type === "P2WSH") {
      const redeem = bitcoinjs.payments.p2pkh({
        pubkey,
        network,
      });
      const redeemScript = redeem?.output;

      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: 0xffffffff, // These are defaults. This line is not needed.
        witnessUtxo: {
          script: Buffer.from(utxo.script, "hex"),
          value: utxo.satoshis,
        },
        witnessScript: redeemScript, //. A Buffer of the witnessScript for P2WSH
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    } else if (utxo.type === "P2TR") {
      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: 0xffffffff, // These are defaults. This line is not needed.
        witnessUtxo: {
          script: Buffer.from(utxo.script, "hex"),
          value: utxo.satoshis,
        },
        tapInternalKey: xOnlyPubkey,
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    }
  }

  const value = totalInput - fee;
  if (value < 0) throw new Error("NoFund");
  if (value > 546) {
    psbt.addOutput({
      address: change,
      value: value,
    });
  }

  for (let i = 0; i < psbt.inputCount; i++) {
    if (psbt.data.inputs[i]!.tapLeafScript) {
      psbt.signInput(i, privateKey);
      psbt.validateSignaturesOfInput(i, schnorrValidator);
    } else if (psbt.data.inputs[i]!.tapInternalKey) {
      psbt.signInput(i, tweakedPrivateKey);
      psbt.validateSignaturesOfInput(i, schnorrValidator);
    } else {
      psbt.signInput(i, privateKey);
      psbt.validateSignaturesOfInput(i, validator);
    }
  }

  psbt.finalizeAllInputs();
  return psbt.extractTransaction();
}
