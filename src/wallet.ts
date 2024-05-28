import * as msgpack from "@msgpack/msgpack";
import * as bitcore from "bitcore-lib";
import Mnemonic from "bitcore-mnemonic";

import type {
  IBroadcastResult,
  ICoinConfig,
  ISendToAddress,
  ISendToScript,
  ITokenUtxo,
  ITransaction,
  ITransferN20Data,
  IUtxo,
  IWalletAccount,
  NotePayload,
} from "./types";
import {MIN_SATOSHIS} from "./config";
import {Urchain} from "./urchain";

export abstract class Wallet {
  public config: ICoinConfig;
  protected mnemoic!: Mnemonic;
  protected lang!: string;
  protected urchain!: Urchain;
  protected rootHDPrivateKey!: bitcore.HDPrivateKey;

  private _accoutIndex = 0;
  currentAccount!: IWalletAccount;
  accountCollection: Record<string, IWalletAccount> = {};

  constructor(
    mnemonic: string | undefined,
    config: ICoinConfig,
    lang = "ENGLISH"
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
    this.urchain.health(); //.then((res) => console.log(res));
    this.generateAccounts(10);
  }

  get explorer() {
    return this.config.explorer[0]!;
  }
  get rootPath() {
    return this.config.path;
  }
  get xpriv() {
    return this.rootHDPrivateKey.toString();
  }
  get xpub() {
    return this.rootHDPrivateKey.hdPublicKey.toString();
  }

  get accoutIndex() {
    return this._accoutIndex;
  }

  protected importMnemonic(mnemonicStr: string, lang = "ENGLISH"): void {
    this.mnemoic = new Mnemonic(mnemonicStr, Mnemonic.Words[lang]);

    const seed = this.mnemoic.toSeed();
    this.rootHDPrivateKey = bitcore.HDPrivateKey.fromSeed(
      seed,
      this.config.network
    );
    this.currentAccount = this.createAccount(this.rootPath, this.accoutIndex);
  }

  protected createAccount(
    rootPath: string,
    index: number,
    target = 0
  ): IWalletAccount {
    const extPath = `m/${target}/${index}`;
    const rootHDKey = this.rootHDPrivateKey.deriveChild(rootPath, false);
    const childHDKey = rootHDKey.deriveChild(extPath, false);

    const account = {
      target,
      index,
      extPath,
      xpub: rootHDKey.hdPublicKey.toString(),
      privateKey: childHDKey.privateKey.toWIF(),
      publicKey: childHDKey.publicKey.toString("hex"),
    };

    this.accountCollection[`${rootPath}/${target}/${index}`] = account;
    return account;
  }

  switchAccount(index: number) {
    this._accoutIndex = index;
    const existAccount = this.accountCollection[`${this.rootPath}/0/${index}`];
    if (existAccount) {
      this.currentAccount = existAccount;
    } else {
      this.currentAccount = this.createAccount(this.rootPath, index);
    }
    return this.currentAccount;
  }

  generateSpecAccounts(rootPath: string, n: number, target = 0) {
    for (let i = 0; i < n; i++) {
      this.createAccount(rootPath, i, target);
    }
    return Object.keys(this.accountCollection);
  }

  generateAccounts(n: number, target = 0) {
    return this.generateSpecAccounts(this.rootPath, n, target);
  }

  get mainScriptHashList() {
    return Object.values(this.accountCollection).map(
      (account) => account.mainAddress!.scriptHash
    );
  }

  get tokenScriptHashList() {
    return Object.values(this.accountCollection).map(
      (account) => account.tokenAddress!.scriptHash
    );
  }

  get mainAddressList() {
    return Object.values(this.accountCollection).map(
      (account) => account.mainAddress!.address
    );
  }

  get tokenAddressList() {
    return Object.values(this.accountCollection).map(
      (account) => account.tokenAddress!.address
    );
  }

  async showUtxos() {
    return await this.fetchAllAccountUtxos();
  }

  abstract info(): any;

