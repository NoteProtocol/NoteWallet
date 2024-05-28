import type {ISendToAddress, IUtxo, NotePayload} from "../types";
import {MAX_SEQUENCE} from "../constants";
import {bitcoin, ECPairInterface, toXOnly} from "./btc-ecc";
import {generateP2TRNoteInfoV1} from "./btc-note";
import {addPsbtPayUtxos, signPsbtInput} from "./btc-psbt";
import {witnessStackToScriptWitness} from "./witness_stack_to_script_witness";
import {MIN_SATOSHIS} from "../config";

export function createP2TRNotePsbtV1(
  privateKey: ECPairInterface,
  notePayload: NotePayload,
  noteUtxos: IUtxo[],
  payUtxos: IUtxo[],
  toAddresses: ISendToAddress[],
  change: string,
  network: bitcoin.Network,
  feeRate: number,
  fee = 1000
) {
  const pubkey = privateKey.publicKey;

  const p2note = generateP2TRNoteInfoV1(pubkey, network);
  const tapLeafNoteScript = {
    leafVersion: p2note.noteRedeem.redeemVersion,
    script: p2note.noteRedeem.output,
    controlBlock:
      p2note.noteP2TR.witness![p2note.noteP2TR.witness!.length - 1]!,
  };

  const psbt = new bitcoin.Psbt({network});
  psbt.setVersion(2);
  psbt.setLocktime(notePayload.locktime ?? 0); // to change tx
  let totalInput = 0;
  {
    for (let i = 0; i < noteUtxos.length; i++) {
      const noteUtxo = noteUtxos[i]!;
      const input = {
        hash: noteUtxo.txId,
        index: noteUtxo.outputIndex,
        sequence: MAX_SEQUENCE,
        witnessUtxo: {
          script: p2note.noteP2TR.output!,
          value: noteUtxo.satoshis,
        },
        tapLeafScript: [tapLeafNoteScript],
      };
      psbt.addInput(input);
      totalInput += noteUtxo.satoshis;
    }
  }

  totalInput += addPsbtPayUtxos(privateKey, psbt, payUtxos, network);

  let totalOutput = 0;
  for (const to of toAddresses) {
    psbt.addOutput({
      address: to.address,
      value: Number(to.amount),
    });
    totalOutput += Number(to.amount);
  }

  const value = totalInput - totalOutput - fee;

  if (value < 0) throw new Error("NoFund");

  if (value > MIN_SATOSHIS) {
    psbt.addOutput({
      address: change,
      value: value,
    });
  }

  for (let i = 0; i < psbt.inputCount; i++) {
    signPsbtInput(privateKey, psbt, i);
  }

  function getNoteFinalScripts(index: number, input: any) {
    const scriptSolution = [
      input.tapScriptSig[0].signature,
      Buffer.from(notePayload.data0, "hex"),
      Buffer.from(notePayload.data1, "hex"),
      Buffer.from(notePayload.data2, "hex"),
      Buffer.from(notePayload.data3, "hex"),
      Buffer.from(notePayload.data4, "hex"),
    ];
    const witness = scriptSolution
      .concat(tapLeafNoteScript.script)
      .concat(tapLeafNoteScript.controlBlock);

    const finalScriptWitness = witnessStackToScriptWitness(witness);

    return {
      finalScriptWitness,
    };
  }
  for (let i = 0; i < noteUtxos.length; i++) {
    psbt.finalizeInput(i, getNoteFinalScripts);
  }

  for (let i = noteUtxos.length; i < psbt.inputCount; i++) {
    psbt.finalizeInput(i);
  }
  return psbt.extractTransaction();
}
