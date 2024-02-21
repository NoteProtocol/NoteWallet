import * as msgpack from "@msgpack/msgpack";
import { HDPrivateKey } from "bitcore-lib";
import Mnemonic from "bitcore-mnemonic";

import type {
  IAddressObject,
  IBroadcastResult,
  ICoinConfig,
  ISendToAddress,
  ITransaction,
  IUtxo,
  IWalletAccount,
  NotePayload,
} from "./types";
import { Urchain } from "./urchain";

export abstract class Wallet {
  public config: ICoinConfig;
  protected mnemoic!: Mnemonic;
  protected lang!: string;
  protected urchain!: Urchain;
  protected rootHDPrivateKey!: HDPrivateKey;

  protected accoutIndex = 0;
  protected currentAccount!: IWalletAccount;
  mainAddress!: IAddressObject;
  extraAddressList: IAddressObject[] = [];
  tokenAddress!: IAddressObject;
  otherTokenAddressList: IAddressObject[] = [];

  constructor(
    mnemonic: string | undefined,
    config: ICoinConfig,
    lang = "ENGLISH",
  ) {
    this.config = config;
    this.lang = lang;
    this.urchain = new Urchain(config.urchain.host, config.urchain.apiKey);
    if (mnemonic) {
      this.importMnemonic(mnemonic, lang);
    } else {
      const mnemonicStr = new Mnemonic().toString();
      this.importMnemonic(mnemonicStr, "ENGLISH");
    }
    // this.urchain.health(); //.then((res) => console.log(res));
  }

  get explorer() {
    return this.config.explorer[0];
  }

  async fetchScriptHash(scriptHash) {
    return await this.urchain.refresh(scriptHash);
  }

  abstract showUtxos();

  abstract info();

  abstract reset();

  protected importMnemonic(mnemonicStr: string, lang = "ENGLISH"): void {
    this.mnemoic = new Mnemonic(mnemonicStr, Mnemonic.Words[lang]);

    const seed = this.mnemoic.toSeed();
    const rootKey = HDPrivateKey.fromSeed(seed, this.config.network);
    this.rootHDPrivateKey = rootKey.deriveChild(this.config.path, false);
    this.currentAccount = this.createAccount(this.accoutIndex);
  }

  protected createAccount(index: number): IWalletAccount {
    const newAccount = (change: boolean, i: number) => {
      const extPath = `m/${change ? 1 : 0}/${i}`;
      const childHDKey = this.rootHDPrivateKey.deriveChild(extPath, false);
      return {
        change,
        rootPath: this.config.path,
        extPath,
        xpriv: childHDKey.toString(),
        privateKey: childHDKey.privateKey.toWIF(),
        publicKey: childHDKey.publicKey.toString("hex"),
        addressList: [],
      };
    };
    return newAccount(false, index);
  }

  abstract getBalance(): Promise<{
    mainAddress: {
      confirmed: bigint;
      unconfirmed: bigint;
    };
    tokenAddress: {
      confirmed: bigint;
      unconfirmed: bigint;
    };
  }>;

  abstract send(toAddresses: ISendToAddress[]): Promise<IBroadcastResult>;

  abstract buildN20Transaction(
    payload: NotePayload,
    to?: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feeRate?: number,
  ): Promise<ITransaction>;

  async broadcastTransaction(tx: ITransaction): Promise<IBroadcastResult> {
    return await this.urchain.broadcast(tx.txHex);
  }

  async mint(payload: NotePayload, toAddress?: string) {
    const tx = await this.buildN20Transaction(payload, toAddress);
    return await this.broadcastTransaction(tx);
  }

  buildN20Payload(data: string | object) {
    const encodedData = msgpack.encode(data, {
      sortKeys: true,
      useBigInt64: true,
    });
    console.log(msgpack.decode(encodedData), {
      useBigInt64: true,
    });
    const buffer = Buffer.from(encodedData);
    const payload: NotePayload = {
      data0: buffer.toString('hex'),
      data1: "",
      data2: "",
      data3: "",
      data4: "",
    };
    return payload;
  }

  abstract fetch(address: string);

  abstract tokenBalance(address: string, tick: string);

  async mintText(text: string) {
    return this.mint(this.buildN20Payload(text));
  }

  async deployToken(
    tick: string,
    max: bigint,
    lim: bigint,
    dec = 8,
    sch?: string,
  ) {
    const data = {
      p: "n20",
      op: "deploy",
      tick,
      max,
      lim,
      dec,
      ...(sch ? { sch } : {}),
    };

    return this.mint(this.buildN20Payload(data));
  }

  async mintToken(tick: string, amt: bigint) {
    const data = {
      p: "n20",
      op: "mint",
      tick,
      amt,
    };

    return this.mint(this.buildN20Payload(data));
  }
  async sendToken(to: string, tick: string, amt: bigint) {
    const data = {
      p: "n20",
      op: "transfer",
      tick,
      amt,
    };

    return this.mint(this.buildN20Payload(data), to);
  }

  async tokenList() {
    const results = await this.urchain.tokenList(this.tokenAddress.scriptHash);
    return results;
  }

  async bestBlock() {
    const results = await this.urchain.bestBlock();
    return results;
  }

  async allTokens() {
    const results = await this.urchain.allTokens();
    return results;
  }

  async tokenInfo(tick: string) {
    const result = await this.urchain.tokenInfo(tick);
    return result;
  }
}
