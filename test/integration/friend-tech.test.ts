import { web3, Project, ONE_ALPH } from '@alephium/web3'
import { getSigners, testAddress, testNodeWallet } from '@alephium/web3-test'
import { deployToDevnet } from '@alephium/cli'
import { FriendTech } from '../../artifacts/ts'

describe('Friend tech', () => {
  beforeAll(async () => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)
    await Project.build()
  })

  it('Friend tech should work', async () => {
    const group = 0
    const signer = await testNodeWallet()
    const deployments = await deployToDevnet()

    const [signer1, signer2, signer3] = await getSigners(3, ONE_ALPH * 1000n, group)
    const deployed = deployments.getDeployedContractResult(0, 'FriendTech')
    if (deployed === undefined) {
      fail(`The contract is not deployed on group ${group}`)
    }

    console.log("friend tech address", deployed.contractInstance.address)

    const friendTech = FriendTech.at(deployed.contractInstance.address)
    const states = await friendTech.fetchState()
    console.log("friend tech states: ", states)

    expect(states.fields.owner).toEqual(testAddress)
    expect(states.fields.protocolFeeDestination).toEqual(testAddress)
    expect(states.fields.protocolFeePercent).toEqual(500n)
    expect(states.fields.subjectFeePercent).toEqual(500n)
  }, 20000)
})
