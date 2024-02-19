import * as bitcoin from "bitcore-lib";

export const mapAddressToScriptHash = (
  addressStr: string,
  network = "livenet",
) => {
  const address = bitcoin.Address.fromString(
    addressStr,
    network === "testnet" ? "testnet" : "livenet",
  );
  let scriptHex: string;
  if (address.isPayToTaproot()) {
    scriptHex = "5120" + address.hashBuffer.toString("hex");
  } else {
    const script = bitcoin.Script.fromAddress(address);
    scriptHex = script.toBuffer().toString("hex");
  }
  // with SHA256 hash
  const hash256 = bitcoin.crypto.Hash.sha256(Buffer.from(scriptHex, "hex"));
  // which is sent to the server reversed as:
  const scriptHash = hash256.reverse().toString("hex");
  return {
    scriptHex,
    scriptHash,
  };
};

export function calcScriptHash(scriptHex: string) {
  // with SHA256 hash:
  const hash256 = bitcoin.crypto.Hash.sha256(Buffer.from(scriptHex, "hex"));
  // which is sent to the server reversed as:
  const reversedHash256 = hash256.reverse();
  const reversedHash256Hex = reversedHash256.toString("hex");
  return reversedHash256Hex;
}

