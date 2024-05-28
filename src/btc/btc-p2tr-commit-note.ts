import type {ISendToAddress, IUtxo, NotePayload} from "../types";
import {MAX_SEQUENCE} from "../constants";
import {assert} from "../utils";
import {bitcoin, ECPair, ECPairInterface, toXOnly} from "./btc-ecc";
import {generateP2TRCommitNoteInfo} from "./btc-note";
import {addPsbtPayUtxos, signPsbtInput} from "./btc-psbt";
import {witnessStackToScriptWitness} from "./witness_stack_to_script_witness";
import {MIN_SATOSHIS} from "../config";

export function createP2TRCommitNotePsbt(
  privateKey: ECPairInterface,
  notePayload: NotePayload,
  noteUtxo: IUtxo,
  payUtxos: IUtxo[],
  to: ISendToAddress,
  change: string,
  network: bitcoin.Network,
  feeRate: number,
  fee = 1000
) {
  assert(noteUtxo.type === "P2TR-COMMIT-NOTE");

  const pubkey = privateKey.publicKey;

  const p2note = generateP2TRCommitNoteInfo(notePayload, pubkey, network);

  const tapLeafScript = {
    leafVersion: p2note.noteRedeem.redeemVersion,
    script: p2note.noteRedeem.output,
    controlBlock:
      p2note.noteP2TR.witness![p2note.noteP2TR.witness!.length - 1]!,
  };

  const psbt = new bitcoin.Psbt({network});
  psbt.setVersion(2);
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

  totalInput += addPsbtPayUtxos(privateKey, psbt, payUtxos, network);

  let totalOutput = 0;
  psbt.addOutput({
    address: to.address,
    value: Number(to.amount),
  });
  totalOutput += Number(to.amount);

  const value = totalInput - totalOutput - fee;

  if (value < 0) throw new Error("NoFund");

  if (value > MIN_SATOSHIS) {
    psbt.addOutput({
      address: change,
      value: value,
    });
  }

  {
    signPsbtInput(privateKey, psbt, 0);
  }

  for (let i = 1; i < psbt.inputCount; i++) {
    const privateKeyWif = payUtxos[i - 1]?.privateKeyWif;
    if (privateKeyWif) {
      signPsbtInput(ECPair.fromWIF(privateKeyWif, network), psbt, i);
    } else {
      signPsbtInput(privateKey, psbt, i);
    }
  }

  function getNoteFinalScripts(index: number, input: any) {
    const scriptSolution = [input.tapScriptSig[0].signature];
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
