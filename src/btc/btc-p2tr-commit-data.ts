import type {ISendToAddress, IUtxo} from "../types";
import {MAX_SEQUENCE, MIN_SATOSHIS} from "../constants";
import {assert} from "../utils";
import {bitcoin, ECPair, ECPairInterface, TapLeafScript} from "./btc-ecc";
import {generateP2TRCommitDataInfo} from "./btc-note";
import {addPsbtPayUtxos, signPsbtInput} from "./btc-psbt";
import {witnessStackToScriptWitness} from "./witness_stack_to_script_witness";

export function finalizeCommitInput(
  psbt: bitcoin.Psbt,
  inputIndex: number,
  tapLeafScript: TapLeafScript
) {
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
  psbt.finalizeInput(inputIndex, getNoteFinalScripts);
}

// Build a P2WSH transaction to generate NOTE information
// According to the protocol, the first input of the transaction is the NOTE information protocol, and the unlock script is the NOTE script hash
// The transaction output is the account notification
export function createP2TRCommitDataPsbt(
  privateKey: ECPairInterface,
  msgpackEncodedData: Buffer,
  noteUtxo: IUtxo,
  payUtxos: IUtxo[],
  to: ISendToAddress,
  change: string, // Change address
  network: bitcoin.Network,
  feeRate: number,
  fee = 1000 // Assume the fee is 1000
) {
  assert(noteUtxo.type === "P2TR-COMMIT-DATA");

  const pubkey = privateKey.publicKey;

  const p2note = generateP2TRCommitDataInfo(
    msgpackEncodedData,
    pubkey,
    network
  );

  const tapLeafScript = {
    leafVersion: p2note.noteRedeem.redeemVersion,
    script: p2note.noteRedeem.output,
    controlBlock:
      p2note.noteP2TR.witness![p2note.noteP2TR.witness!.length - 1]!,
  };

  const psbt = new bitcoin.Psbt({network});
  psbt.setVersion(2);
  psbt.setLocktime(0);
  let totalInput = 0;
  // Construct NOTE disclosure information
  const input = {
    hash: noteUtxo.txId,
    index: noteUtxo.outputIndex,
    sequence: MAX_SEQUENCE,
    witnessUtxo: {
      script: p2note.noteP2TR.output!,
      value: noteUtxo.satoshis,
    },
    tapLeafScript: [tapLeafScript], // MAST script with NOTE redemption script
  };
  psbt.addInput(input);
  totalInput += noteUtxo.satoshis;

  // Add recharge input
  totalInput += addPsbtPayUtxos(privateKey, psbt, payUtxos, network);

  // Output
  let totalOutput = 0;
  psbt.addOutput({
    address: to.address,
    value: Number(to.amount),
  });
  totalOutput += Number(to.amount);

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

  // Sign noteUtxo
  {
    signPsbtInput(privateKey, psbt, 0);
  }
  // Sign each payUtxo
  for (let i = 1; i < psbt.inputCount; i++) {
    const privateKeyWif = payUtxos[i - 1]?.privateKeyWif;
    if (privateKeyWif) {
      signPsbtInput(ECPair.fromWIF(privateKeyWif, network), psbt, i);
    } else {
      signPsbtInput(privateKey, psbt, i);
    }
  }
  // Finalize the first input
  finalizeCommitInput(psbt, 0, tapLeafScript);

  for (let i = 1; i < psbt.inputCount; i++) {
    psbt.finalizeInput(i);
  }
  return psbt.extractTransaction();
}
