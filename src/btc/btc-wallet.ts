import mempoolJS from "@mempool/mempool.js";
import * as msgpack from "@msgpack/msgpack";
//@ts-ignore
import {HDPublicKey, PrivateKey, PublicKey} from "bitcore-lib";

import type {
  ICoinConfig,
  ISendToAddress,
  ISendToScript,
  ITokenUtxo,
  ITransaction,
  IUpN20Data,
  IUtxo,
  IWalletAccount,
  NotePayload,
} from "../types";
import {mapAddressToScriptHash} from "../address";
import {MIN_SATOSHIS} from "../config";
import {
  MAX_SCRIPT_ELEMENT_SIZE,
  MAX_SCRIPT_FULL_SIZE,
  MAX_STACK_FULL_SIZE,
  MAX_STANDARD_STACK_ITEM_SIZE,
} from "../constants";
import {sleep, splitBufferIntoSegments} from "../utils";
import {Wallet} from "../wallet";
import {
  generateP2TRCommitNoteAddress,
  generateP2TRNoteAddress,
  generateP2TRNoteAddressV1,
  generateP2WPHKAddress,
} from "./btc-address";
import {createCoinPsbt} from "./btc-coin-tx";
import {bitcoin, ECPair} from "./btc-ecc";
import {createP2TRCommitNotePsbt} from "./btc-p2tr-commit-note";
import {createP2TRNotePsbt} from "./btc-p2tr-note";
import {createP2TRNotePsbtV1} from "./btc-p2tr-note-v1";

export class BTCWallet extends Wallet {
  constructor(
    mnemonic: string | undefined,
    config: ICoinConfig,
    lang = "ENGLISH"
  ) {
    super(mnemonic, config, lang);
  }

  info() {
    return {
      coin: "BTC",
      mnemoic: this.mnemoic.toString(),
      lang: this.lang,
      network: this.config.network,
      rootXpriv: this.xpriv,
      rootXpub: this.xpub,
      urchain: this.config.urchain,
      ...(this.config.faucets ? {faucets: this.config.faucets} : {}),
      rootPath: this.rootPath,
      currentAccount: this.currentAccount,
    };
  }

  protected createAccount(
    rootPath: string,
    index: number,
    target = 0
  ): IWalletAccount {
    const account = super.createAccount(rootPath, index, target);
    const privateKeyBuffer = new PrivateKey(account.privateKey).toBuffer();
    const publicKeyBuffer = new PublicKey(account.publicKey).toBuffer();

    const xOnlyPubkey = publicKeyBuffer.slice(1, 33);

    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);
    const tweakedPrivateKey = privateKey.tweak(
      bitcoin.crypto.taggedHash("TapTweak", xOnlyPubkey)
    );

    account.tweakedPrivateKey = tweakedPrivateKey.toWIF();
    account.xOnlyPubkey = xOnlyPubkey.toString("hex");

