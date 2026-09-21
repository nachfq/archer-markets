import { erc20Abi, formatEther, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { clients, quoteAddress, stockMarkets, reportError } from './config.mjs';
try {
  const { chain, publicClient } = await clients('testnet', false);
  const stocks = stockMarkets();
  const quote = quoteAddress();
  const [stockMetadata, quoteCode] = await Promise.all([
    Promise.all(stocks.map(async stock => {
      const [code, decimals, symbol] = await Promise.all([
        publicClient.getCode({ address: stock.address }),
        publicClient.readContract({ address: stock.address, abi: erc20Abi, functionName: 'decimals' }),
        publicClient.readContract({ address: stock.address, abi: erc20Abi, functionName: 'symbol' }),
      ]);
      if (!code || code === '0x' || decimals !== 18 || symbol !== stock.symbol) throw new Error(`${stock.symbol} is not the expected 18-decimal Stock Token.`);
      return { ...stock, decimals };
    })),
    publicClient.getCode({ address: quote }),
  ]);
  if (!quoteCode || quoteCode === '0x') throw new Error('Configured quote address has no contract bytecode.');
  const [quoteDecimals, quoteSymbol, blockNumber] = await Promise.all([
    publicClient.readContract({ address: quote, abi: erc20Abi, functionName: 'decimals' }),
    publicClient.readContract({ address: quote, abi: erc20Abi, functionName: 'symbol' }),
    publicClient.getBlockNumber(),
  ]);
  if (quoteDecimals !== 6 || quoteSymbol !== 'USDG') throw new Error(`Expected 6-decimal USDG, received ${quoteSymbol} with ${quoteDecimals} decimals.`);
  console.log(JSON.stringify({ chainId: chain.id, blockNumber: blockNumber.toString(), stocks: stockMetadata, quote, quoteSymbol, quoteDecimals }, null, 2));
  if (process.env.DEPLOYER_PRIVATE_KEY) {
    const { address } = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY);
    const [eth, stockBalances, quoteBalance] = await Promise.all([publicClient.getBalance({ address }), Promise.all(stockMetadata.map(stock => publicClient.readContract({ address: stock.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] }))), publicClient.readContract({ address: quote, abi: erc20Abi, functionName: 'balanceOf', args: [address] })]);
    console.log(JSON.stringify({ deployer: address, testETH: formatEther(eth), stocks: Object.fromEntries(stockMetadata.map((stock, index) => [stock.symbol, formatUnits(stockBalances[index], stock.decimals)])), quote: formatUnits(quoteBalance, quoteDecimals) }, null, 2));
  }
  console.log('Read-only check; no transfers, faucet requests or deployments performed. Token provenance must also be compared with the faucet transfer before a public demo.');
} catch (error) { reportError(error); }
