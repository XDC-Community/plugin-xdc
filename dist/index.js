// src/actions/transfer.ts
import { formatEther, parseEther } from "viem";
import {
  composeContext,
  generateObjectDeprecated,
  ModelClass,
  elizaLogger
} from "@elizaos/core";

// src/templates/index.ts
var transferTemplate = `

{{recentMessages}}

Given the recent messages, extract the following information about the requested token transfer:
- Token symbol or contract address(string starting with "0x" or "xdc"). Optional.
- Recipient wallet address. Must be a valid Ethereum address starting with "0x" or "xdc".
- Amount to transfer. Must be a string representing the amount in ether (only number without coin symbol, e.g., "0.1").


Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined:

\`\`\`json
{
    "token": string | null,
    "amount": string | null,
    "recipient": string
}
\`\`\`
`;
var getBalanceTemplate = `

{{recentMessages}}

Given the recent messages, extract the following information about the requested balance check:
- XDC chain to query (options: "xdc" for mainnet, "apothem" for testnet). If not specified, use the current network.
- Wallet address to check (an address starting with "0x" or "xdc"). If not provided, use the agent's own wallet.
- Token symbol or contract address(string starting with "0x" or "xdc") to check the balance of. If not provided or is "XDC", the native XDC token balance will be checked.

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined:

\`\`\`json
{
    "chain": string | null,
    "address": string | null,
    "token": string | null
}
\`\`\`
`;
var getPortfolioTemplate = `

{{recentMessages}}

Given the recent messages, extract the following information about the requested portfolio check:
- XDC chain to query (options: "xdc" for mainnet, "apothem" for testnet). If not specified, use the current network.
- Wallet address to check (an address starting with "0x" or "xdc"). If not provided, use the agent's own wallet.

Respond with a JSON markdown block containing only the extracted values. Use null for any values that cannot be determined:

\`\`\`json
{
    "chain": string | null,
    "address": string | null
}
\`\`\`
`;

