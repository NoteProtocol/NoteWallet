import mempoolJS from "@mempool/mempool.js";
import {PrivateKey, PublicKey} from "bitcore-lib";

import type {
  ICoinConfig,
  ISendToAddress,
  ISendToScript,
  ITransaction,
  IUpN20Data,
  IUtxo,
  IWalletAccount,
  NotePayload,
} from "../types";
import {mapAddressToScriptHash} from "../address";
import {MIN_SATOSHIS} from "../constants";
import {buildNotePayload} from "../note";
import {sleep} from "../utils";
import {Wallet} from "../wallet";
import {
  generateP2TRCommitDataAddress,
  generateP2TRNoteAddress,
  generateP2TRNoteAddressV1,
  generateP2WPHKAddress,
} from "./btc-address";
import {createCoinPsbt} from "./btc-coin-tx";
import {bitcoin, ECPair} from "./btc-ecc";
import {createP2TRCommitDataPsbt} from "./btc-p2tr-commit-data";
import {createP2TRNotePsbt} from "./btc-p2tr-note";
import {createP2TRNotePsbtV1} from "./btc-p2tr-note-v1";
import {msgpackEncode} from "../msgpack";

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

  createAccount(
    rootPath: string = this.rootPath,
    index: number = 0,
    target = 0
  ): IWalletAccount {
    const account = super.createAccount(rootPath, index, target);
    const privateKeyBuffer = new PrivateKey(account.privateKey).toBuffer();
    const publicKeyBuffer = new PublicKey(account.publicKey).toBuffer();

    const xOnlyPubkey = publicKeyBuffer.slice(1, 33);

    // Used for signing, since the output and address are using a tweaked key
    // We must tweak the signer in the same way.
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

  async sendEstimate(toAddresses: ISendToAddress[], feePerKb?: number) {
    const utxos = await this.fetchAllAccountUtxos();
    feePerKb = feePerKb ?? (await this.getFeePerKb()).avgFee;
    const network =
      bitcoin.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
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
      1000
    );

    const estimatedSize = estimatedPsbt.virtualSize();
    return Math.floor((estimatedSize * feePerKb) / 1000 + 1);
  }

  async send(toAddresses: ISendToAddress[], feePerKb?: number) {
    const utxos = await this.fetchAllAccountUtxos();
    feePerKb = feePerKb ?? (await this.getFeePerKb()).avgFee;
    const network =
      bitcoin.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ];

    const privateKeyBuffer = new PrivateKey(
      this.currentAccount.privateKey
    ).toBuffer();
    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

    const realFee = await this.sendEstimate(toAddresses, feePerKb);

    const finalTx = createCoinPsbt(
      privateKey,
      utxos,
      toAddresses,
      this.currentAccount.mainAddress!.address!,
      network,
      realFee
    );
    return await this.urchain.broadcast(finalTx.toHex());
  }

  protected async buildNoteTransaction(
    payload: NotePayload,
    toAddresses: ISendToAddress[] | ISendToScript[],
    noteUtxos: IUtxo[],
    payUtxos?: IUtxo[],
    feePerKb?: number,
    locktime?: number
  ): Promise<ITransaction> {
    return this.mintP2TRNote(
      payload,
      toAddresses,
      noteUtxos,
      payUtxos,
      feePerKb,
      locktime
    );
  }

  async mintP2TRNote(
    payload: NotePayload,
    tokenAddresses: ISendToAddress[] | ISendToScript[],
    noteUtxos: IUtxo[],
    payUtxos?: IUtxo[],
    feePerKb?: number,
    locktime?: number
  ) {
    payUtxos = payUtxos ?? (await this.fetchAllAccountUtxos());
    feePerKb = feePerKb ?? (await this.getFeePerKb()).avgFee;
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
      1000,
      locktime
    );

    const estimatedSize = estimatedPsbt.virtualSize();
    const realFee = Math.floor((estimatedSize * feePerKb) / 1000 + 1);

    const finalTx = createP2TRNotePsbt(
      privateKey,
      payload,
      noteUtxos,
      payUtxos,
      tokenAddresses as ISendToAddress[],
      this.currentAccount.mainAddress!.address!,
      network,
      realFee,
      locktime
    );

    return {
      txId: finalTx.getId(),
      txHex: finalTx.toHex(),
      psbtHex: estimatedPsbt.toHex(),
      noteUtxos,
      payUtxos,
      feePerKb,
      realFee,
    };
  }

  async fetch(address: string) {
    const {scriptHash} = mapAddressToScriptHash(address, this.config.network);
    await this.urchain.refresh(scriptHash);
    const balance = await this.urchain.balance(scriptHash);
    const utxos = await this.urchain.utxos([scriptHash]);

    return {balance, utxos};
  }

  async balance(address: string) {
    const {scriptHash} = mapAddressToScriptHash(address, this.config.network);
    const balance = await this.urchain.balance(scriptHash);
    return {
      ...balance,
      confirmed: BigInt(balance.confirmed),
      unconfirmed: BigInt(balance.unconfirmed),
      total: BigInt(balance.confirmed) + BigInt(balance.unconfirmed),
    };
  }

  async tokenBalance(address: string, tick: string) {
    const {scriptHash} = mapAddressToScriptHash(address, this.config.network);
    const balance = await this.urchain.tokenBalance(scriptHash, tick);
    return {
      ...balance,
      confirmed: BigInt(balance.confirmed),
      unconfirmed: BigInt(balance.unconfirmed),
      total: BigInt(balance.confirmed) + BigInt(balance.unconfirmed),
    };
  }

  async refresh() {
    await this.urchain.refresh(this.currentAccount.mainAddress!.scriptHash);
    await this.urchain.refresh(this.currentAccount.tokenAddress!.scriptHash);
    return await this.getBalance();
  }

  private commitPayloadAddress(data: Buffer) {
    const address = generateP2TRCommitDataAddress(
      data,
      Buffer.from(this.currentAccount.publicKey, "hex"),
      bitcoin.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ]
    );
    return address;
  }

  async buildEmptyTokenUTXO(): Promise<IUtxo> {
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
    const noteUtxo = noteUtxos[0]!;
    noteUtxo.type = "P2TR-NOTE";
    return noteUtxo;
  }

  async buildPayloadTransaction(
    data: any,
    toAddress?: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feeRate?: number,
    locktime?: number,
    extOutputs?: ISendToAddress[]
  ) {
    const payload = buildNotePayload(data);
    noteUtxo = noteUtxo ?? (await this.buildEmptyTokenUTXO());
    payUtxos = payUtxos ?? (await this.fetchAllAccountUtxos());
    payUtxos = payUtxos?.filter(
      (utxo) => utxo.scriptHash !== noteUtxo!.scriptHash
    );

    const toAddresses: ISendToAddress[] = [
      {address: toAddress!, amount: MIN_SATOSHIS},
    ];

    const result = await this.buildNoteTransaction(
      payload,
      toAddresses.concat(extOutputs ?? []),
      [noteUtxo],
      payUtxos,
      feeRate,
      locktime
    );

    return {
      ...result,
      noteUtxo: result.noteUtxos ? result.noteUtxos[0] : undefined,
    };
  }

  async buildCommitDataTransaction(
    data: any,
    toAddress?: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feePerKb?: number
  ) {
    const msgpackEncodedData = msgpackEncode(data);
    const commitAddress = this.commitPayloadAddress(msgpackEncodedData);
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
      noteUtxo.type = "P2TR-COMMIT-DATA";
    }
    if (undefined === toAddress) {
      toAddress = this.currentAccount.tokenAddress!.address!;
    }
    const to: ISendToAddress = {
      address: toAddress!,
      amount: MIN_SATOSHIS,
    };

    payUtxos = payUtxos ?? (await this.fetchAllAccountUtxos());
    feePerKb = feePerKb ?? (await this.getFeePerKb()).avgFee;
    const network =
      bitcoin.networks[
        this.config.network === "livenet" ? "bitcoin" : "testnet"
      ];

    const privateKeyBuffer = new PrivateKey(
      this.currentAccount.privateKey
    ).toBuffer();
    const privateKey = ECPair.fromPrivateKey(privateKeyBuffer);

    const estimatedPsbt = createP2TRCommitDataPsbt(
      privateKey,
      msgpackEncodedData,
      noteUtxo,
      payUtxos,
      to,
      this.currentAccount.mainAddress!.address!,
      network,
      feePerKb,
      1000
    );

    const estimatedSize = estimatedPsbt.virtualSize();
    const realFee = Math.floor((estimatedSize * feePerKb) / 1000 + 1);

    const finalTx = createP2TRCommitDataPsbt(
      privateKey,
      msgpackEncodedData,
      noteUtxo,
      payUtxos,
      to,
      this.currentAccount.mainAddress!.address!,
      network,
      feePerKb,
      realFee
    );

    return {
      noteUtxo: noteUtxo,
      payUtxos,
      txId: finalTx.getId(),
      txHex: finalTx.toHex(),
      feePerKb,
      realFee,
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

    const tx = await this.mintP2TRNoteV1(buildNotePayload(upData), to);
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
        Math.min(
          //@ts-ignore
          feesRecommended.economyFee,
          feesRecommended.hourFee,
          feesRecommended.halfHourFee
        ) * 1000,
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
