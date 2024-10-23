import * as bitcore from "bitcore-lib";
import Mnemonic from "bitcore-mnemonic";

import type {
  IBalance,
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
import {MIN_SATOSHIS} from "./constants";
import {buildNotePayload} from "./note";
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

  // Create account
  createAccount(
    rootPath: string = this.rootPath,
    index: number = 0,
    target = 0
  ): IWalletAccount {
    const key = `${this.rootPath}/${target}/${index}`;
    // If the account already exists, no need to create it again, just return the existing account
    const existAccount = this.accountCollection[key];
    if (existAccount) {
      return existAccount;
    }
    // Generating an account is time-consuming
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
      network: this.config.network,
    };

    this.accountCollection[key] = account;
    return account;
  }

  // Generate multiple accounts with specified rootPath
  generateSpecAccounts(rootPath: string, n: number, target = 0) {
    for (let i = 0; i < n; i++) {
      this.createAccount(rootPath, i, target);
    }
    return Object.keys(this.accountCollection);
  }

  // Generate multiple accounts
  generateAccounts(n: number, target = 0) {
    return this.generateSpecAccounts(this.rootPath, n, target);
  }

  // Switch account
  switchAccount(index: number) {
    this._accoutIndex = index;
    this.currentAccount = this.createAccount(this.rootPath, index);
    return this.currentAccount;
  }

  get mainScriptHashList() {
    // Get all scriptHashes in accountCollection
    return Object.values(this.accountCollection).map(
      (account) => account.mainAddress!.scriptHash
    );
  }

  get tokenScriptHashList() {
    // Get all scriptHashes in accountCollection
    return Object.values(this.accountCollection).map(
      (account) => account.tokenAddress!.scriptHash
    );
  }

  get mainAddressList() {
    // Get all main addresses in accountCollection
    return Object.values(this.accountCollection).map(
      (account) => account.mainAddress!.address!
    );
  }

  get tokenAddressList() {
    // Get all Token addresses in accountCollection
    return Object.values(this.accountCollection).map(
      (account) => account.tokenAddress!.address!
    );
  }

  async showUtxos() {
    return await this.fetchAllAccountUtxos();
  }

  abstract info(): any;
  abstract refresh(): any;

  async getTokenUtxos(tick: string, amount?: bigint) {
    const tokenUtxos = await this.urchain.tokenutxos(
      [this.currentAccount.tokenAddress!.scriptHash],
      tick,
      amount
    );
    if (tokenUtxos.length === 0) {
      throw new Error("No UTXOs found");
    }

    return tokenUtxos;
  }

  // Get Satoshi balance of the current account
  async getBalance(): Promise<{
    mainAddress: IBalance;
    tokenAddress: IBalance;
  }> {
    const walletBalace = await this.fetchWalletBalace();
    const tokenBalance = await this.urchain.balance(
      this.currentAccount.tokenAddress!.scriptHash
    );
    return {
      mainAddress: walletBalace,
      tokenAddress: tokenBalance,
    };
  }

  // Get balance of all accounts
  async fetchWalletBalace() {
    // Get all scriptHashes in accountCollection
    const allScriptHashs: string[] = Object.values(this.accountCollection).map(
      (account) => account.mainAddress!.scriptHash
    );

    const balance = await this.urchain.walletBalance(allScriptHashs);
    return balance;
  }

  // Get UTXOs of all accounts
  async fetchAllAccountUtxos(includeUnbondedTokenUtxos = false) {
    const allScriptHashs: string[] = [];
    const allAccounts = new Map<string, IWalletAccount>();
    for (const account of Object.values(this.accountCollection)) {
      allScriptHashs.push(account.mainAddress!.scriptHash);
      allAccounts.set(account.mainAddress!.scriptHash, account);
      // In blockchain development, it's not uncommon for users to accidentally send small
      // amounts of Bitcoin (satoshis) to token addresses. To recover these funds, there's an
      // option that allows you to access the related Unspent Transaction Outputs (UTXOs). But
      // beware! Enabling this feature could lead to unintended spending of your tokens. Always
      // double-check before proceeding!
      if (includeUnbondedTokenUtxos) {
        allScriptHashs.push(account.tokenAddress!.scriptHash);
        allAccounts.set(account.tokenAddress!.scriptHash, account);
      }
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

  sendEstimate(
    toAddresses: ISendToAddress[],
    feePerKb?: number
  ): Promise<number> {
    throw new Error("Method not implemented.");
  }

  // Send to address
  abstract send(
    toAddresses: ISendToAddress[],
    feePerKb?: number
  ): Promise<IBroadcastResult>;

  protected abstract buildNoteTransaction(
    payload: NotePayload,
    tokenAddresses?: ISendToAddress[] | ISendToScript[],
    noteUtxos?: IUtxo[],
    payUtxos?: IUtxo[],
    feePerKb?: number
  ): Promise<ITransaction>;

  abstract buildEmptyTokenUTXO(): Promise<IUtxo>;

  abstract buildPayloadTransaction(
    data: any,
    toAddress?: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feePerKb?: number,
    locktime?: number,
    extOutputs?: ISendToAddress[]
  ): Promise<ITransaction>;

  abstract buildCommitDataTransaction(
    data: any,
    toAddress: string,
    noteUtxo?: IUtxo,
    payUtxos?: IUtxo[],
    feePerKb?: number
  ): Promise<ITransaction>;

  async broadcastTransaction(tx: {txHex: string}): Promise<IBroadcastResult> {
    return await this.urchain.broadcast(tx.txHex);
  }

  async mint(payload: NotePayload, toAddress?: string) {
    //NOTICE:注意，这里的toAddress未使用
    const tx = await this.buildNoteTransaction(payload);
    return await this.broadcastTransaction(tx);
  }

  abstract fetch(address: string): any;

  abstract tokenBalance(address: string, tick: string): any;

  balance(address: string): Promise<IBalance> {
    return Promise.resolve({
      confirmed: 0n,
      unconfirmed: 0n,
    });
  }

  async mintText(text: string) {
    return this.mint(buildNotePayload(text));
  }

  async sendTokenCommon(toAddress: string, tick: string, amt: bigint) {
    const tokenUtxos = await this.getTokenUtxos(tick, amt);
    const balance = tokenUtxos.reduce(
      (acc: bigint, cur: ITokenUtxo) => acc + BigInt(cur.amount),
      0n
    );
    if (balance < amt) {
      throw new Error("Insufficient balance");
    }
    //如果有误发到主地址的Token，那么可以挽救
    const missedTokenUtxos = await this.urchain.tokenutxos(
      [this.currentAccount.mainAddress!.scriptHash],
      tick
    );
    const toAddresses: ISendToAddress[] = [
      {
        address: toAddress,
        amount: MIN_SATOSHIS,
      },
    ];
    if (balance > BigInt(amt) || missedTokenUtxos.length > 0) {
      //如果有余量，那么添加找零地址toAddresses
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

    return {
      payload: buildNotePayload(transferData),
      toAddresses,
      tokenUtxos,
      payUtxos,
    };
  }

  async sendTokenEstimate(
    toAddress: string,
    tick: string,
    amt: bigint,
    feePerKb?: number
  ) {
    const common = await this.sendTokenCommon(toAddress, tick, amt);
    const tx = await this.buildNoteTransaction(
      common.payload,
      common.toAddresses,
      common.tokenUtxos,
      common.payUtxos,
      feePerKb
    );
    return tx.realFee;
  }

  async sendToken(
    toAddress: string,
    tick: string,
    amt: bigint,
    feePerKb?: number
  ) {
    const common = await this.sendTokenCommon(toAddress, tick, amt);
    const tx = await this.buildNoteTransaction(
      common.payload,
      common.toAddresses,
      common.tokenUtxos,
      common.payUtxos,
      feePerKb
    );
    return await this.broadcastTransaction(tx);
  }

  // Transfer N20 contract Token
  async sendTokenToMultiAddresses(tick: string, toAddresses: ISendToAddress[]) {
    const tokenAmounts: bigint[] = [];
    const tokenAddresses: ISendToAddress[] = [];
    // Get Token UTXOs
    const tokenUtxos = await await this.getTokenUtxos(tick);
    const balance = tokenUtxos.reduce(
      (acc: bigint, cur: ITokenUtxo) => acc + BigInt(cur.amount),
      0n
    );
    let total = 0n;
    for (let i = 0; i < toAddresses.length; i++) {
      const amt = BigInt(toAddresses[i]!.amount);
      total += amt;
      tokenAmounts.push(amt);
      tokenAddresses.push({
        address: toAddresses[i]!.address,
        amount: MIN_SATOSHIS,
      });
    }

    if (balance < total) {
      throw new Error("Insufficient balance");
    }

    if (balance > BigInt(total)) {
      tokenAddresses.push({
        address: this.currentAccount.tokenAddress!.address!,
        amount: MIN_SATOSHIS,
      });
    }
    const transferData: ITransferN20Data = {
      p: "n20",
      op: "transfer",
      tick,
      amt: tokenAmounts,
    };

    const tx = await this.buildNoteTransaction(
      buildNotePayload(transferData),
      tokenAddresses,
      tokenUtxos
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
