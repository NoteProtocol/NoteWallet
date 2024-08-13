require('dotenv').config();

import * as readline from "readline";
import yargs from "yargs";

import type {Wallet} from "./wallet";
import {BTCWallet} from "./btc/btc-wallet";
import {coins, WALLET_MNEMONIC} from "./config";
import {publishSmartContract} from "./publish";
import {deployPowToken, mintPowToken} from "./mint";
import {interpolate} from "./utils";

export class CommandLineWallet {
  private wallets: Record<string, Wallet> = {};
  private currentWallet: Wallet | undefined;
  private rl: readline.Interface;

  constructor() {
    this.init(WALLET_MNEMONIC!);
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    this.startRepl();
  }

  init(mnemonic: string) {
    for (const coin of coins) {
      switch (coin.symbol) {
        case "BTC":
          if (coin.network === "livenet") {
            this.wallets.BTClivenet = new BTCWallet(mnemonic, coin);
            if (coins.length === 1) {
              this.currentWallet = this.wallets.BTClivenet;
            }
          } else {
            this.wallets.BTCtestnet = new BTCWallet(mnemonic, coin);
          }

          break;
      }
    }
  }

  private setPrompt() {
    this.rl.setPrompt(
      `${
        this.currentWallet
          ? this.currentWallet.config.symbol +
            this.currentWallet.config.network +
            " " +
            this.currentWallet.accoutIndex
          : ""
      }> `
    );
  }

  private async processCommand(line: string) {
    const args = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

    return await yargs(args)
      .command(
        "use [symbol]",
        "select a wallet",
        (yargs) => {
          yargs.positional("symbol", {
            describe: "BTC or RXD or BSV",
            type: "string",
          });
        },
        (argv) => {
          if (argv.symbol) {
            this.currentWallet =
              this.wallets[argv.symbol as keyof typeof this.wallets];
            console.log(`using ${argv.symbol as string} wallet`);

            this.setPrompt();

            console.log(Object.keys(this.wallets));
          }
        }
      )
      .command(
        "switch [index]",
        "switch account of wallet",
        () => {},
        async (argv) => {
          if (argv.index !== undefined) {
            if (!this.currentWallet) {
              console.log("No wallet selected");
              return;
            }
            const result = this.currentWallet.switchAccount(
              argv.index as number
            );
            console.log("current account", result);

            this.setPrompt();
          }
        }
      )
      .command(
        "balance",
        "Get the balance",
        () => {},
        async () => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          console.log("Balance:", await this.currentWallet.getBalance());
        }
      )
      .command(
        "send [to] [amount]",
        "Send Bitcoin",
        (yargs) => {
          yargs
            .positional("to", {
              describe: "Address to send Bitcoin to",
              type: "string",
              demandOption: true,
            })
            .positional("amount", {
              describe: "Amount of Bitcoin to send",
              type: "number",
              demandOption: true,
            });
        },
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          if (argv.to && argv.amount) {
            const result = await this.currentWallet.send([
              {
                address: argv.to as string,
                amount: argv.amount as number,
              },
            ]);
            if (result.success) {
              console.log(
                "Succeeded:",
                interpolate(this.currentWallet.explorer!.tx, {
                  txId: result.txId,
                })
              );
            } else {
              console.log(result.error);
            }
          }
        }
      )
      .command(
        "sendtoken [toScript] [tick] [amt]",
        "Send tokens to a script(hex)",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          if (argv.toScript && argv.tick && argv.amt) {
            const {result} = await this.currentWallet.sendToken(
              argv.toScript as string,
              argv.tick as string,
              argv.amt as bigint
            );
            if (result.success) {
              console.log(
                "Succeeded:",
                interpolate(this.currentWallet.explorer!.tx, {
                  txId: result.txId,
                })
              );
            } else {
              console.log(result.error);
            }
          }
        }
      )
      .command(
        "utxos",
        "Show wallet Utxo List",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          console.log("Utxos:", await this.currentWallet.showUtxos());
        }
      )
      .command(
        "info",
        "Get wallet info",
        (yargs) => {},
        (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          console.log("Info:", this.currentWallet.info());
        }
      )
      .command(
        "tokenlist",
        "get Token List and Balance",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          const balance = await this.currentWallet.tokenList();
          console.log("Token Balance:", balance);
        }
      )
      .command(
        "alltokens",
        "get All Token Info",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          const results = await this.currentWallet.allTokens();
          console.log("alltokens:", results);
        }
      )
      .command(
        "tokeninfo [tick]",
        "get Token Info",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          if (argv.tick) {
            const balance = await this.currentWallet.tokenInfo(
              argv.tick as string
            );
            console.log("Token Balance:", argv.tick as string, balance);
          }
        }
      )
      .command(
        "tokenutxos [tick]",
        "get Token UTXOs",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          if (argv.tick) {
            const utxos = await this.currentWallet.getTokenUtxos(
              argv.tick as string
            );
            console.log("Token UTXOs:", argv.tick as string, utxos);
          }
        }
      )
      .command(
        "up [tick]",
        "upgrade N20 Protocol binding UTXOs",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          if (argv.tick) {
            const result = await this.currentWallet.upN20(argv.tick as string);
            if (result.success) {
              console.log(
                "Succeeded:",
                interpolate(this.currentWallet.explorer!.tx, {
                  txId: result.txId,
                })
              );
            } else {
              console.log(result.error);
            }
          }
        }
      )
      .command(
        "deploy",
        "Deploy N20 Token",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          const {result} = await deployPowToken(this.currentWallet);
          if (result.success) {
            console.log(
              "Succeeded:",
              interpolate(this.currentWallet.explorer!.tx, {
                txId: result.txId,
              })
            );
          } else {
            console.log(result.error);
          }
        }
      )
      .command(
        "mint",
        "Mint N20 Token",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          const {result, error} = await mintPowToken(this.currentWallet);
          if (result?.success) {
            console.log(
              "Succeeded:",
              interpolate(this.currentWallet.explorer!.tx, {
                txId: result.txId,
              })
            );
          } else {
            console.log(error);
          }
        }
      )
      .command(
        "publish",
        "Publish Smart Contract",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          const result = await publishSmartContract(this.currentWallet);
          if (result && result.success) {
            console.log(
              "Succeeded:",
              interpolate(this.currentWallet.explorer!.tx, {
                txId: result.txId,
              })
            );
          } else {
            console.log(result);
          }
        }
      )
      .parse();
  }

  private startRepl(): void {
    this.rl.setPrompt(
      `${
        this.currentWallet
          ? this.currentWallet.config.symbol +
            this.currentWallet.config.network +
            " " +
            this.currentWallet.accoutIndex
          : ""
      }> `
    );

    console.log(Object.keys(this.wallets));

    this.rl.prompt();
    this.rl
      .on("line", async (line) => {
        await this.processCommand(line).then(() => {
          this.rl.prompt();
        });
      })
      .on("close", () => {
        console.log("Exiting wallet");
        process.exit(0);
      });
  }
}

new CommandLineWallet();
