import {IBroadcastResult} from "@/types";
import {Wallet} from "@/wallet";

export abstract class TokenBase {
  constructor() {}
  abstract deploy(wallet: Wallet): Promise<IBroadcastResult>;
  abstract mint(wallet: Wallet): Promise<IBroadcastResult>;
}