// src/providers/wallet.ts
import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  http,
  erc20Abi
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as viemChains from "viem/chains";
var WalletProvider = class _WalletProvider {
  currentChain = "xdc";
  chains = { xdc: viemChains.xdc };
  account;
  constructor(privateKey, chains) {
    this.setAccount(privateKey);
    this.setChains(chains);
    if (chains && Object.keys(chains).length > 0) {
      this.setCurrentChain(Object.keys(chains)[0]);
    }
  }
  getAccount() {
    return this.account;
  }
  getAddress() {
    return this.account.address;
  }
  getCurrentChain() {
    return this.chains[this.currentChain];
  }
  getPublicClient(chainName) {
    const transport = this.createHttpTransport(chainName);
    const publicClient = createPublicClient({
      chain: this.chains[chainName],
      transport
    });
    return publicClient;
  }
  getWalletClient(chainName) {
    const transport = this.createHttpTransport(chainName);
    const walletClient = createWalletClient({
      chain: this.chains[chainName],
      transport,
      account: this.account
    });
    return walletClient;
  }
  getChainConfigs(chainName) {
    const chain = viemChains[chainName];
    if (!chain?.id) {
      throw new Error("Invalid chain name");
    }
    return chain;
  }
  async formatAddress(address) {
    if (!address || address.length === 0) {
      throw new Error("Empty address");
    }
    if (address.startsWith("0x") && address.length === 42) {
      return address;
    }
    if (address.startsWith("xdc")) {
      const converted = `0x${address.slice(3)}`;
      if (converted.length === 42) {
        return converted;
      }
    }
    throw new Error("Invalid address");
  }
  async checkERC20Allowance(chain, token, owner, spender) {
    const publicClient = this.getPublicClient(chain);
    return await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender]
    });
  }
  async approveERC20(chain, token, spender, amount) {
    const publicClient = this.getPublicClient(chain);
    const walletClient = this.getWalletClient(chain);
    const { request } = await publicClient.simulateContract({
      account: this.account,
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, amount]
    });
    return await walletClient.writeContract(request);
  }
  async transfer(chain, toAddress, amount, options) {
    const walletClient = this.getWalletClient(chain);
    return await walletClient.sendTransaction({
      account: this.account,
      to: toAddress,
      value: amount,
      ...options
    });
  }
  async transferERC20(chain, tokenAddress, toAddress, amount, options) {
    const publicClient = this.getPublicClient(chain);
    const walletClient = this.getWalletClient(chain);
    const { request } = await publicClient.simulateContract({
      account: this.account,
      address: tokenAddress,
      abi: erc20Abi,
      functionName: "transfer",
      args: [toAddress, amount],
      ...options
    });
    return await walletClient.writeContract(request);
  }
  async getBalance() {
    const client = this.getPublicClient(this.currentChain);
    const balance = await client.getBalance({
      address: this.account.address
    });
    return formatUnits(balance, 18);
  }
  async getTokenAddress(chainName, tokenSymbol) {
    if (tokenSymbol.toLowerCase() === "xdc") {
      return "0x0000000000000000000000000000000000000000";
    }
    if (tokenSymbol.startsWith("0x") && tokenSymbol.length === 42) {
      return tokenSymbol;
    }
    if (tokenSymbol.startsWith("xdc") && tokenSymbol.length === 43) {
      return `0x${tokenSymbol.slice(3)}`;
    }
    throw new Error(`Unknown token: ${tokenSymbol}`);
  }
  addChain(chain) {
    this.setChains(chain);
  }
  switchChain(chainName, customRpcUrl) {
    if (!this.chains[chainName]) {
      const chain = _WalletProvider.genChainFromName(
        chainName,
        customRpcUrl
      );
      this.addChain({ [chainName]: chain });
    }
    this.setCurrentChain(chainName);
  }
  setAccount = (pk) => {
    this.account = privateKeyToAccount(pk);
  };
  setChains = (chains) => {
    if (!chains) {
      return;
    }
    for (const chain of Object.keys(chains)) {
      this.chains[chain] = chains[chain];
    }
  };
  setCurrentChain = (chain) => {
    this.currentChain = chain;
  };
  createHttpTransport = (chainName) => {
    const chain = this.chains[chainName];
    if (chain.rpcUrls.custom) {
      return http(chain.rpcUrls.custom.http[0]);
    }
    return http(chain.rpcUrls.default.http[0]);
  };
  static genChainFromName(chainName, customRpcUrl) {
    const baseChain = viemChains[chainName];
    if (!baseChain?.id) {
      throw new Error("Invalid chain name");
    }
    const viemChain = customRpcUrl ? {
      ...baseChain,
      rpcUrls: {
        ...baseChain.rpcUrls,
        custom: {
          http: [customRpcUrl]
        }
      }
    } : baseChain;
    return viemChain;
  }
};
var genChainsFromRuntime = (runtime) => {
  const chains = {};
  const xdcNetwork = runtime.getSetting("XDC_NETWORK");
  if (xdcNetwork === "mainnet") {
    chains["xdc"] = WalletProvider.genChainFromName("xdc", viemChains.xdc.rpcUrls.default.http[0]);
  } else if (xdcNetwork === "apothem") {
    chains["apothem"] = WalletProvider.genChainFromName("xdcTestnet", viemChains.xdcTestnet.rpcUrls.default.http[0]);
  }
  return chains;
};
var initWalletProvider = (runtime) => {
  const privateKey = runtime.getSetting("XDC_PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("XDC_PRIVATE_KEY is missing");
  }
  const chains = genChainsFromRuntime(runtime);
  const walletProvider = new WalletProvider(privateKey, chains);
  const xdcNetwork = runtime.getSetting("XDC_NETWORK");
  if (xdcNetwork === "apothem") {
    walletProvider.switchChain("apothem");
  } else {
    walletProvider.switchChain("xdc");
  }
  return walletProvider;
};
var xdcWalletProvider = {
  async get(runtime, _message, _state) {
    try {
      const walletProvider = initWalletProvider(runtime);
      const address = walletProvider.getAddress();
      const balance = await walletProvider.getBalance();
      const chain = walletProvider.getCurrentChain();
      const networkName = chain.name.toLowerCase().includes("apothem") ? "Apothem Testnet" : "XDC Mainnet";
      return `XDC Network (${networkName}) Wallet Address: ${address}
Balance: ${balance} ${chain.nativeCurrency.symbol}
Chain ID: ${chain.id}, Name: ${chain.name}`;
    } catch (error) {
      console.error("Error in XDC chain wallet provider:", error);
      return null;
    }
  }
};

