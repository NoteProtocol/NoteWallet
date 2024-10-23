import type {Wallet} from "../wallet";
import {IDeployN20Data, IMintN20Data} from "../types";
import {TokenBase} from "./token";

const tick = "SIMPLE#2";

const deployData: IDeployN20Data = {
  p: "n20",
  op: "deploy",
  tick,
  max: 2100n * 10000n * 10n ** 8n,
  lim: 5000n * 10n ** 8n,
  dec: 8,
  sch: "61644a70d30593766912aa4e310eebd6",
};

const mintData: IMintN20Data = {
  p: "n20",
  op: "mint",
  tick,
  amt: 5000n * 10n ** 8n,
};

class N20SimpleToken extends TokenBase {
  constructor() {
    super();
  }
  async deploy(wallet: Wallet) {
    const toAddress = wallet.currentAccount.mainAddress!.address!;
    const tx = await wallet.buildPayloadTransaction(deployData, toAddress);
    // const tx = await wallet.buildCommitDataTransaction(deployData, toAddress);
    const result = await wallet.broadcastTransaction(tx);
    return result;
  }
  async mint(wallet: Wallet) {
    const toAddress = wallet.currentAccount.tokenAddress!.address!;
    const tx = await wallet.buildPayloadTransaction(mintData, toAddress);
    const result = await wallet.broadcastTransaction(tx);
    return result;
  }
}

export default new N20SimpleToken();
