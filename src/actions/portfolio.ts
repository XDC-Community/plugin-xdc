import {
    composeContext,
    elizaLogger,
    generateObjectDeprecated,
    type HandlerCallback,
    ModelClass,
    type IAgentRuntime,
    type Memory,
    type State,
    Action,
} from "@elizaos/core";
import {
    xdcWalletProvider,
    initWalletProvider,
    type WalletProvider,
} from "../providers/wallet";
import { getPortfolioTemplate } from "../templates";
import type {
    GetPortfolioParams,
    GetPortfolioResponse,
    Portfolio,
    SupportedChain,
    TokenBalance,
} from "../types";
import { type Address, erc20Abi, formatEther, formatUnits } from "viem";
import NodeCache from "node-cache";

export { getPortfolioTemplate };

// Common token addresses on XDC network - add more as needed
const KNOWN_TOKENS: Record<string, { address: string; symbol: string }[]> = {
    xdc: [
        { address: "0x0000000000000000000000000000000000000000", symbol: "XDC" }, // Native token
        // Add other main XDC tokens here
    ],
    apothem: [
        { address: "0x0000000000000000000000000000000000000000", symbol: "XDC" }, // Native token
        // Add other Apothem tokens here
    ],
};

export class PortfolioAction {
    private cache: NodeCache;
    private readonly CACHE_EXPIRY_SEC = 60; // 1 minute cache

    constructor(private walletProvider: WalletProvider) {
        this.cache = new NodeCache({ stdTTL: this.CACHE_EXPIRY_SEC });
    }

    async getPortfolio(params: GetPortfolioParams): Promise<Portfolio> {
        elizaLogger.debug("Get portfolio params:", params);
        await this.validateAndNormalizeParams(params);
        elizaLogger.debug("Normalized portfolio params:", params);

        const { chain, address } = params;
        if (!address) {
            throw new Error("Address is required for getting portfolio");
        }

        if (!chain) {
            throw new Error("Chain is required for getting portfolio");
        }

        // Create portfolio response structure
        const portfolio: Portfolio = {
            chain,
            address,
            balances: [],
        };

        // Check cached result first
        const cacheKey = `portfolio_${chain}_${address}`;
        const cachedResult = this.cache.get<Portfolio>(cacheKey);
        if (cachedResult) {
            elizaLogger.debug("Returning cached portfolio result");
            return cachedResult;
        }

        try {
            // Set the chain
            this.walletProvider.switchChain(chain);

            // Get native token balance
            const nativeSymbol = this.walletProvider.getCurrentChain().nativeCurrency.symbol;
            const nativeBalanceWei = await this.walletProvider
                .getPublicClient(chain)
                .getBalance({ address });

            portfolio.balances.push({
                token: "0x0000000000000000000000000000000000000000",
                symbol: nativeSymbol,
                amount: formatEther(nativeBalanceWei),
            });

            // Get balances for known tokens on this chain
            if (KNOWN_TOKENS[chain]) {
                for (const token of KNOWN_TOKENS[chain]) {
                    if (token.address !== "0x0000000000000000000000000000000000000000") { // Skip native token
                        try {
                            const balance = await this.getERC20TokenBalance(
                                chain,
                                address,
                                token.address as `0x${string}`
                            );

                            // Only add tokens with non-zero balance
                            if (balance !== "0") {
                                portfolio.balances.push({
                                    token: token.address,
                                    symbol: token.symbol,
                                    amount: balance,
                                });
                            }
                        } catch (error) {
                            elizaLogger.error(`Error fetching balance for token ${token.symbol}:`, error.message);
                            // Continue with other tokens
                        }
                    }
                }
            }

            // Cache the result
            this.cache.set(cacheKey, portfolio);

            return portfolio;
        } catch (error) {
            throw new Error(`Failed to get portfolio: ${error.message}`);
        }
    }

