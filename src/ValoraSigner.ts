import { CeloWallet } from '@celo-tools/celo-ethers-wrapper';
import { BigNumber, providers, utils } from 'ethers';

let _pending: Promise<any> = Promise.resolve(null);

export class ValoraSigner extends CeloWallet {}
