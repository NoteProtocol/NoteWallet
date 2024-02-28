import type { AxiosError, AxiosResponse } from "axios";
import axios from "axios";
import mempoolJS from "@mempool/mempool.js";
const mempoolHostname = "mempool.space";

import type { IBroadcastResult, IFees, IToken, IUtxo } from "./types";

export class Urchain {
  private _httpClient;
  constructor(host: string, apiKey = "1234567890") {
    this._httpClient = axios.create({
      baseURL: host,
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
  }

  _parseResponse(response: AxiosResponse) {
    return response.data;
  }

  _parseError(error: AxiosError) {
    if (error.response) {
      // server return error
      console.log(
        "🚀 ~ file: urchain.ts:32 ~ Urchain ~ _parseError",
        `${error.config?.baseURL}${error.config?.url}`,
        error.response.status,
        error.response.headers,
        error.response.data,
      );
      throw new Error(JSON.stringify(error.response.data));
    } else if (error.request) {
      // console.warn( error.message )
      throw new Error(error.message);
    } else {
      // console.warn( 'Error', error )
      throw error;
    }
  }

  _get(command, params) {
    // Create query with given parameters, if applicable
    params = params || {};

    const options = {
      params,
    };

    return this._httpClient
      .get(command, options)
      .then(this._parseResponse)
      .catch(this._parseError);
  }

  _post(command, data) {
    const options = {
      headers: {
        "Content-Type": "application/json",
      },
    };

    return this._httpClient
      .post(command, data, options)
      .then(this._parseResponse)
      .catch(this._parseError);
  }

  async health(): Promise<string> {
    return await this._get("health", {});
  }

  async getFeePerKb(): Promise<IFees> {
    const {
      bitcoin: { fees },
    } = mempoolJS({
      hostname: mempoolHostname,
    });

    const feesRecommended = await fees.getFeesRecommended();
    return {
      slowFee:
        Math.min(feesRecommended.hourFee, feesRecommended.halfHourFee) * 1000,
      avgFee:
        Math.max(feesRecommended.hourFee, feesRecommended.halfHourFee) * 1000,
      fastFee:
        Math.max(
          feesRecommended.hourFee,
          feesRecommended.halfHourFee,
          feesRecommended.fastestFee,
        ) * 1000,
    };
  }

  balance(scriptHash: string): Promise<{
    confirmed: bigint;
    unconfirmed: bigint;
  }> {
    return this._post("balance", {
      scriptHash,
    });
  }

  async refresh(scriptHash: string): Promise<{
    message: string;
    code: string | number;
  }> {
    return await this._post("refresh", {
      scriptHash,
    });
  }

  tokenBalance(
    scriptHash: string,
    tick: string,
  ): Promise<{
    confirmed: bigint;
    unconfirmed: bigint;
  }> {
    return this._post("token-balance", {
      scriptHash,
      tick,
    });
  }

  tokenList(scriptHash: string): Promise<IToken[]> {
    return this._post("token-list", {
      scriptHash,
    });
  }

  async utxos(scriptHashs: string[], _satoshis?: bigint): Promise<IUtxo[]> {
    return await this._post("utxos", {
      scriptHashs,
      ...(typeof _satoshis !== "undefined" ? { satoshis: _satoshis } : {}),
    });
  }

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
    return await this._post("token-info", { tick });
  }
}
