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

## Show Balance
```
balance
```

Charge some satoshis to `mainAddress`, then check the balance of `mainAddress` with 'balance' command.

## Show Token List and Balance
```
tokenlist
```

## Mint NOTE Token
```
mintnote
```

## Send tokens to tokenAddress of others
```
sendtoken [token address] [tick] [amount]
```

a donate example
```
sendtoken bc1p6ule9mj6u9tqzuq5zk9kn3sqlg788kzkpj63ff6j8jm26mvy8evsmqhz4n NOTE 1000000
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
