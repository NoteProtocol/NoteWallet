export interface NotePayload {
  data0: string;
  data1: string;
  data2: string;
  data3: string;
  data4: string;
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
  | "P2TR-NOTE-V1"
  | "P2TR-NOTE"
  | "P2TR-COMMIT-DATA"
  | "P2TR-COMMIT-NOTE";

export interface IAddressObject {
  address?: string;
  script?: string;
  scriptHash: string;
  type: AddressType;
}

export interface IWalletAccount {
  target: number; // Purpose, 0: general address, 1: change, 2...
  index: number; // Address number starting from 0
  extPath: string;
  xpub: string;
  privateKey: string;
  publicKey: string;
  tweakedPrivateKey?: string;
  xOnlyPubkey?: string;
  mainAddress?: IAddressObject;
  tokenAddress?: IAddressObject;
  network: string; // livenet/testnet
  [key: string]: any; // Support for any additional properties
}

export interface IScriptObject {
  address?: string;
  script: string;
  scriptHash: string;
  type: AddressType;
}

export interface ITransaction {
  txId: string;
  txHex: string;
  psbtHex?: string;
  noteUtxo?: IUtxo; // Only return one note utxo, usually used in commit note
  noteUtxos?: IUtxo[]; // Return all note utxo, used for token transfer
  payUtxos?: IUtxo[];
  feePerKb: number;
  realFee: number;
}

export interface IUtxo {
  txId: string;
  outputIndex: number;
  satoshis: number;
  script: string;
  scriptHash: string;
  type: AddressType;
  privateKeyWif?: string; // If private key is specified, this utxo uses this private key to sign
  txHex?: string;
  sequence?: number;
}

export type ITokenUtxo = IUtxo & {
  amount: bigint;
};

export interface ISendToScript {
  script: string;
  amount: number | bigint;
}
export interface ISendToAddress {
  address: string;
  amount: number | bigint;
}

// Satoshis/KB, each K byte needs
export interface IFees {
  slowFee: number; // about 1 hour, Satoshis/KB
  avgFee: number; // about 30 minutes
  fastFee: number; // about 10 minutes
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
  faucets?: string[];
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
  hidden?: boolean; // Whether to display in the wallet, if true it means it doesn't need to be displayed
}

export interface IBroadcastResult {
  success: boolean;
  txId?: string;
  error?: any;
}

export interface IBalance {
  confirmed: bigint;
  unconfirmed: bigint;
  total?: bigint;
  scriptHash?: string;
}

export interface IToken {
  tick: string;
  confirmed: bigint;
  unconfirmed: bigint;
  total?: bigint;
  scriptHash: string;
  dec: number;
  p: string;
  needUpgrade?: boolean;
}

export interface IUpN20Data {
  p: "n20";
  op: "up";
  tick: string;
  v: bigint;
}

export interface IBurnN20Data {
  p: "n20";
  op: "burn";
  tick: string; // Token's name
  amt: bigint; // Amount to be destroyed
  [key: string]: any; // Additional parameters
}
export interface IDeployN20Data {
  p: "n20";
  op: "deploy";
  tick: string; // Token's name
  max: bigint; // Total amount of tokens, if 0 it means unlimited issuance
  lim: bigint; // Maximum amount of tokens to be issued per time
  dec: number; // Decimal places
  sch?: string; // Contract's hash value
  [key: string]: any; // Additional parameters, such as start height and mining difficulty
}
// Mint N20 Data Intreface, support passing additional parameters
export interface IMintN20Data {
  p: "n20";
  op: "mint";
  tick: string;
  amt: bigint;
  [key: string]: any;
}

export interface ITransferN20Data {
  p: "n20";
  op: "transfer";
  tick: string;
  amt: bigint | bigint[];
  [key: string]: any;
}

export interface IScriptChunk {
  opcodenum: number;
  len?: number;
  buf?: Buffer;
}
