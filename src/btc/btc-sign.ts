import * as bitcore from "bitcore-lib";

import {IUtxo} from "../types";
import {Wallet} from "../wallet";
import {bitcoin, ECPair, toXOnly} from "./btc-ecc";
import {signPsbtInput} from "./btc-psbt";

export interface ToSignInput {
  index: number;
  publicKey: string;
  sighashTypes?: number[];
}

interface BaseUserToSignInput {
  index: number;
  sighashTypes: number[] | undefined;
  disableTweakSigner?: boolean;
}

export interface AddressUserToSignInput extends BaseUserToSignInput {
  address: string;
}

export interface PublicKeyUserToSignInput extends BaseUserToSignInput {
  publicKey: string;
}

export type UserToSignInput = AddressUserToSignInput | PublicKeyUserToSignInput;

export interface SignPsbtOptions {
  autoFinalized: boolean;
  toSignInputs?: UserToSignInput[];
}

export interface SignPsbtOptions {
  autoFinalized: boolean;
  toSignInputs?: UserToSignInput[];
}

async function formatOptionsToSignInputs(
  wallet: any,
  _psbt: string | bitcoin.Psbt,
  options?: SignPsbtOptions
) {
  let toSignInputs: ToSignInput[] = [];
  if (options && options.toSignInputs) {
    // We expect userToSignInputs objects to be similar to ToSignInput interface,
    // but we allow address to be specified in addition to publicKey for convenience.
    toSignInputs = options.toSignInputs.map((input) => {
      const index = Number(input.index);
      if (isNaN(index)) throw new Error("invalid index in toSignInput");

      if (
        (input as PublicKeyUserToSignInput).publicKey &&
        (input as PublicKeyUserToSignInput).publicKey !=
          wallet.currentAccount.publicKey
      ) {
        throw new Error("invalid public key in toSignInput");
      }

      const sighashTypes = input.sighashTypes?.map(Number);
      if (sighashTypes?.some(isNaN))
        throw new Error("invalid sighash type in toSignInput");

      return {
        index,
        publicKey: wallet.currentAccount.publicKey,
        sighashTypes,
        disableTweakSigner: input.disableTweakSigner,
      };
    });
  } else {
    const psbt =
      typeof _psbt === "string"
        ? bitcoin.Psbt.fromHex(_psbt as string, {
            network: bitcoin.networks.bitcoin,
          })
        : (_psbt as bitcoin.Psbt);
    psbt.data.inputs.forEach((v, index) => {
      let script: any = null;
      let value = 0;
      if (v.witnessUtxo) {
        script = v.witnessUtxo.script;
        value = v.witnessUtxo.value;
      } else if (v.nonWitnessUtxo) {
        const tx = bitcore.Transaction.fromBuffer(v.nonWitnessUtxo);
        const output = tx.outs[psbt.txInputs[index]!.index];
        script = output.script;
        value = output.value;
      }
      const isSigned = v.finalScriptSig || v.finalScriptWitness;
      if (script && !isSigned) {
        const address = new bitcore.Address(
          script,
          "livenet",
          bitcore.Address.PayToScriptHash
        ).toString();

        if (wallet.currentAccount.mainAddress?.address === address) {
          toSignInputs.push({
            index,
            publicKey: wallet.currentAccount.publicKey,
            sighashTypes: v.sighashType ? [v.sighashType] : undefined,
          });
        }
      }
    });
  }
  return toSignInputs;
}

// Only sign the content that needs to be signed
export async function signPsbt(
  wallet: Wallet,
  psbt: bitcoin.Psbt,
  utxos: IUtxo[] = [],
  network: bitcoin.networks.Network,
  options: any
) {
  // Check the content that requires signing
  let toSignInputs: ToSignInput[] = await formatOptionsToSignInputs(
    wallet,
    psbt,
    options
  );
  if (toSignInputs.length == 0) {
    throw new Error("no input to sign");
  }
  psbt.data.inputs.forEach((v, index) => {
    const isNotSigned = !(v.finalScriptSig || v.finalScriptWitness);
    const lostInternalPubkey = !v.tapInternalKey;
    // Special measures taken for compatibility with certain applications.
    if (isNotSigned && lostInternalPubkey) {
      const tapInternalKey = toXOnly(
        Buffer.from(wallet.currentAccount.publicKey, "hex")
      );
      const {output} = bitcoin.payments.p2tr({
        internalPubkey: tapInternalKey,
        network:
          wallet.currentAccount.network === "tesnet"
            ? bitcoin.networks.testnet
            : bitcoin.networks.bitcoin,
      });
      if (v.witnessUtxo?.script.toString("hex") == output?.toString("hex")) {
        v.tapInternalKey = tapInternalKey;
      }
    }
  });

  toSignInputs.forEach((input) => {
    const index = Number(input.index);
    const privateKeyBuffer = new bitcore.PrivateKey(
      wallet.currentAccount.privateKey
    ).toBuffer();
    let privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

    const txId = Buffer.from(psbt.txInputs[index]!.hash)
      .reverse()
      .toString("hex");
    const utxo = utxos.find(
      (utxo) =>
        utxo.txId === txId && utxo.outputIndex === psbt.txInputs[index]!.index
    );
    if (utxo) {
      privateKey = ECPair.fromWIF(utxo.privateKeyWif!, network);
    }

    signPsbtInput(privateKey, psbt, index);
  });
  toSignInputs.forEach((input) => {
    const index = Number(input.index);
    const autoFinalized =
      options && options.autoFinalized == false ? false : true;
    if (autoFinalized) {
      psbt.finalizeInput(index);
    }
  });

  return psbt;
}

export async function finishSignPsbt(
  wallet: Wallet,
  psbt: bitcoin.Psbt,
  utxos: IUtxo[] = [],
  network: bitcoin.networks.Network,
  options: any
) {
  psbt.data.inputs.forEach((v, index) => {
    const isNotSigned = !(v.finalScriptSig || v.finalScriptWitness);
    const lostInternalPubkey = !v.tapInternalKey;
    // Special measures taken for compatibility with certain applications.
    if (isNotSigned && lostInternalPubkey) {
      const privateKeyBuffer = new bitcore.PrivateKey(
        wallet.currentAccount.privateKey
      ).toBuffer();
      let privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

      const txId = Buffer.from(psbt.txInputs[index]!.hash)
        .reverse()
        .toString("hex");
      const utxo = utxos.find(
        (utxo) =>
          utxo.txId === txId && utxo.outputIndex === psbt.txInputs[index]!.index
      );
      if (utxo) {
        privateKey = ECPair.fromWIF(utxo.privateKeyWif!, network);
      }

      const tapInternalKey = toXOnly(privateKey.publicKey);
      const {output} = bitcoin.payments.p2tr({
        internalPubkey: tapInternalKey,
        network: bitcoin.networks.bitcoin,
      });
      if (v.witnessUtxo?.script.toString("hex") == output?.toString("hex")) {
        v.tapInternalKey = tapInternalKey;
      }
      signPsbtInput(privateKey, psbt, index);
      psbt.finalizeInput(index);
    }
  });
  return psbt;
}
