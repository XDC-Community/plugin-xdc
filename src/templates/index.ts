export const transferTemplate = `

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

export const getBalanceTemplate = `

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

export const getPortfolioTemplate = `

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
