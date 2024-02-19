import ecc from "@bitcoinerlab/secp256k1";
import * as bitcoinjs from "bitcoinjs-lib";
import { ECPairFactory } from "ecpair";

bitcoinjs.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

export function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoinjs.crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey]),
  );
}

export function toXOnly(pubkey: Buffer): Buffer {
  return Buffer.from(pubkey.subarray(1, 33));
}

export function validator(
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer,
): boolean {
  return ECPair.fromPublicKey(pubkey).verify(msghash, signature);
}

export function schnorrValidator(
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer,
) {
  return ecc.verifySchnorr(msghash, pubkey, signature);
}