    const network =
      bitcoin.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ];
    const addressP2WPKH = generateP2WPHKAddress(
      Buffer.from(account.publicKey, "hex"),
      network
    );
    account.mainAddress = addressP2WPKH;

    const addressP2TRNote = generateP2TRNoteAddress(
      Buffer.from(account.publicKey, "hex"),
      network
    );
    account.tokenAddress = addressP2TRNote;

    const addressP2TRNoteV1 = generateP2TRNoteAddressV1(
      Buffer.from(account.publicKey, "hex"),
      network
    );
    account.addressP2TRNoteV1 = addressP2TRNoteV1;

    return account;
  }

  async getBalance() {
    const p2wpkh = await this.urchain.balance(
      this.currentAccount.mainAddress!.scriptHash
    );
    const p2trnode = await this.urchain.balance(
      this.currentAccount.tokenAddress!.scriptHash
    );
    return {
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
    const utxos = await this.fetchAllAccountUtxos();
    const feeRate = await this.getFeePerKb();
    const network =
      bitcoin.networks[
        this.config.network === "testnet" ? "testnet" : "bitcoin"
      ];

    const privateKeyBuffer = new PrivateKey(
      this.currentAccount.privateKey
    ).toBuffer();
    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

    const estimatedPsbt = createCoinPsbt(
      privateKey,
      utxos,
      toAddresses,
      this.currentAccount.mainAddress!.address!,
      network,
      feeRate.avgFee,
      1000
    );

    const estimatedSize = estimatedPsbt.virtualSize();
    const realFee = Math.floor((estimatedSize * feeRate.avgFee) / 1000 + 1);
    const finalTx = createCoinPsbt(
      privateKey,
      utxos,
      toAddresses,
      this.currentAccount.mainAddress!.address!,
      network,
      feeRate.avgFee,
      realFee
    );
    return await this.urchain.broadcast(finalTx.toHex());
  }

  async buildN20Transaction(
    payload: NotePayload,
    toAddresses: ISendToAddress[] | ISendToScript[],
    noteUtxos: IUtxo[],
    payUtxos?: IUtxo[],
    feeRate?: number
  ): Promise<ITransaction> {
    return this.mintP2TRNote(
      payload,
      toAddresses,
      noteUtxos,
      payUtxos,
      feeRate
    );
  }

  buildN20Payload(data: string | object, useScriptSize = false) {
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
    } else if (useScriptSize && buffer.length <= MAX_SCRIPT_FULL_SIZE) {
      dataList = splitBufferIntoSegments(buffer, MAX_SCRIPT_ELEMENT_SIZE);
    } else {
      throw new Error("data is too long");
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
    tokenAddresses: ISendToAddress[] | ISendToScript[],
    noteUtxos: IUtxo[],
    payUtxos?: IUtxo[],
    feeRate?: number
  ) {
    if (undefined === payUtxos) {
      payUtxos = await this.fetchAllAccountUtxos();
    }
    if (undefined === feeRate) {
      feeRate = (await this.getFeePerKb()).avgFee;
    }
    const network =
      bitcoin.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ];

    const privateKeyBuffer = new PrivateKey(
      this.currentAccount.privateKey
    ).toBuffer();
    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

    const estimatedPsbt = createP2TRNotePsbt(
      privateKey,
      payload,
      noteUtxos,
      payUtxos,
      tokenAddresses as ISendToAddress[],
      this.currentAccount.mainAddress!.address!,
      network,
      feeRate,
      1000
    );

    const estimatedSize = estimatedPsbt.virtualSize();
    const realFee = Math.floor((estimatedSize * feeRate) / 1000 + 1);
    const finalTx = createP2TRNotePsbt(
      privateKey,
      payload,
      noteUtxos,
      payUtxos,
      tokenAddresses as ISendToAddress[],
      this.currentAccount.mainAddress!.address!,
      network,
      feeRate,
      realFee
    );

    return {
      noteUtxos,
      payUtxos,
      txId: finalTx.getId(),
      txHex: finalTx.toHex(),
      feeRate,
    };
  }

  private commitPayloadAddress(payload: NotePayload) {
    const address = generateP2TRCommitNoteAddress(
      payload,
      Buffer.from(this.currentAccount.publicKey, "hex"),
      bitcoin.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ]
    );
    return address;
  }

  async buildN20PayloadTransaction(
    payload: NotePayload,
    toAddress?: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feeRate?: number
  ) {
    if (undefined === noteUtxo) {
      const commitAddress = this.currentAccount.tokenAddress!;
      let noteUtxos = await this.urchain.utxos([commitAddress.scriptHash]);
      if (noteUtxos.length === 0) {
        const result = await this.send([
          {address: commitAddress.address!, amount: MIN_SATOSHIS},
        ]);
        if (result.success) {
          for (let i = 0; i < 10; i++) {
            noteUtxos = await this.urchain.utxos([commitAddress.scriptHash]);
            if (noteUtxos.length > 0) {
              break;
            } else if (i === 9) {
              throw new Error("can not get commit note utxo");
            }
            await sleep(1000);
          }
        } else {
          throw new Error(result.error);
        }
      }
      noteUtxo = noteUtxos[0]!;
      noteUtxo.type = "P2TR-NOTE";
    }
    if (payUtxos === undefined) {
      payUtxos = await this.fetchAllAccountUtxos();
      payUtxos = payUtxos?.filter(
        (utxo) => utxo.scriptHash !== noteUtxo!.scriptHash
      );
    }
    const result = await this.buildN20Transaction(
      payload,
      [{address: toAddress!, amount: MIN_SATOSHIS}],
      [noteUtxo],
      payUtxos,
      feeRate
    );

    return {
      ...result,
      noteUtxo: result.noteUtxos ? result.noteUtxos[0] : undefined,
    };
  }

  async buildCommitPayloadTransaction(
    payload: NotePayload,
    toAddress?: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feeRate?: number
  ) {
    const commitAddress = this.commitPayloadAddress(payload);
    if (undefined === noteUtxo) {
      let noteUtxos = await this.urchain.utxos([commitAddress.scriptHash]);
      if (noteUtxos.length === 0) {
        const result = await this.send([
          {address: commitAddress.address!, amount: MIN_SATOSHIS},
        ]);
        if (result.success) {
          for (let i = 0; i < 10; i++) {
            noteUtxos = await this.urchain.utxos([commitAddress.scriptHash]);
            if (noteUtxos.length > 0) {
              break;
            } else if (i === 9) {
              throw new Error("can not get commit note utxo");
            }
            await sleep(1000);
          }
        } else {
          throw new Error(result.error);
        }
      }
      noteUtxo = noteUtxos[0]!;
      noteUtxo.type = "P2TR-COMMIT-NOTE";
    }
    if (undefined === toAddress) {
      toAddress = this.currentAccount.tokenAddress!.address!;
    }
    const to: ISendToAddress = {
      address: toAddress!,
      amount: MIN_SATOSHIS,
    };

    if (undefined === payUtxos) {
      payUtxos = await this.fetchAllAccountUtxos();
    }
    if (undefined === feeRate) {
      feeRate = (await this.getFeePerKb()).avgFee;
    }
    const network =
      bitcoin.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ];

    const privateKeyBuffer = new PrivateKey(
      this.currentAccount.privateKey
    ).toBuffer();
    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

    const estimatedPsbt = createP2TRCommitNotePsbt(
      privateKey,
      payload,
      noteUtxo,
      payUtxos,
      to,
      this.currentAccount.mainAddress!.address!,
      network,
      feeRate,
      1000
    );

    const estimatedSize = estimatedPsbt.virtualSize();
    const realFee = Math.floor((estimatedSize * feeRate) / 1000 + 1);
    const finalTx = createP2TRCommitNotePsbt(
      privateKey,
      payload,
      noteUtxo,
      payUtxos,
      to,
      this.currentAccount.mainAddress!.address!,
      network,
      feeRate,
      realFee
    );
    return {
      noteUtxo: noteUtxo,
      payUtxos,
      txId: finalTx.getId(),
      txHex: finalTx.toHex(),
      feeRate,
    };
  }

  async tokenList() {
    const resultsV1 = await this.urchain.tokenList(
      this.currentAccount.addressP2TRNoteV1.scriptHash
    );
    const results = await this.urchain.tokenList(
      this.currentAccount.tokenAddress!.scriptHash
    );

    return [...resultsV1, ...results];
  }

  async mintP2TRNoteV1(payload: NotePayload, to: string, noteUtxos?: IUtxo[]) {
    if (undefined === noteUtxos) {
      noteUtxos = await this.urchain.utxos([
        this.currentAccount.addressP2TRNoteV1.scriptHash,
      ]);
      if (noteUtxos.length === 0) {
        const result = await this.send([
          {
            address: this.currentAccount.addressP2TRNoteV1.address!,
            amount: MIN_SATOSHIS,
          },
        ]);
        if (result.success) {
          for (let i = 0; i < 10; i++) {
            noteUtxos = await this.urchain.utxos([
              this.currentAccount.addressP2TRNoteV1.scriptHash,
            ]);
            if (noteUtxos.length > 0) {
              break;
            } else if (i === 9) {
              throw new Error("can not get note utxo");
            }
            await sleep(1000);
          }
        } else {
          throw new Error(result.error);
        }
      }
      for (const utxo of noteUtxos) {
        utxo.type = "P2TR-NOTE-V1";
      }
    }
    if (undefined === to) {
      to = this.currentAccount.tokenAddress!.address!;
    }
    const toAddress: ISendToAddress = {
      address: to,
      amount: MIN_SATOSHIS,
    };
    const toAddresses = [toAddress];

    const payUtxos = await this.fetchAllAccountUtxos();

    const feeRate = (await this.getFeePerKb()).avgFee;

    const network =
      bitcoin.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ];

    const privateKeyBuffer = new PrivateKey(
      this.currentAccount.privateKey
    ).toBuffer();
    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

    const estimatedPsbt = createP2TRNotePsbtV1(
      privateKey,
      payload,
      noteUtxos,
      payUtxos,
      toAddresses as ISendToAddress[],
      this.currentAccount.mainAddress!.address!,
      network,
      feeRate,
      1000
    );

    const estimatedSize = estimatedPsbt.virtualSize();
    const realFee = Math.floor((estimatedSize * feeRate) / 1000 + 1);
    const finalTx = createP2TRNotePsbtV1(
      privateKey,
      payload,
      noteUtxos,
      payUtxos,
      toAddresses as ISendToAddress[],
      this.currentAccount.mainAddress!.address!,
      network,
      feeRate,
      realFee
    );

    return {
      noteUtxos,
      payUtxos,
      txId: finalTx.getId(),
      txHex: finalTx.toHex(),
      feeRate,
    };
  }

  async upN20(tick: string) {
    const upData: IUpN20Data = {
      p: "n20",
      op: "up",
      tick,
      v: 1n,
    };

    const to = this.currentAccount.tokenAddress!.address!;

    const tx = await this.mintP2TRNoteV1(this.buildN20Payload(upData), to);
    return await this.broadcastTransaction(tx);
  }

  async getFeePerKb() {
    const {
      bitcoin: {fees},
    } = mempoolJS({
      hostname:
        this.config.network === "testnet"
          ? "mempool.space/testnet4"
          : "mempool.space",
    });

    const feesRecommended = await fees.getFeesRecommended();
    return {
      slowFee:
        Math.min(feesRecommended.hourFee, feesRecommended.halfHourFee) * 1000,
      avgFee:
        Math.max(feesRecommended.hourFee, feesRecommended.halfHourFee) * 1000,
      fastFee:
        Math.max(
          feesRecommended.hourFee,
          feesRecommended.halfHourFee,
          feesRecommended.fastestFee
        ) * 1000,
    };
  }
}
