# @elizaos/plugin-xdc

A plugin for interacting with the XDC blockchain network within the ElizaOS ecosystem.

## Description
The XDC plugin enables seamless token transfers and balance checking on the XDC blockchain networks (mainnet and Apothem testnet). It provides functionality to transfer native XDC tokens, check wallet balances, and manage your portfolio.

## Installation

```bash
pnpm install @elizaos/plugin-xdc
```

## Configuration

The plugin requires the following environment variables to be set:
```typescript
XDC_PRIVATE_KEY=<Your XDC wallet private key>
XDC_NETWORK=<Network to use: mainnet or apothem>
```

## Usage

### Basic Integration

```typescript
import { xdcPlugin } from '@elizaos/plugin-xdc';
```

### Example Commands

```typescript
// The plugin responds to natural language commands like:

"Transfer 100 XDC to xdc7989f8..4623"
"Check my XDC balance"
"Show my portfolio on XDC network"
```

## API Reference

### Actions

#### TRANSFER

Transfers XDC tokens from the agent's wallet to another address.

**Aliases:**
- TRANSFER_ON_XDC
- SEND_ON_XDC
- PAY_ON_XDC

#### GET_BALANCE

Retrieves the balance of XDC tokens for a specified address.

**Aliases:**
- CHECK_BALANCE_ON_XDC
- VIEW_BALANCE_ON_XDC

#### PORTFOLIO

Provides a comprehensive view of your token holdings on the XDC network.

**Aliases:**
- VIEW_PORTFOLIO_ON_XDC
- CHECK_PORTFOLIO_ON_XDC

## Common Issues & Troubleshooting

1. **Transaction Failures**
   - Verify wallet has sufficient balance
   - Check recipient address format
   - Ensure private key is correctly set
   - Verify network connectivity

2. **Configuration Issues**
   - Verify all required environment variables are set
   - Ensure private key format is correct
   - Check that XDC_NETWORK is set to either "mainnet" or "apothem"

## Security Best Practices

1. **Private Key Management**
   - Store private key securely using environment variables
   - Never commit private keys to version control
   - Use separate wallets for development and production
   - Monitor wallet activity regularly

## Development Guide

### Setting Up Development Environment

1. Clone the repository
2. Install dependencies:

```bash
pnpm install
```

3. Build the plugin:

```bash
pnpm run build
```

4. Run the plugin:

```bash
pnpm run dev
```

## Future Enhancements

1. **Smart Contract Interactions**
   - Deploy and interact with smart contracts
   - Template-based contract deployment
   - ABI management system

2. **Token Management**
   - Support for XRC tokens
   - Token transfer history
   - Token discovery features

3. **Wallet Enhancements**
   - Multiple wallet support
   - Hardware wallet integration
   - Address book features

4. **Network Features**
   - Cross-chain operations
   - Gas fee optimization
   - Transaction batch processing

5. **Analytics and Monitoring**
   - Transaction tracking dashboard
   - Network statistics
   - Performance metrics

We welcome community feedback and contributions to help prioritize these enhancements.

## Contributing

Contributions are welcome! Please see the [CONTRIBUTING.md](CONTRIBUTING.md) file for more information.

## Credits

This plugin integrates with and builds upon the XDC Network technology:

- [XDC Network](https://xinfin.org/): XDC blockchain platform
- [Viem](https://viem.sh/): Ethereum library used for blockchain interactions

Special thanks to:
- The XDC development team
- The Eliza community for their contributions and feedback

For more information about XDC capabilities:
- [XDC Documentation](https://docs.xdc.org/)
- [Apothem Testnet](https://apothem.network/)

## License

This plugin is part of the Eliza project. See the main project repository for license information.
