import type {IUtxo} from "../types";
import {MAX_SEQUENCE} from "../constants";
import {
  bitcoin,
  eccValidator,
  ECPair,
  ECPairInterface,
  schnorrValidator,
  toXOnly,
} from "./btc-ecc";
import {generateP2TRNoteInfo} from "./btc-note";

export function addPsbtPayUtxos(
  privateKey: ECPairInterface,
  psbt: bitcoin.Psbt,
  utxos: IUtxo[],
  network: bitcoin.Network
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
        witnessScript: redeemScript, //. A Buffer of the witnessScript for P2WSH
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
        tapLeafScript: [tapLeafP2PKScript],
      };
      psbt.addInput(input);
      totalInput += utxo.satoshis;
    }
  }
  return totalInput;
}

export function signPsbtInput(
  privateKey: ECPairInterface,
  psbt: bitcoin.Psbt,
  inputIndex: number
) {
  if (psbt.data.inputs[inputIndex]!.tapLeafScript) {
    psbt.signInput(inputIndex, privateKey);
    psbt.validateSignaturesOfInput(inputIndex, schnorrValidator);
  } else if (psbt.data.inputs[inputIndex]!.tapInternalKey) {
    const pubkey = privateKey.publicKey;
    const xOnlyPubkey = toXOnly(pubkey);
    const tweakedPrivateKey = privateKey.tweak(
      bitcoin.crypto.taggedHash("TapTweak", xOnlyPubkey)
    );

    psbt.signInput(inputIndex, tweakedPrivateKey);
    psbt.validateSignaturesOfInput(inputIndex, schnorrValidator);
  } else {
    psbt.signInput(inputIndex, privateKey);
    psbt.validateSignaturesOfInput(inputIndex, eccValidator);
  }
}