  async getTokenUtxos(tick: string) {
    const tokenUtxos = await this.urchain.tokenutxos(
      [this.currentAccount.tokenAddress!.scriptHash],
      tick
    );
    if (tokenUtxos.length === 0) {
      throw new Error("No UTXOs found");
    }

    return tokenUtxos;
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

  async fetchAllAccountUtxos() {
    const allScriptHashs: string[] = [];
    const allAccounts = new Map<string, IWalletAccount>();
    for (const account of Object.values(this.accountCollection)) {
      allScriptHashs.push(
        account.mainAddress!.scriptHash,
        account.tokenAddress!.scriptHash
      );
      allAccounts.set(account.mainAddress!.scriptHash, account);
      allAccounts.set(account.tokenAddress!.scriptHash, account);
    }
    const allUtxos: IUtxo[] = await this.urchain.utxos(allScriptHashs);
    for (const utxo of allUtxos) {
      const account = allAccounts.get(utxo.scriptHash);
      if (account) {
        utxo.privateKeyWif = account.privateKey;
        if (utxo.scriptHash === account.mainAddress?.scriptHash) {
          utxo.type = account.mainAddress?.type;
        }
        if (utxo.scriptHash === account.tokenAddress?.scriptHash) {
          utxo.type = account.tokenAddress?.type;
        }
      }
    }
    return allUtxos;
  }

  abstract send(toAddresses: ISendToAddress[]): Promise<IBroadcastResult>;

  abstract buildN20Transaction(
    payload: NotePayload,
    tokenAddresses?: ISendToAddress[] | ISendToScript[],
    noteUtxos?: IUtxo[],
    payUtxos?: IUtxo[],
    feeRate?: number
  ): Promise<ITransaction>;

  abstract buildN20PayloadTransaction(
    payload: NotePayload,
    toAddress?: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feeRate?: number
  ): Promise<ITransaction>;

  abstract buildCommitPayloadTransaction(
    payload: NotePayload,
    toAddress: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feeRate?: number
  ): Promise<ITransaction>;

  async broadcastTransaction(tx: ITransaction): Promise<IBroadcastResult> {
    return await this.urchain.broadcast(tx.txHex);
  }

  async mint(payload: NotePayload, _toAddress?: string) {
    const tx = await this.buildN20Transaction(payload);
    return await this.broadcastTransaction(tx);
  }

  buildN20Payload(data: string | object, useScriptSize = false) {
    const encodedData = msgpack.encode(data, {
      sortKeys: true,
      useBigInt64: true,
    });
    console.log(msgpack.decode(encodedData), {
      useBigInt64: true,
    });
    const buffer = Buffer.from(encodedData);
    const payload: NotePayload = {
      data0: buffer.toString("hex"),
      data1: "",
      data2: "",
      data3: "",
      data4: "",
    };
    return payload;
  }

  async mintText(text: string) {
    return this.mint(this.buildN20Payload(text));
  }

  async sendToken(toAddress: string, tick: string, amt: bigint) {
    const tokenUtxos = await this.getTokenUtxos(tick);
    const missedTokenUtxos = await this.urchain.tokenutxos(
      [this.currentAccount.mainAddress!.scriptHash],
      tick
    );
    const missedBalance = missedTokenUtxos.reduce(
      (acc: bigint, cur: ITokenUtxo) => acc + BigInt(cur.amount),
      0n
    );
    const balance =
      missedBalance +
      tokenUtxos.reduce(
        (acc: bigint, cur: ITokenUtxo) => acc + BigInt(cur.amount),
        0n
      );
    if (balance < amt) {
      throw new Error("Insufficient balance");
    }
    const toAddresses: ISendToAddress[] = [
      {
        address: toAddress,
        amount: MIN_SATOSHIS,
      },
    ];
    if (balance > BigInt(amt)) {
      toAddresses.push({
        address: this.currentAccount.tokenAddress!.address!,
        amount: MIN_SATOSHIS,
      });
    }
    const transferData: ITransferN20Data = {
      p: "n20",
      op: "transfer",
      tick,
      amt,
    };

    const payUtxos: IUtxo[] = await this.fetchAllAccountUtxos();
    if (missedTokenUtxos.length > 0) {
      payUtxos.push(
        ...missedTokenUtxos.map((utxo: IUtxo) => {
          utxo.privateKeyWif = this.currentAccount.privateKey;
          utxo.type = this.currentAccount.mainAddress!.type;
          return utxo;
        })
      );
    }

    const tx = await this.buildN20Transaction(
      this.buildN20Payload(transferData),
      toAddresses,
      tokenUtxos,
      payUtxos
    );
    const result = await this.broadcastTransaction(tx);

    return {
      transferData,
      result,
    };
  }

  async tokenList() {
    const results = await this.urchain.tokenList(
      this.currentAccount.tokenAddress!.scriptHash
    );
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

  // eslint-disable-next-line @typescript-eslint/require-await, @typescript-eslint/no-unused-vars
  async upN20(tick: string): Promise<IBroadcastResult> {
    throw new Error("Method not implemented.");
  }

  async getFeePerKb() {
    return await this.urchain.getFeePerKb();
  }
}
