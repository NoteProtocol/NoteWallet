import {MIN_SATOSHIS} from "../config";
import type {ISendToAddress, IUtxo} from "../types";
import {bitcoin, ECPair, ECPairInterface} from "./btc-ecc";
import {addPsbtPayUtxos, signPsbtInput} from "./btc-psbt";

export function createCoinPsbt(
  privateKey: ECPairInterface,
  utxos: IUtxo[],
  to: ISendToAddress[],
  change: string,
  network: bitcoin.Network,
  feeRate: number,
  fee = 1000
) {
  const psbt = new bitcoin.Psbt({network});
  const totalInput = addPsbtPayUtxos(privateKey, psbt, utxos, network);

  //send all to one address
  if (to.length === 1 && Number(to[0]!.amount) === totalInput) {
    const value = totalInput - fee;
    if (value < MIN_SATOSHIS) {
      throw new Error("Insufficient fund");
    }
    psbt.addOutput({
      address: to[0]!.address,
      value: value,
    });
  } else {
    let totalOutput = 0;
    for (const item of to) {
      psbt.addOutput({
        address: item.address,
        value: Number(item.amount),
      });
      totalOutput += Number(item.amount);
    }

    const value = totalInput - totalOutput - fee;
    if (value < 0) throw new Error("NoFund");
    if (value > MIN_SATOSHIS) {
      psbt.addOutput({
        address: change,
        value: value,
      });
    }
  }

  for (let i = 0; i < psbt.inputCount; i++) {
    const privateKeyWif = utxos[i]?.privateKeyWif;
    if (privateKeyWif) {
      signPsbtInput(ECPair.fromWIF(privateKeyWif, network), psbt, i);
    } else {
      signPsbtInput(privateKey, psbt, i);
    }
  }
  psbt.finalizeAllInputs();
  return psbt.extractTransaction();
}