// src/actions/transfer.ts
var TransferAction = class {
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  async transfer(params) {
    const chain = this.walletProvider.getCurrentChain();
    console.log(
      `Transferring: ${params.amount} tokens to ${params.recipient} on ${chain.name}`
    );
    let toAddress = params.recipient;
    if (typeof toAddress === "string" && toAddress.startsWith("xdc")) {
      toAddress = `0x${toAddress.slice(3)}`;
    }
    const chainName = this.walletProvider.getCurrentChain().name.toLowerCase().includes("apothem") ? "apothem" : "xdc";
    try {
      const valueInWei = parseEther(params.amount || "0");
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
        data: "0x"
      };
    } catch (error) {
      throw new Error(`Transfer failed: ${error.message}`);
    }
  }
};
var transferAction = {
  name: "transfer",
  description: "Transfer a token from one address to another on XDC chain",
  similes: ["TRANSFER", "SEND_TOKENS", "TOKEN_TRANSFER", "MOVE_TOKENS"],
  validate: async (runtime) => {
    const privateKey = runtime.getSetting("XDC_PRIVATE_KEY");
    return typeof privateKey === "string" && privateKey.startsWith("0x");
  },
  handler: async (runtime, message, state, _options, callback) => {
    try {
      if (!state) {
        state = await runtime.composeState(message);
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
        template: transferTemplate
      });
      const content = await generateObjectDeprecated({
        runtime,
        context: transferContext,
        modelClass: ModelClass.LARGE
      });
      const walletProvider = initWalletProvider(runtime);
      const action = new TransferAction(walletProvider);
      const paramOptions = {
        token: content.token || null,
        amount: content.amount || "0",
        recipient: content.recipient
      };
      const transferResp = await action.transfer(paramOptions);
      const response = {
        txHash: transferResp.hash,
        recipient: transferResp.to,
        amount: formatEther(transferResp.value),
        token: paramOptions.token || walletProvider.getCurrentChain().nativeCurrency.symbol,
        data: transferResp.data
      };
      callback?.({
        text: `Successfully transferred ${response.amount} ${response.token} to ${response.recipient}
Transaction Hash: ${response.txHash}`,
        content: response
      });
      return true;
    } catch (error) {
      elizaLogger.error(error);
      callback?.({
        text: `Error transferring tokens: ${error.message}`,
        content: { error: error.message }
      });
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Transfer 1 XDC to 0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb"
        }
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
            recipient: "0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb"
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Transfer 1 token of 0x1234 to 0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb"
        }
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
            recipient: "0x26939338972fa11eFcA1A438fa5D1Daa54a82Adb"
          }
        }
      }
    ]
  ]
};

