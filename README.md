FriendTech Clone in Ralph

## Getting Started

### Install

```
npm install
```

### Start a local devnet for testing and development

```
npx @alephium/cli@latest devnet start
```

### Deploy the FriendTech contracts

```bash
# In this case devnet
npx @alephium/cli deploy -n devnet
```

This will compile and deploy the FriendTech contracts to all of the
4 groups on devnet.

Before deployment, you might want to just compile and test the
contracts first:

```bash
# Compile
npx @alephium/cli compile

# Test
npx @alephium/cli test
```

## Learn More

To learn more about smart contract development on Alephium, take a
look at the following resources:

- [Alephium Web3 SDK Guide](https://docs.alephium.org/dapps/alephium-web3/) - Learn about Alephium Web3 SDK
- [Ralph Language](https://docs.alephium.org/ralph/getting-started) - A guide to the Ralph programming language

You can check out the [Alephium GitHub
repositories](https://github.com/alephium) for more information - your
feedback and contributions are welcome!
