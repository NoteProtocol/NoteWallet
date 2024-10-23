import type {ISendToAddress, IUtxo, NotePayload} from "../types";
import {MAX_SEQUENCE, MIN_SATOSHIS} from "../constants";
import {bitcoin, ECPairInterface} from "./btc-ecc";
import {generateP2TRNoteInfoV1} from "./btc-note";
import {finalizeP2TRNoteInput} from "./btc-p2tr-note";
import {addPsbtPayUtxos, signPsbtInput} from "./btc-psbt";

// Build a P2TR transaction to generate NOTE information
// According to the protocol, the first input of the transaction is the NOTE information protocol, and the unlocking script is the NOTE script hash
// The transaction output is for account notification
export function createP2TRNotePsbtV1(
  privateKey: ECPairInterface,
  notePayload: NotePayload,
  noteUtxos: IUtxo[],
  payUtxos: IUtxo[],
  toAddresses: ISendToAddress[],
  change: string, // Change address
  network: bitcoin.Network,
  feeRate: number,
  fee: number = 1000, // Assume the fee is 1000
  locktime?: number
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
  psbt.setLocktime(locktime ?? 0); // to change tx
  let totalInput = 0;
  {
    // Insert signature unlock at other locations
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
        tapLeafScript: [tapLeafNoteScript], // MAST script with NOTE redemption script
      };
      psbt.addInput(input);
      totalInput += noteUtxo.satoshis;
    }
  }

  // Add recharge input
  totalInput += addPsbtPayUtxos(privateKey, psbt, payUtxos, network);

  // Outputs
  let totalOutput = 0;
  for (const to of toAddresses) {
    psbt.addOutput({
      address: to.address,
      value: Number(to.amount),
    });
    totalOutput += Number(to.amount);
  }

  // Add change
  const value = totalInput - totalOutput - fee;
  // No funds
  if (value < 0) throw new Error("NoFund");

  if (value > MIN_SATOSHIS) {
    psbt.addOutput({
      address: change,
      value: value,
    });
  }

  // Sign each input
  for (let i = 0; i < psbt.inputCount; i++) {
    signPsbtInput(privateKey, psbt, i);
  }

  for (let i = 0; i < noteUtxos.length; i++) {
    finalizeP2TRNoteInput(psbt, i, tapLeafNoteScript, notePayload);
  }

  for (let i = noteUtxos.length; i < psbt.inputCount; i++) {
    psbt.finalizeInput(i);
  }
  return psbt.extractTransaction();
}