// src/actions/getBalance.ts
import {
  composeContext as composeContext2,
  elizaLogger as elizaLogger2,
  generateObjectDeprecated as generateObjectDeprecated2,
  ModelClass as ModelClass2
} from "@elizaos/core";
import { erc20Abi as erc20Abi2, formatEther as formatEther2, formatUnits as formatUnits2 } from "viem";
var GetBalanceAction = class {
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
  }
  async getBalance(params) {
    elizaLogger2.debug("Get balance params:", params);
    await this.validateAndNormalizeParams(params);
    elizaLogger2.debug("Normalized get balance params:", params);
    const { chain, address, token } = params;
    if (!address) {
      throw new Error("Address is required for getting balance");
    }
    if (!chain) {
      throw new Error("Chain is required for getting balance");
    }
    this.walletProvider.switchChain(chain);
    const nativeSymbol = this.walletProvider.getCurrentChain().nativeCurrency.symbol;
    let queryNativeToken = false;
    if (!token || token === "" || token.toLowerCase() === "xdc") {
      queryNativeToken = true;
    }
    const resp = {
      chain,
      address
    };
    if (!queryNativeToken) {
      let amount;
      if (token.startsWith("0x") || token.startsWith("xdc")) {
        let tokenAddress = token;
        if (token.startsWith("xdc")) {
          tokenAddress = `0x${token.slice(3)}`;
        }
        amount = await this.getERC20TokenBalance(
          chain,
          address,
          tokenAddress
        );
      } else {
        throw new Error(
          "Only token addresses starting with 0x or xdc are supported. For native XDC token, use 'XDC' as token symbol."
        );
      }
      resp.balance = { token, amount };
    } else {
      const nativeBalanceWei = await this.walletProvider.getPublicClient(chain).getBalance({ address });
      resp.balance = {
        token: nativeSymbol,
        amount: formatEther2(nativeBalanceWei)
      };
    }
    return resp;
  }
  async getERC20TokenBalance(chain, address, tokenAddress) {
    const publicClient = this.walletProvider.getPublicClient(chain);
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi2,
      functionName: "balanceOf",
      args: [address]
    });
    const decimals = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi2,
      functionName: "decimals"
    });
    return formatUnits2(balance, decimals);
  }
  async validateAndNormalizeParams(params) {
    if (!params.chain) {
      params.chain = this.walletProvider.getCurrentChain().name.toLowerCase().includes("apothem") ? "apothem" : "xdc";
    }
    if (!params.address) {
      params.address = this.walletProvider.getAddress();
    } else if (typeof params.address === "string") {
      if (params.address.startsWith("xdc")) {
        params.address = `0x${params.address.slice(3)}`;
      }
    }
  }
};
var getBalanceAction = {
  name: "getBalance",
  description: "Get balance of XDC or tokens on the XDC network",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger2.log("Starting getBalance action for XDC...");
    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.updateRecentMessageState(currentState);
    }
    currentState.walletInfo = await xdcWalletProvider.get(
      runtime,
      message,
      currentState
    );
    const getBalanceContext = composeContext2({
      state: currentState,
      template: getBalanceTemplate
    });
    const content = await generateObjectDeprecated2({
      runtime,
      context: getBalanceContext,
      modelClass: ModelClass2.LARGE
    });
    const walletProvider = initWalletProvider(runtime);
    const action = new GetBalanceAction(walletProvider);
    const getBalanceOptions = {
      chain: content.chain,
      address: content.address,
      token: content.token
    };
    try {
      const getBalanceResp = await action.getBalance(getBalanceOptions);
      if (callback) {
        let text = `No balance found for ${getBalanceResp.address} on ${getBalanceResp.chain}`;
        if (getBalanceResp.balance) {
          text = `Balance of ${getBalanceResp.address} on ${getBalanceResp.chain}:
${getBalanceResp.balance.token}: ${getBalanceResp.balance.amount}`;
        }
        callback({
          text,
          content: { ...getBalanceResp }
        });
      }
      return true;
    } catch (error) {
      elizaLogger2.error("Error during get balance:", error.message);
      callback?.({
        text: `Get balance failed: ${error.message}`,
        content: { error: error.message }
      });
      return false;
    }
  },
  validate: async (runtime) => {
    const privateKey = runtime.getSetting("XDC_PRIVATE_KEY");
    return typeof privateKey === "string" && privateKey.startsWith("0x");
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Check my XDC balance"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I'll help you check your XDC balance",
          action: "GET_BALANCE",
          content: {
            chain: "xdc",
            address: "{{walletAddress}}",
            token: "XDC"
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Check my balance of token 0x1234 on XDC"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I'll help you check your balance of token 0x1234 on XDC",
          action: "GET_BALANCE",
          content: {
            chain: "xdc",
            address: "{{walletAddress}}",
            token: "0x1234"
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "What's the XDC balance of xdc71C7656EC7ab88b098defB751B7401B5f6d8976F?"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I'll check the XDC balance of that address",
          action: "GET_BALANCE",
          content: {
            chain: "xdc",
            address: "xdc71C7656EC7ab88b098defB751B7401B5f6d8976F",
            token: "XDC"
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Check my wallet balance on Apothem testnet"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I'll help you check your wallet balance on Apothem testnet",
          action: "GET_BALANCE",
          content: {
            chain: "apothem",
            address: "{{walletAddress}}",
            token: "XDC"
          }
        }
      }
    ]
  ],
  similes: ["GET_BALANCE", "CHECK_BALANCE", "SHOW_BALANCE"]
};