    async getERC20TokenBalance(
        chain: SupportedChain,
        address: Address,
        tokenAddress: Address
    ): Promise<string> {
        const publicClient = this.walletProvider.getPublicClient(chain);

        const balance = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
        });

        const decimals = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: "decimals",
        });

        return formatUnits(balance, decimals);
    }

    async validateAndNormalizeParams(params: GetPortfolioParams): Promise<void> {
        // Set default chain if not provided
        if (!params.chain) {
            params.chain = this.walletProvider.getCurrentChain().name.toLowerCase().includes('apothem')
                ? 'apothem'
                : 'xdc';
        }

        // Set default address to wallet address if not provided
        if (!params.address) {
            params.address = this.walletProvider.getAddress();
        } else if (typeof params.address === 'string') {
            // Convert xdc address format to 0x format if needed
            if (params.address.startsWith('xdc')) {
                params.address = `0x${params.address.slice(3)}` as Address;
            }
        }
    }

    formatPortfolioOutput(portfolio: Portfolio): string {
        let output = `Portfolio for ${portfolio.address} on ${portfolio.chain} network:\n\n`;

        if (portfolio.balances.length === 0) {
            return output + "No tokens found in this wallet.";
        }

        portfolio.balances.forEach((balance) => {
            const symbol = balance.symbol || balance.token;
            output += `${symbol}: ${balance.amount}\n`;
        });

        return output;
    }
}

export const portfolioAction: Action = {
    name: "getPortfolio",
    description: "Get portfolio of XDC and tokens on the XDC network",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: Record<string, unknown>,
        callback?: HandlerCallback
    ) => {
        elizaLogger.log("Starting getPortfolio action for XDC...");

        // Initialize or update state
        let currentState = state;
        if (!currentState) {
            currentState = (await runtime.composeState(message)) as State;
        } else {
            currentState = await runtime.updateRecentMessageState(currentState);
        }

        // Get wallet info
        currentState.walletInfo = await xdcWalletProvider.get(
            runtime,
            message,
            currentState
        );

        // Compose portfolio context
        const getPortfolioContext = composeContext({
            state: currentState,
            template: getPortfolioTemplate,
        });

        const content = await generateObjectDeprecated({
            runtime,
            context: getPortfolioContext,
            modelClass: ModelClass.LARGE,
        }) as GetPortfolioParams;

        const walletProvider = initWalletProvider(runtime);
        const action = new PortfolioAction(walletProvider);

        const getPortfolioOptions: GetPortfolioParams = {
            chain: content.chain,
            address: content.address,
        };

        try {
            const portfolio = await action.getPortfolio(getPortfolioOptions);

            if (callback) {
                const formattedOutput = action.formatPortfolioOutput(portfolio);

                callback({
                    text: formattedOutput,
                    content: { portfolio } as GetPortfolioResponse,
                });
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error during portfolio check:", error.message);
            callback?.({
                text: `Get portfolio failed: ${error.message}`,
                content: { error: error.message },
            });
            return false;
        }
    },
    validate: async (runtime: IAgentRuntime) => {
        const privateKey = runtime.getSetting("XDC_PRIVATE_KEY");
        return typeof privateKey === "string" && privateKey.startsWith("0x");
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Show my XDC portfolio",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you check your portfolio on XDC network",
                    action: "GET_PORTFOLIO",
                    content: {
                        chain: "xdc",
                        address: "{{walletAddress}}",
                    },
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's in my wallet on XDC?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll show you the tokens in your wallet on XDC",
                    action: "GET_PORTFOLIO",
                    content: {
                        chain: "xdc",
                        address: "{{walletAddress}}",
                    },
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What tokens does xdc71C7656EC7ab88b098defB751B7401B5f6d8976F have?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check the tokens this address holds on XDC",
                    action: "GET_PORTFOLIO",
                    content: {
                        chain: "xdc",
                        address: "xdc71C7656EC7ab88b098defB751B7401B5f6d8976F",
                    },
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Show my Apothem testnet portfolio",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you check your portfolio on Apothem testnet",
                    action: "GET_PORTFOLIO",
                    content: {
                        chain: "apothem",
                        address: "{{walletAddress}}",
                    },
                },
            },
        ],
    ],
    similes: ["GET_PORTFOLIO", "CHECK_PORTFOLIO", "SHOW_PORTFOLIO", "LIST_TOKENS", "MY_TOKENS"],
};
