export interface NotePayload {
  data0: string;
  data1: string;
  data2: string;
  data3: string;
  data4: string;
  locktime?: number; //for mint
}

export type AddressType =
  | "P2PKH"
  | "P2PK-NOTE"
  | "P2SH"
  | "P2SH-NOTE"
  | "P2WPKH"
  | "P2WSH"
  | "P2WSH-NOTE"
  | "P2TR"
  | "P2TR-NOTE";

export interface IAddressObject {
  address?: string;
  script?: string;
  scriptHash: string;
  type: AddressType;
}

export interface IWalletAccount {
  change: boolean; 
  rootPath: string;
  extPath: string;
  xpriv: string;
  privateKey: string;
  publicKey: string;
  tweakedPrivateKey?: string;
  xOnlyPubkey?: string;
  addressList: IAddressObject[];
}

export interface IScriptObject {
  address?: string;
  script: string;
  scriptHash: string;
  type: AddressType;
}

export interface ITransaction {
  toAddress: string;
  txId: string;
  txHex: string;
  noteUtxo?: IUtxo;
  payUtxos?: IUtxo[];
  feeRate?: number;
}

export interface IUtxo {
  txId: string;
  outputIndex: number;
  satoshis: number;
  script: string;
  type: AddressType;
  txHex?: string;
}

export interface ISendToScript {
  script: string;
  satoshis: number;
}
export interface ISendToAddress {
  address: string;
  satoshis: number;
}

export interface IFees {
  slowFee: number; //about 1 hour, Satoshis/KB
  avgFee: number; //about 30 minutes
  fastFee: number; //about 10 minutes
}

export interface ICoinConfig {
  name: string;
  symbol: string;
  decimal: number;
  path: string;
  baseSymbol: string;
  network: "livenet" | "testnet";
  explorer: {
    homepage: string;
    tx: string;
    address: string;
    block: string;
    blockheight: string;
  }[];
  P2SH: boolean;
  P2PKH: boolean;
  P2WSH: boolean;
  P2TR: boolean;
  minDustThreshold: number;
  bip21: string;
  urchain: {
    host: string;
    apiKey: string;
  };
}

export interface IBroadcastResult {
  success: boolean;
  txId?: string;
  error?: any;
}

export interface IToken {
  tick: string;
  confirmed: bigint;
  unconfirmed: bigint;
}
