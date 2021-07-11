import { providers } from 'ethers';
import { ConnectionInfo } from '@ethersproject/web';
import { Network } from '@ethersproject/networks';
import { ChainId } from '@ubeswap/sdk';

interface BatchItem {
  request: { jsonrpc: '2.0'; id: number; method: string; params: unknown };
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

export class AbstractProvider extends providers.JsonRpcProvider {
  public readonly chainId: ChainId;
  private batch: BatchItem[] = [];
  private batchWaitTimeMs = 50;
  private batchTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(url?: ConnectionInfo | string, network?: Network) {
    super(url, network);
    this.chainId = network?.chainId as ChainId;
  }

  public readonly clearBatch = async () => {
    console.debug('Clearing batch', this.batch);
    const batch = this.batch;
    this.batch = [];
    this.batchTimeoutId = null;

    let response: Response;
    try {
      response = await fetch(this.connection.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify(batch.map(item => item.request)),
      });
    } catch (error) {
      batch.forEach(({ reject }) =>
        reject(new Error('Failed to send batch call'))
      );
      return;
    }

    if (!response.ok) {
      batch.forEach(({ reject }) =>
        reject(new Error(`${response.status}: ${response.statusText}`))
      );
      return;
    }

    let json;
    try {
      json = await response.json();
    } catch (error) {
      batch.forEach(({ reject }) =>
        reject(new Error('Failed to parse JSON response'))
      );
      return;
    }
    const byKey = batch.reduce<{ [id: number]: BatchItem }>((memo, current) => {
      memo[current.request.id] = current;
      return memo;
    }, {});
    for (const result of json) {
      const {
        resolve,
        reject,
        request: { method },
      } = byKey[result.id];
      if (resolve) {
        if ('error' in result) {
          reject(new Error(result?.error?.message));
        } else if ('result' in result) {
          resolve(result.result);
        } else {
          reject(
            new Error(
              `Received unexpected JSON-RPC response to ${method} request.`
            )
          );
        }
      }
    }
  };

  public readonly sendAsync = (
    request: {
      jsonrpc: '2.0';
      id: number | string | null;
      method: string;
      params?: unknown[] | Record<string, unknown>;
    },
    callback: (error: any, response: any) => void
  ): void => {
    this.request(request.method, request.params)
      .then(result =>
        callback(null, { jsonrpc: '2.0', id: request.id, result })
      )
      .catch(error => callback(error, null));
  };

  public readonly request = async (
    method: string | { method: string; params: unknown[] },
    params?: unknown[] | Record<string, unknown>
  ): Promise<unknown> => {
    if (typeof method !== 'string') {
      return this.request(method.method, method.params);
    }
    if (method === 'eth_chainId') {
      return `0x${this.chainId.toString(16)}`;
    }
    const promise = new Promise((resolve, reject) => {
      this.batch.push({
        request: {
          jsonrpc: '2.0',
          id: this._nextId++,
          method,
          params,
        },
        resolve,
        reject,
      });
    });
    this.batchTimeoutId =
      this.batchTimeoutId ?? setTimeout(this.clearBatch, this.batchWaitTimeMs);
    return promise;
  };
}
