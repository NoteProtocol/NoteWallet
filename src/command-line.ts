import * as readline from "readline";
import yargs from "yargs";

import type { Wallet } from "./wallet";
import { BTCWallet } from "./btc/btc-wallet";
import { coins, WALLET_MNEMONIC } from "./config";
import { mintPowToken } from "./mint";
import { interpolate } from "./utils";

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
            this.currentWallet = this.wallets.BTClivenet
            console.log(this.currentWallet.info())
          }
          break;
      }
    }
  }

  private async processCommand(line: string) {
    const args = line.match(/(?:[^\s"]+|"[^"]*")+/g) || [];

    return await yargs(args)
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
        },
      )
      .command(
        "send [to] [amount]",
        "Send Bitcoin",
        (yargs) => {
          yargs
            .positional("to", {
              describe: "Address to send Bitcoin to",
              type: "string",
            })
            .positional("amount", {
              describe: "Amount of Bitcoin to send",
              type: "number",
            });
        },
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          if (argv.to && argv.amount) {
            const result = await this.currentWallet.send([
              { address: argv.to as string, satoshis: argv.amount as number },
            ]);
            if (result.success) {
              console.log(
                "Succeeded:",
                interpolate(this.currentWallet.explorer!.tx, {
                  txId: result.txId,
                }),
              );
            } else {
              console.log(result.error);
            }
          }
        },
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
            const result = await this.currentWallet.sendToken(
              argv.toScript as string,
              argv.tick as string,
              argv.amt as bigint,
            );
            if (result.success) {
              console.log(
                "Succeeded:",
                interpolate(this.currentWallet.explorer!.tx, {
                  txId: result.txId,
                }),
              );
            } else {
              console.log(result.error);
            }
          }
        },
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
        },
      )
      .command(
        "refresh",
        "Fix some issues",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          await this.currentWallet.refresh()
          console.log("Balance:", await this.currentWallet.getBalance());
        },
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
        },
      )
      .command(
        "mintnote",
        "Mint Note Token",
        (yargs) => {},
        async (argv) => {
          if (!this.currentWallet) {
            console.log("No wallet selected");
            return;
          }
          const result = await mintPowToken(this.currentWallet);
          if (result?.success) {
            console.log(
              "Succeeded:",
              interpolate(this.currentWallet.explorer!.tx, {
                txId: result.txId,
              }),
            );
          } else {
            console.log(result);
          }
        },
      )
      .parse();
  }

  private startRepl(): void {
    this.rl.setPrompt(
      `${
        this.currentWallet
          ? this.currentWallet.config.symbol +
            this.currentWallet.config.network +
            " "
          : ""
      }wallet> `,
    );

    this.rl.prompt();
    this.rl
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
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
