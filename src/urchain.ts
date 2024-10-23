import {EventEmitter} from "eventemitter3";
import ky from "ky";

import type {IBalance, IBroadcastResult, IFees, IToken, IUtxo} from "./types";

export class Urchain extends EventEmitter {
  private _httpClient;
  private _host: string;
  private _apiKey = "noteprotocol";
  constructor(host: string, apiKey = "noteprotocol") {
    super();
    this._host = host;
    this._apiKey = apiKey;
  }

  async getHttpClient() {
    if (this._httpClient) {
      return this._httpClient;
    }
    this._httpClient = ky.create({
      timeout: 50000, // Set timeout, wallet requests should not exceed 50 seconds. If they do, it's likely due to poor urchain server design
      retry: 0,
      prefixUrl: this._host,
      headers: {
        Authorization: `Bearer ${this._apiKey}`,
      },
    });
    return this._httpClient;
  }

  _parseResponse(data) {
    return data;
  }

  _parseError(error) {
    if (error.response) {
      // server return error
      console.log(
        "🚀 ~ file: urchain.ts:32 ~ Urchain ~ _parseError",
        `${error.config?.baseURL}${error.config?.url}`,
        error.response.status,
        error.response.headers,
        error.response.data
      );
      throw new Error(JSON.stringify(error.response.data));
    } else if (error.request) {
      console.warn(error);
      throw new Error(error.message);
    } else {
      console.warn("Error", error);
      throw error;
    }
  }

  async _get(command: string, params: any) {
    // Create query with given parameters, if applicable
    params = params || {};

    const options = {
      params,
    };

    const httpClient = await this.getHttpClient();
    return httpClient
      .get(command, options)
      .json()
      .then(this._parseResponse)
      .catch(this._parseError);
  }

  async _post(command: string, data: any) {
    const options = {
      json: data,
      headers: {
        "Content-Type": "application/json",
      },
    };

    const httpClient = await this.getHttpClient();
    return httpClient
      .post(command, options)
      .json()
      .then(this._parseResponse)
      .catch(this._parseError);
  }

  async health(): Promise<string> {
    return await this._get("health", {});
  }

  async getFeePerKb(): Promise<IFees> {
    return await this._get("fees", {});
  }

  balance(scriptHash: string): Promise<IBalance> {
    return this._post("balance", {
      scriptHash,
    }).then((balance) => {
      return {
        ...balance,
        confirmed: BigInt(balance.confirmed),
        unconfirmed: BigInt(balance.unconfirmed),
        total: BigInt(balance.confirmed) + BigInt(balance.unconfirmed),
      };
    });
  }

  // Calculate wallet balance using multiple scriptHashes
  async walletBalance(scriptHashs: string[]): Promise<IBalance> {
    const balance = await this._post("wallet-balance", {
      scriptHashs,
    });
    return {
      ...balance,
      confirmed: BigInt(balance.confirmed),
      unconfirmed: BigInt(balance.unconfirmed),
      total: BigInt(balance.confirmed) + BigInt(balance.unconfirmed),
    };
  }

  // Get balance for a specific Token
  tokenBalance(scriptHash: string, tick: string): Promise<IBalance> {
    return this._post("token-balance", {
      scriptHash,
      tick,
    }).then((balance) => {
      return {
        ...balance,
        confirmed: BigInt(balance.confirmed),
        unconfirmed: BigInt(balance.unconfirmed),
        total: BigInt(balance.confirmed) + BigInt(balance.unconfirmed),
      };
    });
  }

  // Get list of tokens for a specific scriptHash
  async tokenList(scriptHash: string): Promise<IToken[]> {
    const list = await this._post("token-list", {
      scriptHash,
    });
    return list.map((token) => {
      token.confirmed = BigInt(token.confirmed);
      token.unconfirmed = BigInt(token.unconfirmed);
      token.total = BigInt(token.confirmed) + BigInt(token.unconfirmed);
      return token;
    });
  }

  // Get available UTXOs using scriptHash and required amount
  async utxos(scriptHashs: string[], _satoshis?: bigint): Promise<IUtxo[]> {
    return await this._post("utxos", {
      scriptHashs,
      ...(typeof _satoshis !== "undefined" ? {satoshis: _satoshis} : {}),
    });
  }

  // Get available Token UTXOs using scriptHash and required amount
  async tokenutxos(scriptHashs: string[], tick: string, amount?: bigint) {
    const utxos = await this._post("token-utxos", {
      scriptHashs,
      tick,
      ...(typeof amount !== "undefined" ? {amount: amount} : {}),
    });
    return utxos.map((utxo) => {
      utxo.amount = BigInt(utxo.amount);
      return utxo;
    });
  }

  // Reset unconfirmed transactions
  async refresh(scriptHash: string): Promise<{
    message: string;
    code: string | number;
  }> {
    return await this._post("refresh", {
      scriptHash,
    });
  }

  // Broadcast transaction, throw an exception if there's an error, otherwise complete normally
  async broadcast(rawHex: string): Promise<IBroadcastResult> {
    return await this._post("broadcast", {
      rawHex,
    });
  }

  async bestBlock() {
    return await this._post("best-header", {});
  }

  async allTokens() {
    return await this._post("all-n20-tokens", {});
  }

  async tokenInfo(tick: string) {
    return await this._post("token-info", {tick});
  }
}
