import type {ISendToAddress, IUtxo, NotePayload} from "../types";
import {MAX_SEQUENCE} from "../constants";
import {bitcoin, ECPair, ECPairInterface} from "./btc-ecc";
import {generateP2TRNoteInfo} from "./btc-note";
import {addPsbtPayUtxos, signPsbtInput} from "./btc-psbt";
import {witnessStackToScriptWitness} from "./witness_stack_to_script_witness";
import {MIN_SATOSHIS} from "../config";

export function createP2TRNotePsbt(
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

  const p2note = generateP2TRNoteInfo(pubkey, network);
  const tapLeafNoteScript = {
    leafVersion: p2note.noteRedeem.redeemVersion,
    script: p2note.noteRedeem.output,
    controlBlock:
      p2note.noteP2TR.witness![p2note.noteP2TR.witness!.length - 1]!,
  };
  const tapLeafP2PKScript = {
    leafVersion: p2note.p2pkRedeem.redeemVersion,
    script: p2note.p2pkRedeem.output,
    controlBlock:
      p2note.p2pkP2TR.witness![p2note.p2pkP2TR.witness!.length - 1]!,
  };

  const psbt = new bitcoin.Psbt({network});
  psbt.setVersion(2);
  psbt.setLocktime(notePayload.locktime ?? 0); // to change tx
  let totalInput = 0;
  {
    const noteUtxo = noteUtxos[0]!;

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
  {
    for (let i = 1; i < noteUtxos.length; i++) {
      const noteUtxo = noteUtxos[i]!;
      const input = {
        hash: noteUtxo.txId,
        index: noteUtxo.outputIndex,
        sequence: MAX_SEQUENCE,
        witnessUtxo: {
          script: p2note.p2pkP2TR.output!,
          value: noteUtxo.satoshis,
        },
        tapLeafScript: [tapLeafP2PKScript],
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

  for (let i = 0; i < noteUtxos.length; i++) {
    const privateKeyWif = noteUtxos[i]?.privateKeyWif;
    if (privateKeyWif) {
      signPsbtInput(ECPair.fromWIF(privateKeyWif, network), psbt, i);
    } else {
      signPsbtInput(privateKey, psbt, i);
    }
  }

  for (let i = noteUtxos.length; i < psbt.inputCount; i++) {
    const privateKeyWif = payUtxos[i - noteUtxos.length]?.privateKeyWif;
    if (privateKeyWif) {
      signPsbtInput(ECPair.fromWIF(privateKeyWif, network), psbt, i);
    } else {
      signPsbtInput(privateKey, psbt, i);
    }
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
  psbt.finalizeInput(0, getNoteFinalScripts);

  for (let i = 1; i < psbt.inputCount; i++) {
    psbt.finalizeInput(i);
  }
  return psbt.extractTransaction();
}
