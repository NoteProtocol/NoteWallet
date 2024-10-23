import {offlineVerify} from "scrypt-verify";
import {hash256} from "scryptlib";

import type {Wallet} from "@/wallet";
import {MAX_LOCKTIME} from "@/constants";
import powJson from "../contracts/n20-pow.json";
import {IDeployN20Data, IMintN20Data} from "../types";
import {stringToBytes} from "../utils";
import {TokenBase} from "./token";

const bitwork = "20";
const tick = "POW#2";

const deployData: IDeployN20Data = {
  p: "n20",
  op: "deploy",
  tick,
  max: 2100n * 10000n * 10n ** 8n,
  lim: 5000n * 10n ** 8n,
  dec: 8,
  sch: "32cc76a2665d7205f7595a3bd614ed37",
  start: 51605, //start height
  bitwork: stringToBytes(bitwork), //tx must start with bitwork
};

const mintData: IMintN20Data = {
  p: "n20",
  op: "mint",
  tick,
  amt: 5000n * 10n ** 8n,
};

class N20PowToken extends TokenBase {
  constructor() {
    super();
  }
  async deploy(wallet: Wallet) {
    const toAddress = wallet.currentAccount.mainAddress!.address!;
    const tx = await wallet.buildCommitDataTransaction(deployData, toAddress);
    const result = await wallet.broadcastTransaction(tx);
    return result;
  }
  async mint(wallet: Wallet) {
    let noteNote, payNotes, feePerKb;
    let result;
    let locktime = 0; //increase locktime to change TX
    const bestBlock = await wallet.bestBlock();
    console.log("🚀 ~ mintPowToken ~ bestBlock:", bestBlock);
    if (bestBlock.height < deployData.start) {
      return {success: false, error: "waiting for start height"};
    }
    await wallet.getBalance();

    const dataMap: any = {
      constructor: {
        ...deployData,
        op: stringToBytes(deployData.op),
        tick: stringToBytes(deployData.tick),
        p: stringToBytes(deployData.p),
      },
      mint: {
        ...deployData,
        ...mintData,
        tick: stringToBytes(mintData.tick),
        op: stringToBytes(mintData.op),
        p: stringToBytes(mintData.p),
        height: bestBlock.height,
        total: 0n,
      },
      transfer: {
        tick: stringToBytes(tick),
      },
    };
    console.log("🚀 ~ mintPowToken ~ dataMap:", dataMap);

    //Mint token to the token address
    const toAddress = wallet.currentAccount.tokenAddress!.address!;
    //Mint token to the token address
    while (locktime < MAX_LOCKTIME) {
      const tx = await wallet.buildPayloadTransaction(
        mintData,
        toAddress,
        noteNote,
        payNotes,
        feePerKb,
        locktime
      );
      const txHash256 = hash256(tx.txHex);
      console.log("checking", txHash256, locktime);
      if (txHash256.startsWith(deployData.bitwork)) {
        dataMap.mint.tx = tx.txHex;
        console.log("🚀 ~ mintPowToken ~ dataMap:", dataMap);
        //@ts-ignore
        const verifyResult = offlineVerify(powJson, dataMap, "mint");
        console.log("🚀 ~ mintPowToken ~ verifyResult:", verifyResult, tx);
        if (verifyResult.success) {
          try {
            result = await wallet.broadcastTransaction(tx);
          } catch (error) {
            console.log("🚀 ~ Retrying with error:", error);
            result = await wallet.broadcastTransaction(tx);
          }
          locktime = 0;
          noteNote = undefined;
          payNotes = undefined;
          feePerKb = undefined;
          return result;
          // continue;
        }
        break;
      } else {
        noteNote = tx.noteUtxo;
        payNotes = tx.payUtxos;
        feePerKb = tx.feePerKb;
        locktime++;
      }
    }
    return {
      success: false,
      result,
      error: "Failed to mint Pow token",
    };
  }
}

export default new N20PowToken();
