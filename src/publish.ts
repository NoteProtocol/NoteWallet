import type {Wallet} from "./wallet";

//Wrirte your smart contract upload function here
export async function publishSmartContract(
  wallet: Wallet,
  contractFileName: string
) {
  const json: Partial<any> = require(`./contracts/${contractFileName}.json`);
  json.file && delete json.file;
  json.sourceMapFile && delete json.sourceMapFile;

  const tx = await wallet.buildCommitDataTransaction(
    json,
    wallet.currentAccount.mainAddress!.address!
  );
  return await wallet.broadcastTransaction(tx);
}
