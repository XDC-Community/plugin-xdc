import type { Address, Hash, Hex } from "viem";

export type SupportedChain = "xdc" | "apothem";

export interface Transaction {
    hash: Hex;
    from: string;
    to: string;
    value: bigint;
    data: Hex;
}

export interface TransferParams {
    token?: string;
    amount?: string;
    recipient: Address;
}

export interface TransferResponse {
    txHash: Hash;
    recipient: Address;
    amount: string;
    token: string;
    data?: `0x${string}`;
}

export interface GetBalanceParams {
    chain?: SupportedChain;
    address?: Address;
    token?: string;
}

export interface TokenBalance {
    token: string;
    amount: string;
    symbol?: string;
    usdValue?: string;
}

export interface GetBalanceResponse {
    chain: SupportedChain;
    address: Address;
    balance?: TokenBalance;
}

export interface GetPortfolioParams {
    chain?: SupportedChain;
    address?: Address;
}

export interface Portfolio {
    chain: SupportedChain;
    address: Address;
    totalValue?: string;
    balances: TokenBalance[];
}

export interface GetPortfolioResponse {
    portfolio: Portfolio;
}
