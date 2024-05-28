# NOTE Wallet (Community Version)

The wallet is a simple CLI tool to manage Bitcoin and NOTE crypto assets.


## Installation
install nodejs and npm or yarn or pnpm, first.

then install the dependencies.

```
pnpm i
```

## Setup

rename `.env.example` to `.env`, and fill in the required information.

Setup your wallet WALLET_MNEMONIC in `.env`, if you keep empty, the tool will generate a new one. backup your mnemonic, it's your only chance to recover your wallet.

## Start
```
pnpm run start
```

## Choose Network
```
use BTClivenet
```
or
```
use BTCtestnet
```

## Upgrade Token to bind UTXOs
```
tokenlist
```

When you possess a 'needUpgrade' flag token, it's essential to upgrade it in order to bind the UTXO within the specified version.

```
up [token name]
```

ex.
```
up NOTE
```

## Show Balance
```
balance
```

Charge some satoshis to `mainAddress`, then check the balance of `mainAddress` with 'balance' command.

## Show Token List and Balance
```
tokenlist
```

## Send tokens to tokenAddress of others
```
sendtoken [token address] [tick] [amount]
```

a donate example
```
sendtoken bc1pcuh2nlk4zld8ljklal64ks4hznh7q94lxkguzrsk55dg84qgrt6qswzywl NOTE 1000000
```

amount is with decimal point, 1 NOTE = 100,000,000 sats. the example amount 1,000,000 sats = 0.01 NOTE.

## Check Token Balance
Wait some minutes for the transaction to be confirmed, then check the balance of N20 Tokens with 'balance' and 'tokenlist' command.

```
balance

tokenlist
```

## Send BTC Satoshis to others

```
send [other address] [satoshis]

```

# Developmet

We offer several example programs for developers to publish their own contracts, deploy tokens, and provide mining programs. The code is in `publish.ts` and `mint.ts`. You need to understand the code and write your own program logic. Feel free to follow us on [Twitter](https://x.com/NoteProtocol) and join our [Discord](https://discord.gg/tGBHKDPkF5) to interact with other builders.


## Publish Smart Contratc
```
publish
```

## Deploy Token
```
deploy
```

## Mint Token
```
mint
```

### Test Case

Switch to the testnet

```
use BTCtestnet
```

Use the `info` command to get the main address, then obtain test tokens via the faucet.

```
info
```

#### Testnet4 Faucet

https://testnet4.anyone.eu.org/

https://mempool.space/testnet4/faucet


and send them to the main address. Finally, you can try using the `mint` command
```
mint
```

# Notice
Please thoroughly test on the testnet before deploying to the mainnet. No one is responsible for the accuracy of protocols, indexers, or contract codes, nor does anyone guarantee the value of assets. Write smart contracts entirely at your own risk.
