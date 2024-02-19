export function signTx(
  coin,
  tx,
  privateKey,
  lockingScript,
  inputAmount,
  inputIndex,
) {
  if (!tx) {
    throw new Error("param tx can not be empty");
  }
  if (!privateKey) {
    throw new Error("param privateKey can not be empty");
  }
  if (!lockingScript) {
    throw new Error("param lockingScript can not be empty");
  }
  if (!inputAmount) {
    throw new Error("param inputAmount can not be empty");
  }
  if (typeof lockingScript === "string") {
    throw new Error(
      "Breaking change: LockingScript in ASM format is no longer supported, please use the lockingScript object directly",
    );
  }

  const Interp = coin.Script.Interpreter;

  const DEFAULT_FLAGS =
    //Interp.SCRIPT_VERIFY_P2SH | Interp.SCRIPT_VERIFY_CLEANSTACK | // no longer applies now p2sh is deprecated: cleanstack only applies to p2sh
    Interp.SCRIPT_ENABLE_MAGNETIC_OPCODES |
    Interp.SCRIPT_ENABLE_MONOLITH_OPCODES | // TODO: to be removed after upgrade to bsv 2.0
    Interp.SCRIPT_VERIFY_STRICTENC |
    Interp.SCRIPT_ENABLE_SIGHASH_FORKID |
    Interp.SCRIPT_VERIFY_LOW_S |
    Interp.SCRIPT_VERIFY_NULLFAIL |
    Interp.SCRIPT_VERIFY_DERSIG |
    Interp.SCRIPT_VERIFY_MINIMALDATA |
    Interp.SCRIPT_VERIFY_NULLDUMMY |
    Interp.SCRIPT_VERIFY_DISCOURAGE_UPGRADABLE_NOPS |
    Interp.SCRIPT_VERIFY_CHECKLOCKTIMEVERIFY |
    Interp.SCRIPT_VERIFY_CHECKSEQUENCEVERIFY |
    Interp.SCRIPT_VERIFY_CLEANSTACK;
  const DEFAULT_SIGHASH_TYPE =
    coin.crypto.Signature.SIGHASH_ALL |
    coin.crypto.Signature.SIGHASH_ANYONECANPAY |
    coin.crypto.Signature.SIGHASH_FORKID;

  // const DEFAULT_SIGHASH_TYPE =
  //   coin.crypto.Signature.SIGHASH_ALL | coin.crypto.Signature.SIGHASH_FORKID;

  const sighashType = DEFAULT_SIGHASH_TYPE;
  const flags = DEFAULT_FLAGS;

  return coin.Transaction.Sighash.sign(
    tx,
    privateKey,
    sighashType,
    inputIndex,
    lockingScript,
    new coin.crypto.BN(inputAmount),
    flags,
  )
    .toTxFormat()
    .toString("hex");
}
