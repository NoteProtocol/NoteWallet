import type {IUtxo} from "../types";
import {MAX_SEQUENCE} from "../constants";
import {
  bitcoin,
  eccValidator,
  ECPair,
  ECPairInterface,
  schnorrValidator,
  toXOnly,
  tweakSigner,
} from "./btc-ecc";
import {generateP2TRNoteInfo} from "./btc-note";

// Add payment UTXOs
export function addPsbtPayUtxos(
  privateKey: ECPairInterface,
  psbt: bitcoin.Psbt,
  utxos: IUtxo[],
  network: bitcoin.Network,
  sighashType?: number
) {
  let totalInput = 0;
  for (const utxo of utxos) {
    let privkey = privateKey;
    const privateKeyWif = utxo.privateKeyWif;
    if (privateKeyWif) {
      privkey = ECPair.fromWIF(privateKeyWif, network);
    }
    const pubkey = privkey.publicKey;
    const xOnlyPubkey = toXOnly(pubkey);

    if (utxo.type === "P2WPKH") {
      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: MAX_SEQUENCE, // These are defaults. This line is not needed.
        witnessUtxo: {
          script: Buffer.from(utxo.script, "hex"),
          value: utxo.satoshis,
        },
        ...(sighashType ? {sighashType} : {}),
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    } else if (utxo.type === "P2WSH") {
      const redeem = bitcoin.payments.p2pkh({
        pubkey,
        network,
      });
      const redeemScript = redeem?.output;

      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: MAX_SEQUENCE, // These are defaults. This line is not needed.
        witnessUtxo: {
          script: Buffer.from(utxo.script, "hex"),
          value: utxo.satoshis,
        },
        witnessScript: redeemScript, // A Buffer of the witnessScript for P2WSH
        ...(sighashType ? {sighashType} : {}),
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    } else if (utxo.type === "P2TR") {
      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: MAX_SEQUENCE, // These are defaults. This line is not needed.
        witnessUtxo: {
          script: Buffer.from(utxo.script, "hex"),
          value: utxo.satoshis,
        },
        tapInternalKey: xOnlyPubkey,
        ...(sighashType ? {sighashType} : {}),
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    } else if (utxo.type === "P2TR-NOTE") {
      const p2note = generateP2TRNoteInfo(pubkey, network);
      const tapLeafP2PKScript = {
        leafVersion: p2note.p2pkRedeem.redeemVersion,
        script: p2note.p2pkRedeem.output,
        controlBlock:
          p2note.p2pkP2TR.witness![p2note.p2pkP2TR.witness!.length - 1]!,
      };

      const input = {
        hash: utxo.txId,
        index: utxo.outputIndex,
        sequence: MAX_SEQUENCE,
        witnessUtxo: {
          script: p2note.p2pkP2TR.output!,
          value: utxo.satoshis,
        },
        tapLeafScript: [tapLeafP2PKScript], // MAST script with public key unlock
        ...(sighashType ? {sighashType} : {}),
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    }
  }
  return totalInput;
}

// Sign inputs using private key
export function signPsbtInput(
  privateKey: ECPairInterface,
  psbt: bitcoin.Psbt,
  inputIndex: number
) {
  const input = psbt.data.inputs[inputIndex]!;
  const sighashType = input.sighashType;
  const allowedSighashTypes = sighashType ? [sighashType] : undefined;
  if (input.tapLeafScript) {
    // If there's a tapLeafScript, it's Taproot MAST, use regular private key to sign
    psbt.signInput(inputIndex, privateKey, allowedSighashTypes);
    // Taproot uses schnorr, so we need to use a special validator
    psbt.validateSignaturesOfInput(inputIndex, schnorrValidator);
  } else if (input.tapInternalKey) {
    const tweakedPrivateKey = tweakSigner(privateKey);

    // If there's a tapInternalKey, it's Taproot, need to use tweaked private key to sign
    psbt.signInput(inputIndex, tweakedPrivateKey, allowedSighashTypes);
    // Taproot uses schnorr, so we need to use a special validator
    psbt.validateSignaturesOfInput(inputIndex, schnorrValidator);
  } else {
    psbt.signInput(inputIndex, privateKey, allowedSighashTypes);
    psbt.validateSignaturesOfInput(inputIndex, eccValidator);
  }
  return psbt;
}
