import { utils, Transaction, BigNumber } from 'ethers';
import { ConnectionInfo } from '@ethersproject/web';
import { Network } from '@ethersproject/networks';
import { CHAIN_INFO, ChainId } from '@ubeswap/sdk';
import {
  DappKitRequestTypes,
  DappKitResponseStatus,
  getBaseNonce,
} from './utils/dappKit';
import { requestValoraTransaction } from './utils/valoraUtils';
import { AbstractProvider } from './AbstractProvider';

enum NETWORKS {
  MAINNET = 42220,
  ALFAJORES = 44787,
  BAKLAVA = 62320,
}

const tokens: {
  [x: string]: {
    [n: number]: string;
  };
} = {
  celo: {
    [NETWORKS.MAINNET]: '0x471ece3750da237f93b8e339c536989b8978a438',
    [NETWORKS.ALFAJORES]: '0xf194afdf50b03e69bd7d057c1aa9e10c9954e4c9',
  },
  cUSD: {
    [NETWORKS.MAINNET]: '0x765de816845861e75a25fca122bb6898b8b1282a',
    [NETWORKS.ALFAJORES]: '0x874069fa1eb16d44d622f2e0ca25eea172369bc1',
  },
  cEUR: {
    [NETWORKS.MAINNET]: '0xd8763cba276a3738e6de85b4b3bf5fded6d6ca73',
    [NETWORKS.ALFAJORES]: '0x10c892a6ec43a53e45d0b916b4b7d383b1b78c0f',
  },
};

export class ValoraProvider extends AbstractProvider {
  public readonly celoAddress: string;
  public readonly stableAddress: string;

  constructor(url?: ConnectionInfo | string, network?: Network) {
    super(url, network);
    this.celoAddress = tokens.celo[network?.chainId || NETWORKS.MAINNET];
    this.stableAddress = tokens.cUSD[network?.chainId || NETWORKS.MAINNET];
  }

  _networkRequest = this.request;

  _request = async (
    method: string,
    params?: unknown[] | Record<string, unknown>
  ): Promise<unknown> => {
    console.log('[Valora request]', { method, params });
    if (method === 'eth_estimateGas' && params) {
      try {
        const txData = (params as unknown[])[0] as {
          from: string;
          to: string;
          data: string;
        };
        // estimate gas for the transaction
        const gasEstimate = await this.estimateGas(txData);
        return '0x' + gasEstimate.toString().slice(0, 16);
      } catch (e) {
        console.error(
          'Failed to estimate gas',
          JSON.stringify({ method, params }),
          e
        );
        throw e;
      }
    } else if (method === 'eth_sendTransaction' && params) {
      const txParams = params as readonly {
        gas: string;
        from: string;
        to: string;
        data: string;
      }[];
      const [firstTx] = txParams;
      if (!firstTx) {
        throw new Error('No tx found');
      }
      const baseNonce = (await getBaseNonce(this, firstTx.from)) || 0;

      try {
        const txs = await Promise.all(
          txParams.map(async ({ from, to, data }, i) => {
            const gasEstimate = await this.estimateGas({
              from,
              to,
              data,
            });
            return {
              txData: data,
              estimatedGas: gasEstimate,
              from,
              to,
              nonce: baseNonce + i,
              feeCurrencyAddress: this.stableAddress,
              value: '0',
            };
          })
        );
        console.debug('Sending txs', txs);
        const transactions = txs.map(
          tx =>
            ({
              to: tx.to,
              from: tx.from,
              nonce: tx.nonce,
              data: tx.txData,
              value: BigNumber.from(tx.value),
              gasPrice: tx.estimatedGas,
              gasLimit: BigNumber.from('10000'),
              chainId: this.chainId,
            } as Transaction)
        );
        const resp = await requestValoraTransaction(this, transactions);
        if (
          resp.type === DappKitRequestTypes.SIGN_TX &&
          resp.status === DappKitResponseStatus.SUCCESS
        ) {
          const sent = this.sendTransaction(resp.rawTxs[0]);
          return new Promise((resolve, reject) => {
            sent.then(({ hash }) => {
              console.log('Valora TX sent', hash);
              resolve(hash);
            });
            sent.catch((err: any) => reject(err));
          });
        }
      } catch (e) {
        console.error(
          '[Valora] Failed to send transaction',
          { method, params },
          e
        );
        throw e;
      }
    }
    return await this._networkRequest.call(this, method, params);
  };

  request = async (
    method: string | { method: string; params: unknown[] },
    params?: unknown[] | Record<string, unknown>
  ): Promise<unknown> => {
    if (typeof method !== 'string') {
      return this._request(method.method, method.params);
    }
    return this._request(method, params);
  };
}