// src/actions/portfolio.ts
import {
  composeContext as composeContext3,
  elizaLogger as elizaLogger3,
  generateObjectDeprecated as generateObjectDeprecated3,
  ModelClass as ModelClass3
} from "@elizaos/core";
import { erc20Abi as erc20Abi3, formatEther as formatEther3, formatUnits as formatUnits3 } from "viem";
import NodeCache from "node-cache";
var KNOWN_TOKENS = {
  xdc: [
    { address: "0x0000000000000000000000000000000000000000", symbol: "XDC" }
    // Native token
    // Add other main XDC tokens here
  ],
  apothem: [
    { address: "0x0000000000000000000000000000000000000000", symbol: "XDC" }
    // Native token
    // Add other Apothem tokens here
  ]
};
var PortfolioAction = class {
  // 1 minute cache
  constructor(walletProvider) {
    this.walletProvider = walletProvider;
    this.cache = new NodeCache({ stdTTL: this.CACHE_EXPIRY_SEC });
  }
  cache;
  CACHE_EXPIRY_SEC = 60;
  async getPortfolio(params) {
    elizaLogger3.debug("Get portfolio params:", params);
    await this.validateAndNormalizeParams(params);
    elizaLogger3.debug("Normalized portfolio params:", params);
    const { chain, address } = params;
    if (!address) {
      throw new Error("Address is required for getting portfolio");
    }
    if (!chain) {
      throw new Error("Chain is required for getting portfolio");
    }
    const portfolio = {
      chain,
      address,
      balances: []
    };
    const cacheKey = `portfolio_${chain}_${address}`;
    const cachedResult = this.cache.get(cacheKey);
    if (cachedResult) {
      elizaLogger3.debug("Returning cached portfolio result");
      return cachedResult;
    }
    try {
      this.walletProvider.switchChain(chain);
      const nativeSymbol = this.walletProvider.getCurrentChain().nativeCurrency.symbol;
      const nativeBalanceWei = await this.walletProvider.getPublicClient(chain).getBalance({ address });
      portfolio.balances.push({
        token: "0x0000000000000000000000000000000000000000",
        symbol: nativeSymbol,
        amount: formatEther3(nativeBalanceWei)
      });
      if (KNOWN_TOKENS[chain]) {
        for (const token of KNOWN_TOKENS[chain]) {
          if (token.address !== "0x0000000000000000000000000000000000000000") {
            try {
              const balance = await this.getERC20TokenBalance(
                chain,
                address,
                token.address
              );
              if (balance !== "0") {
                portfolio.balances.push({
                  token: token.address,
                  symbol: token.symbol,
                  amount: balance
                });
              }
            } catch (error) {
              elizaLogger3.error(`Error fetching balance for token ${token.symbol}:`, error.message);
            }
          }
        }
      }
      this.cache.set(cacheKey, portfolio);
      return portfolio;
    } catch (error) {
      throw new Error(`Failed to get portfolio: ${error.message}`);
    }
  }
  async getERC20TokenBalance(chain, address, tokenAddress) {
    const publicClient = this.walletProvider.getPublicClient(chain);
    const balance = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi3,
      functionName: "balanceOf",
      args: [address]
    });
    const decimals = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi3,
      functionName: "decimals"
    });
    return formatUnits3(balance, decimals);
  }
  async validateAndNormalizeParams(params) {
    if (!params.chain) {
      params.chain = this.walletProvider.getCurrentChain().name.toLowerCase().includes("apothem") ? "apothem" : "xdc";
    }
    if (!params.address) {
      params.address = this.walletProvider.getAddress();
    } else if (typeof params.address === "string") {
      if (params.address.startsWith("xdc")) {
        params.address = `0x${params.address.slice(3)}`;
      }
    }
  }
  formatPortfolioOutput(portfolio) {
    let output = `Portfolio for ${portfolio.address} on ${portfolio.chain} network:

`;
    if (portfolio.balances.length === 0) {
      return output + "No tokens found in this wallet.";
    }
    portfolio.balances.forEach((balance) => {
      const symbol = balance.symbol || balance.token;
      output += `${symbol}: ${balance.amount}
`;
    });
    return output;
  }
};
var portfolioAction = {
  name: "getPortfolio",
  description: "Get portfolio of XDC and tokens on the XDC network",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger3.log("Starting getPortfolio action for XDC...");
    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.updateRecentMessageState(currentState);
    }
    currentState.walletInfo = await xdcWalletProvider.get(
      runtime,
      message,
      currentState
    );
    const getPortfolioContext = composeContext3({
      state: currentState,
      template: getPortfolioTemplate
    });
    const content = await generateObjectDeprecated3({
      runtime,
      context: getPortfolioContext,
      modelClass: ModelClass3.LARGE
    });
    const walletProvider = initWalletProvider(runtime);
    const action = new PortfolioAction(walletProvider);
    const getPortfolioOptions = {
      chain: content.chain,
      address: content.address
    };
    try {
      const portfolio = await action.getPortfolio(getPortfolioOptions);
      if (callback) {
        const formattedOutput = action.formatPortfolioOutput(portfolio);
        callback({
          text: formattedOutput,
          content: { portfolio }
        });
      }
      return true;
    } catch (error) {
      elizaLogger3.error("Error during portfolio check:", error.message);
      callback?.({
        text: `Get portfolio failed: ${error.message}`,
        content: { error: error.message }
      });
      return false;
    }
  },
  validate: async (runtime) => {
    const privateKey = runtime.getSetting("XDC_PRIVATE_KEY");
    return typeof privateKey === "string" && privateKey.startsWith("0x");
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Show my XDC portfolio"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I'll help you check your portfolio on XDC network",
          action: "GET_PORTFOLIO",
          content: {
            chain: "xdc",
            address: "{{walletAddress}}"
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "What's in my wallet on XDC?"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I'll show you the tokens in your wallet on XDC",
          action: "GET_PORTFOLIO",
          content: {
            chain: "xdc",
            address: "{{walletAddress}}"
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "What tokens does xdc71C7656EC7ab88b098defB751B7401B5f6d8976F have?"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I'll check the tokens this address holds on XDC",
          action: "GET_PORTFOLIO",
          content: {
            chain: "xdc",
            address: "xdc71C7656EC7ab88b098defB751B7401B5f6d8976F"
          }
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Show my Apothem testnet portfolio"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I'll help you check your portfolio on Apothem testnet",
          action: "GET_PORTFOLIO",
          content: {
            chain: "apothem",
            address: "{{walletAddress}}"
          }
        }
      }
    ]
  ],
  similes: ["GET_PORTFOLIO", "CHECK_PORTFOLIO", "SHOW_PORTFOLIO", "LIST_TOKENS", "MY_TOKENS"]
};

// src/index.ts
console.log("XDC IS BEING INITIALIZED");
var xdcPlugin = {
  name: "xdc",
  description: "XDC Plugin for Eliza",
  actions: [
    transferAction,
    getBalanceAction,
    portfolioAction
  ],
  evaluators: [],
  providers: []
};
var index_default = xdcPlugin;
export {
  index_default as default,
  xdcPlugin
};
//# sourceMappingURL=index.js.map