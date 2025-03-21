import type { Plugin } from "@elizaos/core";
import { transferAction } from "./actions/transfer";
import { getBalanceAction } from "./actions/getBalance";
import { portfolioAction } from "./actions/portfolio";
console.log("XDC IS BEING INITIALIZED")

export const xdcPlugin: Plugin = {
    name: "xdc",
    description: "XDC Plugin for Eliza",
    actions: [
        transferAction,
        getBalanceAction,
        portfolioAction
    ],
    evaluators: [],
    providers: [],
};

export default xdcPlugin;