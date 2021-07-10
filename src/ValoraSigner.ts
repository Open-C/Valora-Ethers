import { CeloWallet } from '@celo-tools/celo-ethers-wrapper';

let _pending: Promise<any> = Promise.resolve(null);

export class ValoraSigner extends CeloWallet {}
