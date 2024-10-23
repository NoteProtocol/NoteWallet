import type {ISendToAddress, IUtxo, NotePayload} from "../types";
import {MAX_SEQUENCE, MIN_SATOSHIS} from "../constants";
import {bitcoin, ECPair, ECPairInterface, TapLeafScript} from "./btc-ecc";
import {generateP2TRNoteInfo} from "./btc-note";
import {addPsbtPayUtxos, signPsbtInput} from "./btc-psbt";
import {witnessStackToScriptWitness} from "./witness_stack_to_script_witness";

export function finalizeP2TRNoteInput(
  psbt: bitcoin.Psbt,
  inputIndex: number,
  tapLeafNoteScript: TapLeafScript,
  notePayload: NotePayload
) {
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

  psbt.finalizeInput(inputIndex, getNoteFinalScripts);
}
/**
 * The function `createP2TRNotePsbt` generates a P2TR transaction with a NOTE payload as the first
 * input and account notifications as outputs, handling inputs, outputs, fees, and signing processes.
 * @param {ECPairInterface} privateKey - The `privateKey` parameter is the private key used to sign the
 * transaction inputs. It is of type `ECPairInterface` and should be an instance of an elliptic curve
 * cryptography pair. This private key is essential for generating the digital signatures required to
 * authorize the spending of the UTXOs
 * @param {NotePayload} notePayload - The `notePayload` parameter in the `createP2TRNotePsbt` function
 * is used to provide information about the note being created in the P2TR transaction. This
 * information typically includes details such as the locktime for the transaction, which specifies the
 * earliest time a transaction can be added to
 * @param {IUtxo[]} noteUtxos - The `noteUtxos` parameter in the `createP2TRNotePsbt` function
 * represents an array of unspent transaction outputs (UTXOs) that are associated with the NOTE
 * information. These UTXOs will be used as inputs for constructing the P2TR transaction that includes
 * the
 * @param {IUtxo[]} payUtxos - The `payUtxos` parameter in the `createP2TRNotePsbt` function represents
 * the unspent transaction outputs (UTXOs) that will be used to fund the transaction. These UTXOs are
 * typically inputs from previous transactions that are being spent in the current transaction to cover
 * @param {ISendToAddress[]} toAddresses - The `toAddresses` parameter in the `createP2TRNotePsbt`
 * function represents an array of objects that contain the address and amount to send funds to. Each
 * object in the array has the following structure:
 * @param {string} change - The `change` parameter in the `createP2TRNotePsbt` function represents the
 * address where any remaining funds after deducting the transaction output amounts and fees will be
 * sent back to. It is essentially the address where the change from the transaction will be returned
 * to.
 * @param network - The `network` parameter in the function `createP2TRNotePsbt` is used to specify the
 * Bitcoin network on which the transaction will be broadcasted. It determines whether the transaction
 * will be valid on the Bitcoin mainnet or testnet. You need to provide the `network` parameter with
 * @param [fee=1000] - The `fee` parameter in the `createP2TRNotePsbt` function represents the
 * transaction fee that needs to be paid for including the transaction in the Bitcoin network. In this
 * function, the fee is set to a default value of 1000 satoshis, but you can adjust this
 * @returns The function `createP2TRNotePsbt` returns the finalized and signed Bitcoin transaction (Tx)
 * in Partially Signed Bitcoin Transaction (PSBT) format.
 */
export function createP2TRNotePsbt(
  privateKey: ECPairInterface,
  notePayload: NotePayload,
  noteUtxos: IUtxo[],
  payUtxos: IUtxo[],
  toAddresses: ISendToAddress[],
  change: string,
  network: bitcoin.Network,
  fee: number = 1000,
  locktime?: number
) {
  const psbt = new bitcoin.Psbt({network});
  psbt.setVersion(2);
  psbt.setLocktime(locktime ?? 0);

  const p2note = generateP2TRNoteInfo(privateKey.publicKey, network);
  const tapLeafNoteScript = createTapLeafScript(
    p2note.noteRedeem,
    p2note.noteP2TR
  );
  const tapLeafP2PKScript = createTapLeafScript(
    p2note.p2pkRedeem,
    p2note.p2pkP2TR
  );

  let totalInput = 0;

  // Add NOTE input
  totalInput += addNoteInput(
    psbt,
    noteUtxos[0]!,
    p2note.noteP2TR,
    tapLeafNoteScript
  );

  // Add other note inputs
  for (let i = 1; i < noteUtxos.length; i++) {
    totalInput += addNoteInput(
      psbt,
      noteUtxos[i]!,
      p2note.p2pkP2TR,
      tapLeafP2PKScript
    );
  }

  // Add pay inputs
  totalInput += addPsbtPayUtxos(privateKey, psbt, payUtxos, network);

  // Add outputs
  const totalOutput = addOutputs(psbt, toAddresses);

  // Add change output
  addChangeOutput(psbt, totalInput, totalOutput, fee, change);

  // Sign inputs
  signInputs(psbt, noteUtxos, payUtxos, privateKey, network);

  // Finalize inputs
  finalizeP2TRNoteInput(psbt, 0, tapLeafNoteScript, notePayload);
  for (let i = 1; i < psbt.inputCount; i++) {
    psbt.finalizeInput(i);
  }

  return psbt.extractTransaction();
}

function createTapLeafScript(redeem: any, p2tr: any) {
  return {
    leafVersion: redeem.redeemVersion,
    script: redeem.output,
    controlBlock: p2tr.witness![p2tr.witness!.length - 1]!,
  };
}

function addNoteInput(
  psbt: bitcoin.Psbt,
  utxo: IUtxo,
  p2tr: any,
  tapLeafScript: any
) {
  const input = {
    hash: utxo.txId,
    index: utxo.outputIndex,
    sequence: MAX_SEQUENCE,
    witnessUtxo: {
      script: p2tr.output!,
      value: utxo.satoshis,
    },
    tapLeafScript: [tapLeafScript],
  };
  psbt.addInput(input);
  return utxo.satoshis;
}

function addOutputs(psbt: bitcoin.Psbt, toAddresses: ISendToAddress[]) {
  let totalOutput = 0;
  for (const to of toAddresses) {
    const amount = to.amount;
    psbt.addOutput({
      address: to.address,
      value: Number(amount),
    });
    totalOutput += Number(amount);
  }
  return totalOutput;
}

//添加找零输出
function addChangeOutput(
  psbt: bitcoin.Psbt,
  totalInput: number,
  totalOutput: number,
  fee: number,
  change: string
) {
  const value = totalInput - totalOutput - fee;
  if (value < 0) throw new Error("NoFund");
  // If value is greater than the minimum change, add a change output, otherwise don't add
  if (value > MIN_SATOSHIS) {
    psbt.addOutput({
      address: change,
      value: Number(value),
    });
  }
}

function signInputs(
  psbt: bitcoin.Psbt,
  noteUtxos: IUtxo[],
  payUtxos: IUtxo[],
  privateKey: ECPairInterface,
  network: bitcoin.Network
) {
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
}
