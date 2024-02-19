import type { Wallet } from "../wallet";
import powJson from "./n20-pow.json";
import simpleJson from "./n20-simple.json";

export async function uploadPowContract(wallet: Wallet) {
  return wallet.mint(wallet.buildN20Payload(powJson));
}

export async function uploadSimpleContract(wallet: Wallet) {
  return wallet.mint(wallet.buildN20Payload(simpleJson));
}
