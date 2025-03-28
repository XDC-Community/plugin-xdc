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
import { getBalanceTemplate } from "../templates";
import type {
    GetBalanceParams,
    GetBalanceResponse,
    SupportedChain,
} from "../types";
import { type Address, erc20Abi, formatEther, formatUnits } from "viem";

export { getBalanceTemplate };

export class GetBalanceAction {
    constructor(private walletProvider: WalletProvider) {}

    async getBalance(params: GetBalanceParams): Promise<GetBalanceResponse> {
        elizaLogger.debug("Get balance params:", params);
        await this.validateAndNormalizeParams(params);
        elizaLogger.debug("Normalized get balance params:", params);

        const { chain, address, token } = params;
        if (!address) {
            throw new Error("Address is required for getting balance");
        }

        if (!chain) {
            throw new Error("Chain is required for getting balance");
        }

        this.walletProvider.switchChain(chain);
        const nativeSymbol =
            this.walletProvider.getCurrentChain().nativeCurrency.symbol;

        let queryNativeToken = false;
        if (
            !token ||
            token === "" ||
            token.toLowerCase() === "xdc"
        ) {
            queryNativeToken = true;
        }

        const resp: GetBalanceResponse = {
            chain,
            address,
        };

        // If ERC20 token is requested
        if (!queryNativeToken) {
            let amount: string;
            if (token.startsWith("0x") || token.startsWith("xdc")) {
                // Convert xdc address format to 0x format if needed
                let tokenAddress = token;
                if (token.startsWith("xdc")) {
                    tokenAddress = `0x${token.slice(3)}`;
                }

                amount = await this.getERC20TokenBalance(
                    chain,
                    address,
                    tokenAddress as `0x${string}`
                );
            } else {
                throw new Error(
                    "Only token addresses starting with 0x or xdc are supported. For native XDC token, use 'XDC' as token symbol."
                );
            }

            resp.balance = { token, amount };
        } else {
            // If native token is requested
            const nativeBalanceWei = await this.walletProvider
                .getPublicClient(chain)
                .getBalance({ address });
            resp.balance = {
                token: nativeSymbol,
                amount: formatEther(nativeBalanceWei),
            };
        }

        return resp;
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

    async validateAndNormalizeParams(params: GetBalanceParams): Promise<void> {
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
}

export const getBalanceAction: Action = {
    name: "getBalance",
    description: "Get balance of XDC or tokens on the XDC network",
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: Record<string, unknown>,
        callback?: HandlerCallback
    ) => {
        elizaLogger.log("Starting getBalance action for XDC...");

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

        // Compose balance context
        const getBalanceContext = composeContext({
            state: currentState,
            template: getBalanceTemplate,
        });

        const content = await generateObjectDeprecated({
            runtime,
            context: getBalanceContext,
            modelClass: ModelClass.LARGE,
        }) as GetBalanceParams;

        const walletProvider = initWalletProvider(runtime);
        const action = new GetBalanceAction(walletProvider);

        const getBalanceOptions: GetBalanceParams = {
            chain: content.chain,
            address: content.address,
            token: content.token,
        };

        try {
            const getBalanceResp = await action.getBalance(getBalanceOptions);
            if (callback) {
                let text = `No balance found for ${getBalanceResp.address} on ${getBalanceResp.chain}`;
                if (getBalanceResp.balance) {
                    text = `Balance of ${getBalanceResp.address} on ${getBalanceResp.chain}:\n${
                        getBalanceResp.balance.token
                    }: ${getBalanceResp.balance.amount}`;
                }
                callback({
                    text,
                    content: { ...getBalanceResp },
                });
            }
            return true;
        } catch (error) {
            elizaLogger.error("Error during get balance:", error.message);
            callback?.({
                text: `Get balance failed: ${error.message}`,
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
                    text: "Check my XDC balance",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you check your XDC balance",
                    action: "GET_BALANCE",
                    content: {
                        chain: "xdc",
                        address: "{{walletAddress}}",
                        token: "XDC",
                    },
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Check my balance of token 0x1234 on XDC",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you check your balance of token 0x1234 on XDC",
                    action: "GET_BALANCE",
                    content: {
                        chain: "xdc",
                        address: "{{walletAddress}}",
                        token: "0x1234",
                    },
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "What's the XDC balance of xdc71C7656EC7ab88b098defB751B7401B5f6d8976F?",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll check the XDC balance of that address",
                    action: "GET_BALANCE",
                    content: {
                        chain: "xdc",
                        address: "xdc71C7656EC7ab88b098defB751B7401B5f6d8976F",
                        token: "XDC",
                    },
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Check my wallet balance on Apothem testnet",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you check your wallet balance on Apothem testnet",
                    action: "GET_BALANCE",
                    content: {
                        chain: "apothem",
                        address: "{{walletAddress}}",
                        token: "XDC",
                    },
                },
            },
        ],
    ],
    similes: ["GET_BALANCE", "CHECK_BALANCE", "SHOW_BALANCE"],
};
