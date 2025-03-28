import type {
    IAgentRuntime,
    Provider,
    Memory,
    State,
} from "@elizaos/core";
import type {
   Address,
   WalletClient,
   PublicClient,
   Chain,
   HttpTransport,
   Account,
   PrivateKeyAccount,
   Hex,
} from "viem";
import {
   createPublicClient,
   createWalletClient,
   formatUnits,
   http,
   erc20Abi,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as viemChains from "viem/chains";

import type { SupportedChain } from "../types";

export class WalletProvider {
   private currentChain: SupportedChain = "xdc";
   chains: Record<string, Chain> = { xdc: viemChains.xdc };
   account: PrivateKeyAccount;

   constructor(privateKey: `0x${string}`, chains?: Record<string, Chain>) {
       this.setAccount(privateKey);
       this.setChains(chains);

       if (chains && Object.keys(chains).length > 0) {
           this.setCurrentChain(Object.keys(chains)[0] as SupportedChain);
       }
   }

   getAccount(): PrivateKeyAccount {
       return this.account;
   }

   getAddress(): Address {
       return this.account.address;
   }

   getCurrentChain(): Chain {
       return this.chains[this.currentChain];
   }

   getPublicClient(
       chainName: SupportedChain
   ): PublicClient<HttpTransport, Chain, Account | undefined> {
       const transport = this.createHttpTransport(chainName);

       const publicClient = createPublicClient({
           chain: this.chains[chainName],
           transport,
       });
       return publicClient;
   }

   getWalletClient(chainName: SupportedChain): WalletClient {
       const transport = this.createHttpTransport(chainName);

       const walletClient = createWalletClient({
           chain: this.chains[chainName],
           transport,
           account: this.account,
       });

       return walletClient;
   }

   getChainConfigs(chainName: SupportedChain): Chain {
       const chain = viemChains[chainName];

       if (!chain?.id) {
           throw new Error("Invalid chain name");
       }

       return chain;
   }

   async formatAddress(address: string): Promise<Address> {
       if (!address || address.length === 0) {
           throw new Error("Empty address");
       }

       if (address.startsWith("0x") && address.length === 42) {
           return address as Address;
       }

       if (address.startsWith("xdc")) {
        // Convert xdc address to 0x format
        const converted = `0x${address.slice(3)}`;
        if (converted.length === 42) {
            return converted as Address;
        }
       }

       throw new Error("Invalid address");
   }

   async checkERC20Allowance(
       chain: SupportedChain,
       token: Address,
       owner: Address,
       spender: Address,
   ): Promise<bigint> {
       const publicClient = this.getPublicClient(chain);
       return await publicClient.readContract({
           address: token,
           abi: erc20Abi,
           functionName: "allowance",
           args: [owner, spender],
       });
   }

   async approveERC20(
       chain: SupportedChain,
       token: Address,
       spender: Address,
       amount: bigint
   ): Promise<Hex> {
       const publicClient = this.getPublicClient(chain);
       const walletClient = this.getWalletClient(chain);
       const { request } = await publicClient.simulateContract({
           account: this.account,
           address: token,
           abi: erc20Abi,
           functionName: "approve",
           args: [spender, amount],
       });

       return await walletClient.writeContract(request);
   }

   async transfer(
       chain: SupportedChain,
       toAddress: Address,
       amount: bigint,
       options?: {
           gas?: bigint;
           gasPrice?: bigint;
           data?: Hex;
       }
   ): Promise<Hex> {
       const walletClient = this.getWalletClient(chain);
       return await walletClient.sendTransaction({
           account: this.account,
           to: toAddress,
           value: amount,
           ...options,
       } as any);
   }

   async transferERC20(
       chain: SupportedChain,
       tokenAddress: Address,
       toAddress: Address,
       amount: bigint,
       options?: {
           gas?: bigint;
           gasPrice?: bigint;
       }
   ): Promise<Hex> {
       const publicClient = this.getPublicClient(chain);
       const walletClient = this.getWalletClient(chain);
       const { request } = await publicClient.simulateContract({
           account: this.account,
           address: tokenAddress as `0x${string}`,
           abi: erc20Abi,
           functionName: "transfer",
           args: [toAddress as `0x${string}`, amount],
           ...options,
       });

       return await walletClient.writeContract(request);
   }

   async getBalance(): Promise<string> {
       const client = this.getPublicClient(this.currentChain);
       const balance = await client.getBalance({
           address: this.account.address,
       });
       return formatUnits(balance, 18);
   }

   async getTokenAddress(
       chainName: SupportedChain,
       tokenSymbol: string
   ): Promise<string> {
       // This is a simplified implementation
       // In a real scenario, you might want to use an API or a token list
       if (tokenSymbol.toLowerCase() === 'xdc') {
           return '0x0000000000000000000000000000000000000000'; // Native token
       }

       // If it looks like an address, just return it
       if (tokenSymbol.startsWith('0x') && tokenSymbol.length === 42) {
           return tokenSymbol;
       }

       if (tokenSymbol.startsWith('xdc') && tokenSymbol.length === 43) {
           return `0x${tokenSymbol.slice(3)}`;
       }

       throw new Error(`Unknown token: ${tokenSymbol}`);
   }

   addChain(chain: Record<string, Chain>) {
       this.setChains(chain);
   }

   switchChain(chainName: SupportedChain, customRpcUrl?: string) {
       if (!this.chains[chainName]) {
           const chain = WalletProvider.genChainFromName(
               chainName,
               customRpcUrl
           );
           this.addChain({ [chainName]: chain });
       }
       this.setCurrentChain(chainName);
   }

   private setAccount = (pk: `0x${string}`) => {
       this.account = privateKeyToAccount(pk);
   };

   private setChains = (chains?: Record<string, Chain>) => {
       if (!chains) {
           return;
       }
       for (const chain of Object.keys(chains)) {
           this.chains[chain] = chains[chain];
       }
   };

   private setCurrentChain = (chain: SupportedChain) => {
       this.currentChain = chain;
   };

   private createHttpTransport = (chainName: SupportedChain) => {
       const chain = this.chains[chainName];

       if (chain.rpcUrls.custom) {
           return http(chain.rpcUrls.custom.http[0]);
       }
       return http(chain.rpcUrls.default.http[0]);
   };

   static genChainFromName(
       chainName: string,
       customRpcUrl?: string | null
   ): Chain {
       const baseChain = viemChains[chainName];

       if (!baseChain?.id) {
           throw new Error("Invalid chain name");
       }

       const viemChain: Chain = customRpcUrl
           ? {
                 ...baseChain,
                 rpcUrls: {
                     ...baseChain.rpcUrls,
                     custom: {
                         http: [customRpcUrl],
                     },
                 },
             }
           : baseChain;

       return viemChain;
   }
}

const genChainsFromRuntime = (
   runtime: IAgentRuntime
): Record<string, Chain> => {
   const chains = {};

   // Add XDC mainnet
   const xdcNetwork = runtime.getSetting("XDC_NETWORK");
   if (xdcNetwork === "mainnet") {
    chains["xdc"] = WalletProvider.genChainFromName("xdc", viemChains.xdc.rpcUrls.default.http[0]);
   } else if (xdcNetwork === "apothem") {
    chains["apothem"] = WalletProvider.genChainFromName("xdcTestnet", viemChains.xdcTestnet.rpcUrls.default.http[0]);
   }

   return chains;
};

export const initWalletProvider = (runtime: IAgentRuntime) => {
   const privateKey = runtime.getSetting("XDC_PRIVATE_KEY");
   if (!privateKey) {
       throw new Error("XDC_PRIVATE_KEY is missing");
   }

   const chains = genChainsFromRuntime(runtime);

   // Create wallet provider
   const walletProvider = new WalletProvider(privateKey as `0x${string}`, chains);

   // Set initial chain based on network setting
   const xdcNetwork = runtime.getSetting("XDC_NETWORK");
   if (xdcNetwork === "apothem") {
       walletProvider.switchChain("apothem");
   } else {
       walletProvider.switchChain("xdc");
   }

   return walletProvider;
};

export const xdcWalletProvider: Provider = {
   async get(
       runtime: IAgentRuntime,
       _message: Memory,
       _state?: State
   ): Promise<string | null> {
       try {
           const walletProvider = initWalletProvider(runtime);
           const address = walletProvider.getAddress();
           const balance = await walletProvider.getBalance();
           const chain = walletProvider.getCurrentChain();
           const networkName = chain.name.toLowerCase().includes('apothem') ? 'Apothem Testnet' : 'XDC Mainnet';

           return `XDC Network (${networkName}) Wallet Address: ${address}\nBalance: ${balance} ${chain.nativeCurrency.symbol}\nChain ID: ${chain.id}, Name: ${chain.name}`;
       } catch (error) {
           console.error("Error in XDC chain wallet provider:", error);
           return null;
       }
   },
};