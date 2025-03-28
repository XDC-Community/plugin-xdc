import { ByteArray, formatEther, parseEther, type Hex } from "viem";
import {
    Action,
    IAgentRuntime,
    Memory,
    HandlerCallback,
    State,
    composeContext,
    generateObjectDeprecated,
    ModelClass,
    elizaLogger,
} from "@elizaos/core";

import type { TransferParams, TransferResponse, Transaction } from "../types";
import { transferTemplate } from "../templates";
import { initWalletProvider, type WalletProvider, xdcWalletProvider } from "../providers/wallet";

export class TransferAction {
    constructor(private walletProvider: WalletProvider) {}

    async transfer(params: TransferParams): Promise<Transaction> {
        const chain = this.walletProvider.getCurrentChain();

        console.log(
            `Transferring: ${params.amount} tokens to ${params.recipient} on ${chain.name}`
        );

        // Convert recipient address if it starts with "xdc"
        let toAddress = params.recipient;
        if (typeof toAddress === 'string' && toAddress.startsWith('xdc')) {
            toAddress = `0x${toAddress.slice(3)}` as `0x${string}`;
        }

        // Get the current chain name
        const chainName = this.walletProvider.getCurrentChain().name.toLowerCase().includes('apothem')
            ? 'apothem'
            : 'xdc';

        try {
            // Parse amount to bigint
            const valueInWei = parseEther(params.amount || "0");

            // Use the wallet provider's transfer method
            const hash = await this.walletProvider.transfer(
                chainName,
                toAddress,
                valueInWei
            );

            return {
                hash,
                from: this.walletProvider.getAddress(),
                to: toAddress,
                value: valueInWei,
                data: "0x" as Hex,
            };
        } catch (error) {
            throw new Error(`Transfer failed: ${error.message}`);
        }
    }
}

export const transferAction: Action = {
    name: "transfer",
    description: "Transfer a token from one address to another on XDC chain",
    similes: ["TRANSFER", "SEND_TOKENS", "TOKEN_TRANSFER", "MOVE_TOKENS"],
    validate: async (runtime: IAgentRuntime) => {
        const privateKey = runtime.getSetting("XDC_PRIVATE_KEY");
        return typeof privateKey === "string" && privateKey.startsWith("0x");
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state: State,
        _options: any,
        callback: HandlerCallback
    ) => {
        try {
            if (!state) {
                state = (await runtime.composeState(message)) as State;
            } else {
                state = await runtime.updateRecentMessageState(state);
            }

            console.log("Transfer xdc_action handler called");

            state.walletInfo = await xdcWalletProvider.get(
                runtime,
                message,
                state
            );

            const transferContext = composeContext({
                state,
                template: transferTemplate,
            });

            // Use the deprecated method that doesn't require a schema
            const content = await generateObjectDeprecated({
                runtime,
                context: transferContext,
                modelClass: ModelClass.LARGE,
            }) as TransferParams;

            const walletProvider = initWalletProvider(runtime);
            const action = new TransferAction(walletProvider);

            // Ensure parameters are properly set with defaults
            const paramOptions: TransferParams = {
                token: content.token || null,
                amount: content.amount || "0",
                recipient: content.recipient,
            };

            const transferResp = await action.transfer(paramOptions);

            const response: TransferResponse = {
                txHash: transferResp.hash,
                recipient: transferResp.to as `0x${string}`,
                amount: formatEther(transferResp.value),
                token: paramOptions.token || walletProvider.getCurrentChain().nativeCurrency.symbol,
                data: transferResp.data,
            };

            callback?.({
                text: `Successfully transferred ${response.amount} ${response.token} to ${response.recipient}\nTransaction Hash: ${response.txHash}`,
                content: response,
            });

            return true;
        } catch (error) {
            elizaLogger.error(error);
            callback?.({
                text: `Error transferring tokens: ${error.message}`,
                content: { error: error.message },
            });
            return false;
        }
    },
    examples: [
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Transfer 1 XDC to 0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you transfer 1 XDC to 0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb on XDC",
                    action: "TRANSFER",
                    content: {
                        chain: "xdc",
                        token: "XDC",
                        amount: "1",
                        recipient: "0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb",
                    },
                },
            },
        ],
        [
            {
                user: "{{user1}}",
                content: {
                    text: "Transfer 1 token of 0x1234 to 0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb",
                },
            },
            {
                user: "{{agent}}",
                content: {
                    text: "I'll help you transfer 1 token of 0x1234 to 0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb on XDC",
                    action: "TRANSFER",
                    content: {
                        chain: "xdc",
                        token: "0x1234",
                        amount: "1",
                        recipient: "0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb",
                    },
                },
            },
        ],
    ],
};
