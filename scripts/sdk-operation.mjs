import { erc20Abi } from 'viem';
import { simulatePrepared } from '@stock-options-lab/sdk';
import { mined } from './config.mjs';
export async function executeOperation(actor, operation) {
  const { publicClient, walletClient, account } = actor;
  if (account.address.toLowerCase() !== operation.account.toLowerCase() || await publicClient.getChainId() !== operation.chainId) throw new Error('SDK operation account or network mismatch.');
  if (operation.approval) {
    const { token, spender, amount } = operation.approval;
    const { request } = await publicClient.simulateContract({ address: token.address, abi: erc20Abi, functionName: 'approve', args: [spender, amount], account });
    await mined(publicClient, await walletClient.writeContract(request));
  }
  await simulatePrepared(publicClient, operation);
  return mined(publicClient, await walletClient.sendTransaction({ ...operation.request, account }));
}
export const marketFromManifest = record => ({ id: record.marketId ?? 'primary', chainId: record.chainId, factory: record.factory, deploymentBlock: BigInt(record.deploymentBlock), version: 1, underlying: record.underlying, quote: record.quote, sandbox: record.underlying.isMock });
