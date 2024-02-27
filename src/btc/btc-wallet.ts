import ecc from "@bitcoinerlab/secp256k1";
import * as msgpack from "@msgpack/msgpack";
import * as bitcoinjs from "bitcoinjs-lib";
import { PrivateKey, PublicKey } from "bitcore-lib";
import ECPairFactory from "ecpair";

import type {
  IAddressObject,
  ICoinConfig,
  ISendToAddress,
  ITransaction,
  IUtxo,
  NotePayload,
} from "../types";
import { mapAddressToScriptHash } from "../address";
import { MIN_SATOSHIS } from "../config";
import {
  MAX_STACK_FULL_SIZE,
  MAX_STANDARD_STACK_ITEM_SIZE,
} from "../constants";
import { splitBufferIntoSegments } from "../utils";
import { Wallet } from "../wallet";
import {
  generateP2TRAddress,
  generateP2TRNoteAddress,
  generateP2WPHKAddress,
} from "./btc-address";
import { createCoinPsbt } from "./btc-coin-tx";
import { createP2TRNotePsbt } from "./btc-p2tr-note";

bitcoinjs.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export class BTCWallet extends Wallet {
  protected addressP2WPKH!: IAddressObject;
  protected addressP2TR!: IAddressObject;
  protected addressP2TRNote!: IAddressObject;

  constructor(
    mnemonic: string | undefined,
    config: ICoinConfig,
    lang = "ENGLISH",
  ) {
    super(mnemonic, config, lang);
  }

  async showUtxos() {
    const noteUtxos = await this.urchain.utxos([
      this.addressP2TRNote.scriptHash,
    ]);

    for (const utxo of noteUtxos) {
      utxo.type = "P2TR-NOTE";
    }
    const payUtxos = await this.urchain.utxos([
      this.addressP2WPKH.scriptHash,
    ]);
    for (const utxo of payUtxos) {
      utxo.type = "P2WPKH";
    }
    return {
      noteUtxos,
      payUtxos,
    };
  }

  info() {
    return {
      coin: "BTC",
      mnemoic: this.mnemoic.toString(),
      lang: this.lang,
      network: this.config.network,
      walletHDPath: this.config.path,
      // currentAccount: this.currentAccount,
      mainAddress: this.mainAddress.address,
      tokenAddress: this.tokenAddress.address,
    };
  }

  async refresh(){
    await this.urchain.refresh(this.mainAddress.scriptHash);
    await this.urchain.refresh(this.tokenAddress.scriptHash);
  }

  protected importMnemonic(mnemonicStr: string): void {
    super.importMnemonic(mnemonicStr);
    const privateKeyBuffer = new PrivateKey(
      this.currentAccount.privateKey,
    ).toBuffer();
    const publicKeyBuffer = new PublicKey(
      this.currentAccount.publicKey,
    ).toBuffer();

    const xOnlyPubkey = publicKeyBuffer.slice(1, 33);

    // Used for signing, since the output and address are using a tweaked key
    // We must tweak the signer in the same way.
    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);
    const tweakedPrivateKey = privateKey.tweak(
      bitcoinjs.crypto.taggedHash("TapTweak", xOnlyPubkey),
    );

    this.currentAccount.tweakedPrivateKey = tweakedPrivateKey.toWIF();
    this.currentAccount.xOnlyPubkey = xOnlyPubkey.toString("hex");

    const network =
      bitcoinjs.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ];

    const addressP2WPKH = generateP2WPHKAddress(
      Buffer.from(this.currentAccount.publicKey, "hex"),
      network,
    );
    this.addressP2WPKH = addressP2WPKH;
    this.mainAddress = addressP2WPKH;

    const addressP2TR = generateP2TRAddress(
      Buffer.from(this.currentAccount.publicKey, "hex"),
      network,
    );
    this.addressP2TR = addressP2TR;
    this.extraAddressList.push(addressP2TR);

    const addressP2TRNote = generateP2TRNoteAddress(
      Buffer.from(this.currentAccount.publicKey, "hex"),
      network,
    );
    this.addressP2TRNote = addressP2TRNote;
    this.tokenAddress = addressP2TRNote;
  }

  async getBalance() {
    const fee= await this.urchain.getFeePerKb()
    const p2wpkh = await this.urchain.balance(this.addressP2WPKH.scriptHash);
    const p2trnode = await this.urchain.balance(
      this.addressP2TRNote.scriptHash,
    );
    return {
      fee,
      mainAddress: {
        confirmed: BigInt(p2wpkh.confirmed),
        unconfirmed: BigInt(p2wpkh.unconfirmed),
      },
      tokenAddress: {
        confirmed: BigInt(p2trnode.confirmed),
        unconfirmed: BigInt(p2trnode.unconfirmed),
      },
    };
  }

  async send(toAddresses: ISendToAddress[]) {
    const utxos = await this.urchain.utxos([
      this.addressP2WPKH.scriptHash,
    ]);
    for (const utxo of utxos) {
      utxo.type = "P2WPKH";
    }
    const feeRate = await this.urchain.getFeePerKb();
    const network =
      bitcoinjs.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ];

    const privateKeyBuffer = new PrivateKey(
      this.currentAccount.privateKey,
    ).toBuffer();
    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

    const estimatedPsbt = createCoinPsbt(
      privateKey,
      utxos,
      toAddresses,
      this.addressP2WPKH.address!,
      network,
      feeRate.avgFee,
      1000,
    );

    const estimatedSize = estimatedPsbt.virtualSize();
    const realFee = Math.floor((estimatedSize * feeRate.avgFee) / 1000 + 1);
    const finalTx = createCoinPsbt(
      privateKey,
      utxos,
      toAddresses,
      this.addressP2WPKH.address!,
      network,
      feeRate.avgFee,
      realFee,
    );
    return await this.urchain.broadcast(finalTx.toHex());
  }

  async buildN20Transaction(
    payload: NotePayload,
    toAddress?: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feeRate?: number,
  ): Promise<ITransaction> {
    return this.mintP2TRNote(payload, toAddress, noteUtxo, payUtxos, feeRate);
  }

  buildN20Payload(data: string | object) {
    const encodedData = msgpack.encode(data, {
      sortKeys: true,
      useBigInt64: true,
    });
    const payload: NotePayload = {
      data0: "",
      data1: "",
      data2: "",
      data3: "",
      data4: "",
    };
    const buffer = Buffer.from(encodedData);

    let dataList;
    if (buffer.length <= MAX_STACK_FULL_SIZE) {
      dataList = splitBufferIntoSegments(buffer, MAX_STANDARD_STACK_ITEM_SIZE);
    } else {
      throw new Error("Data is too large");
    }
    if (dataList) {
      payload.data0 =
        dataList[0] !== undefined ? dataList[0].toString("hex") : "";
      payload.data1 =
        dataList[1] !== undefined ? dataList[1].toString("hex") : "";
      payload.data2 =
        dataList[2] !== undefined ? dataList[2].toString("hex") : "";
      payload.data3 =
        dataList[3] !== undefined ? dataList[3].toString("hex") : "";
      payload.data4 =
        dataList[4] !== undefined ? dataList[4].toString("hex") : "";
    } else {
      payload.data0 = buffer.toString("hex");
      payload.data1 = "";
      payload.data2 = "";
      payload.data3 = "";
      payload.data4 = "";
    }
    return payload;
  }

  async mintP2TRNote(
    payload: NotePayload,
    toAddress?: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feeRate?: number,
  ) {
    if (undefined === noteUtxo) {
      let noteUtxos = await this.urchain.utxos([
        this.addressP2TRNote.scriptHash,
      ]);
      if (noteUtxos.length === 0) {
        await this.send([
          { address: this.addressP2TRNote.address!, satoshis: MIN_SATOSHIS },
        ]);
        noteUtxos = await this.urchain.utxos([this.addressP2TRNote.scriptHash]);
      }
      noteUtxo = noteUtxos[0]!;
      noteUtxo.type = "P2TR-NOTE";
    }
    if (undefined === toAddress) {
      toAddress = this.addressP2TRNote.address!;
    }
    const to: ISendToAddress = {
      address: toAddress,
      satoshis: MIN_SATOSHIS,
    };

    if (undefined === payUtxos) {
      payUtxos = await this.urchain.utxos([
        this.addressP2WPKH.scriptHash,
      ]);
      for (const utxo of payUtxos) {
        utxo.type = "P2WPKH";
      }
    }
    if (undefined === feeRate) {
      feeRate = (await this.urchain.getFeePerKb()).avgFee;
    }
    const network =
      bitcoinjs.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ];

    const privateKeyBuffer = new PrivateKey(
      this.currentAccount.privateKey,
    ).toBuffer();
    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

    const estimatedPsbt = createP2TRNotePsbt(
      privateKey,
      payload,
      noteUtxo,
      payUtxos,
      to,
      this.addressP2WPKH.address!,
      network,
      feeRate,
      1000,
    );

    const estimatedSize = estimatedPsbt.virtualSize();
    const realFee = Math.floor((estimatedSize * feeRate) / 1000 + 1);
    const finalTx = createP2TRNotePsbt(
      privateKey,
      payload,
      noteUtxo,
      payUtxos,
      to,
      this.addressP2WPKH.address!,
      network,
      feeRate,
      realFee,
    );
    return {
      toAddress,
      noteUtxo,
      payUtxos,
      txId: finalTx.getId(),
      txHex: finalTx.toHex(),
      feeRate,
    };
  }

  async tokenBalance(address: string, tick: string) {
    const { scriptHash } = mapAddressToScriptHash(address, this.config.network);
    const balance = await this.urchain.tokenBalance(scriptHash, tick);
    return balance;
  }

}
