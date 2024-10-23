import * as bitcore from "bitcore-lib";

import {hash256} from "./note";

export const mapAddressToScriptHash = (
  addressStr: string,
  network = "livenet"
) => {
  const address = bitcore.Address.fromString(
    addressStr,
    network === "testnet" ? "testnet" : "livenet"
  );
  let scriptHex: string;
  if (address.isPayToTaproot()) {
    scriptHex = "5120" + address.hashBuffer.toString("hex");
  } else {
    const script = bitcore.Script.fromAddress(address);
    scriptHex = script.toBuffer().toString("hex");
  }
  // with SHA256 hash
  // which is sent to the server reversed as:
  const scriptHash = calcScriptHash(Buffer.from(scriptHex, "hex"));
  return {
    scriptHex,
    scriptHash,
  };
};

export function calcScriptHash(scriptBuffer: Buffer) {
  const reversedHash256Hex = hash256(scriptBuffer).reverse().toString("hex");
  return reversedHash256Hex;
}
