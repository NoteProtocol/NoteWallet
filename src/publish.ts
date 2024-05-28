import type {Wallet} from "./wallet";
import jossJson from "./contracts/n20-joss.json";
import powJson from "./contracts/n20-pow.json";
import simpleJson from "./contracts/n20-simple.json";

export async function uploadPowContract(wallet: Wallet) {
  const json: Partial<any> = Object.assign({}, powJson);
  json.file && delete json.file;
  json.sourceMapFile && delete json.sourceMapFile;
  const payload = wallet.buildN20Payload(json, true);
  const tx = await wallet.buildCommitPayloadTransaction(
    payload,
    wallet.currentAccount.mainAddress!.address!
  );
  return await wallet.broadcastTransaction(tx);
}

export async function uploadSimpleContract(wallet: Wallet) {
  const json: Partial<any> = Object.assign({}, simpleJson);
  json.file && delete json.file;
  json.sourceMapFile && delete json.sourceMapFile;
  const payload = wallet.buildN20Payload(json, true);
  const tx = await wallet.buildCommitPayloadTransaction(
    payload,
    wallet.currentAccount.mainAddress!.address!
  );
  return await wallet.broadcastTransaction(tx);
}

export async function uploadJossContract(wallet: Wallet) {
  const json: Partial<any> = Object.assign({}, jossJson);
  json.file && delete json.file;
  json.sourceMapFile && delete json.sourceMapFile;

  const payload = wallet.buildN20Payload(json, true);
  const tx = await wallet.buildCommitPayloadTransaction(
    payload,
    wallet.currentAccount.mainAddress!.address!
  );
  return await wallet.broadcastTransaction(tx);
}

//Wrirte your smart contract upload function here
export async function publishSmartContract(wallet: Wallet) {
  // Upload the smart contract
  return await uploadSimpleContract(wallet);
}
