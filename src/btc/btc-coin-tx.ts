import type { ECPairInterface } from "ecpair";
import * as bitcoinjs from "bitcoinjs-lib";

import type { ISendToAddress, IUtxo } from "../types";
import { schnorrValidator, toXOnly, validator } from "./btc-tweak";

export function createCoinPsbt(
  privateKey: ECPairInterface,
  utxos: IUtxo[],
  to: ISendToAddress[],
  change: string,
  network: bitcoinjs.Network,
  feeRate: number,
  fee = 1000, 
) {
  console.log(utxos, to, change);
  const pubkey = privateKey.publicKey;
  const xOnlyPubkey = toXOnly(pubkey);

  const tweakedPrivateKey = privateKey.tweak(
    bitcoinjs.crypto.taggedHash("TapTweak", xOnlyPubkey),
  );

  const psbt = new bitcoinjs.Psbt({ network });
  //     psbt.setVersion(2); // These are defaults. This line is not needed.
  //     psbt.setLocktime(0); // These are defaults. This line is not needed.
  let totalInput = 0;
  for (const utxo of utxos) {
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

  let totalOutput = 0;
  for (const item of to) {
    psbt.addOutput({
      address: item.address,
      value: item.satoshis,
    });
    totalOutput += item.satoshis;
  }

  const value = totalInput - totalOutput - fee;
  if (value < 0) throw new Error("NoFund");
  if (value > 546) {
    psbt.addOutput({
      address: change,
      value: value,
    });
  }

  for (let i = 0; i < psbt.inputCount; i++) {
    if (psbt.data.inputs[i]!.tapInternalKey) {
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
