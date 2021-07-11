import { AbstractProvider } from './AbstractProvider';
import { IValoraAccount, requestValoraAuth } from './utils/valoraUtils';
import { providers } from 'ethers';
import { ChainId } from '@ubeswap/sdk';

export interface ConnectorUpdate<T = number | string> {
  provider?: any;
  chainId?: T;
  account?: null | string;
}
export class ValoraSigner extends providers.JsonRpcSigner {
  private account: string | null = null;
  public valoraAccount: IValoraAccount | null = null;
  private currentChainId: ChainId;

  private mainProvider: AbstractProvider | null = null;

  setSavedValoraAccount(acc: IValoraAccount | null) {
    this.valoraAccount = acc;
  }

  constructor(provider: AbstractProvider) {
    super(null, provider);
    this.currentChainId = provider.chainId;
  }

  public async activate(): Promise<ConnectorUpdate> {
    if (!this.valoraAccount) {
      this.valoraAccount = await requestValoraAuth();
    }
    this.account = this.valoraAccount.address;
    //this.mainProvider = new ValoraProvider(this.currentChainId);
    return {
      provider: this.mainProvider,
      chainId: this.currentChainId,
      account: this.valoraAccount.address,
    };
  }

  async getAccount(): Promise<string | null> {
    return this.account;
  }

  public async getProvider(): Promise<AbstractProvider | null> {
    return this.mainProvider;
  }

  async close() {
    this.valoraAccount = null;
  }
}
