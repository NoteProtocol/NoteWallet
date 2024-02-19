import type { ICoinConfig } from "./types";

export const MIN_SATOSHIS = 546;

export const WALLET_MNEMONIC = process.env.WALLET_MNEMONIC
  ? process.env.WALLET_MNEMONIC.replace(/^"|"$/g, "")
  : undefined;

export const URCHAIN_KEY = process.env.URCHAIN_KEY
  ? process.env.URCHAIN_KEY.replace(/^"|"$/g, "")
  : "1234567890";

export const BTC_URCHAIN_HOST = process.env.BTC_URCHAIN_HOST
  ? process.env.BTC_URCHAIN_HOST.replace(/^"|"$/g, "")
  : "https://btc.urchain.com/api/";

export const BTC_NETWORK = process.env.NEXT_PUBLIC_BTC_NETWORK
  ? process.env.NEXT_PUBLIC_BTC_NETWORK.replace(/^"|"$/g, "")
  : "livenet";

export const coins: ICoinConfig[] = [
  {
    name: "Bitcoin",
    symbol: "BTC",
    decimal: 8,
    path: "m/44'/0'/0'",
    baseSymbol: "Satoshi",
    network: "livenet",
    explorer: [
      {
        homepage: "https://mempool.space/",
        tx: "https://mempool.space/tx/${txId}",
        address: "https://mempool.space/address/${address}",
        block: "https://mempool.space/block/${blockHash}",
        blockheight: "https://mempool.space/block/${blockHeight}",
      },
    ],
    P2SH: true,
    P2PKH: true,
    P2WSH: true,
    P2TR: true,
    minDustThreshold: 546,
    bip21: "",
    urchain: {
      host: BTC_URCHAIN_HOST,
      apiKey: URCHAIN_KEY,
    },
  },
];
