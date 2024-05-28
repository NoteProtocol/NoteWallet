import ecc from "@bitcoinerlab/secp256k1";
import * as bitcoin from "bitcoinjs-lib";
import {ECPairFactory} from "ecpair";

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);
export type {ECPairInterface} from "ecpair";
export {ECPair, bitcoin, ecc};
export type {Taptree} from "bitcoinjs-lib/src/types";

export function tweakSigner(
  signer: bitcoin.Signer,
  opts: any = {}
): bitcoin.Signer {
  // @ts-ignore
  let privateKey: Uint8Array | undefined = signer.privateKey;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] === 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

export function tapTweakHash(pubKey: Buffer, h: Buffer | undefined): Buffer {
  return bitcoin.crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

export function toXOnly(pubkey: Buffer): Buffer {
  return Buffer.from(pubkey.subarray(1, 33));
}

export function eccValidator(
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
): boolean {
  return ECPair.fromPublicKey(pubkey).verify(msghash, signature);
}

export function schnorrValidator(
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer
) {
  return ecc.verifySchnorr(msghash, pubkey, signature);
}
