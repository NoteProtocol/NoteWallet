//NOTICE: This is demo code for minting token via N20_Pow contract. dont use it in production
// When you deploied your contract, you must write your own mint function
//All tokens is not real value
import {hash256} from "scryptlib";

import type {Wallet} from "./wallet";
import {MAX_LOCKTIME} from "./constants";
import powJson from "./contracts/n20-pow.json";

import {offlineVerify} from "scrypt-verify";
import {IDeployN20Data, IMintN20Data} from "./types";
import {stringToBytes} from "./utils";

const bitwork = "20";
const tick = "NOTE";

const deployData: IDeployN20Data = {
  p: "n20",
  op: "deploy",
  tick,
  max: 2100n * 10000n * 10n ** 8n,
  lim: 5000n * 10n ** 8n,
  dec: 8,
  sch: "50b13619d4d936d7c5c7fb7dfbe752e33b85b33774e9e2b3779f16791fb1c749",
  start: 27530, //start height
  bitwork: stringToBytes(bitwork), //tx must start with bitwork
};

const mintData: IMintN20Data = {
  p: "n20",
  op: "mint",
  tick,
  amt: 5000n * 10n ** 8n,
};

//NOTICE: deploy a new token with n20-pow contract, write your own deploy function
export async function deployPowToken(wallet: Wallet) {
  const toAddress = wallet.currentAccount.mainAddress!.address!;

  const tx = await wallet.buildCommitPayloadTransaction(
    wallet.buildN20Payload(deployData),
    toAddress
  );
  const result = await wallet.broadcastTransaction(tx);
  return {success: true, result};
}

//NOTICE: mint token to the token address, write your own mint function
export async function mintPowToken(wallet: Wallet) {
  let noteNote, payNotes, feeRate;
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

  const payload = wallet.buildN20Payload(mintData);
  //Mint token to the token address
  const toAddress = wallet.currentAccount.tokenAddress!.address!;
  //Mint token to the token address
  while (locktime < MAX_LOCKTIME) {
    payload.locktime = locktime; //to change tx
    const tx = await wallet.buildN20PayloadTransaction(
      payload,
      toAddress,
      noteNote,
      payNotes,
      feeRate
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
          console.log("🚀 ~ mintPowToken ~ error:", error);
          result = await wallet.broadcastTransaction(tx);
        }
        locktime = 0;
        noteNote = undefined;
        payNotes = undefined;
        feeRate = undefined;
        // return {success: true, result};
        continue;
      }
      break;
    } else {
      noteNote = tx.noteUtxo;
      payNotes = tx.payUtxos;
      feeRate = tx.feeRate;
      locktime++;
    }
  }
  return {
    success: false,
    result,
    error: "Failed to mint NotePow token",
  };
}
