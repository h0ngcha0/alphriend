import { getSigners, testAddress } from '@alephium/web3-test'
import { deployToDevnet } from '@alephium/cli'
import { BuyShares, FriendTech, FriendTechInstance, SubjectShares } from '../../artifacts/ts'
import { web3, Project, ONE_ALPH, subContractId, addressFromContractId, encodeAddress, binToHex, SignerProvider, ExecuteScriptResult } from '@alephium/web3'

describe('Friend tech', () => {
  const group = 0
  let friendTech: FriendTechInstance | undefined = undefined

  beforeAll(async () => {
    web3.setCurrentNodeProvider('http://127.0.0.1:22973', undefined, fetch)
    await Project.build()

    const deployments = await deployToDevnet()
    const deployed = deployments.getDeployedContractResult(0, 'FriendTech')
    if (deployed === undefined) {
      fail(`The contract is not deployed on group ${group}`)
    }

    friendTech = FriendTech.at(deployed.contractInstance.address)
  })

  it('Friend tech should work', async () => {
    const group = 0
    const [signer1, signer2, signer3] = await getSigners(3, ONE_ALPH * 1000n, group)
    if (friendTech === undefined) {
      fail(`Friend tech contract is not deployed on group ${group}`)
    }
    const fixture = new TestFixture(friendTech)
    await fixture.verifyFriendTechState({ expectedTotalProtocolFee: 0n, expectedBalance: ONE_ALPH })

    const price = getPrice(0n, 1n)
    await fixture.buyShares({
      buyer: signer1,
      subject: signer1.address,
      amount: 1n,
      expectedPrice: price
    })

    // Buy 2nd share
    const price2 = getPrice(1n, 1n)
    await fixture.buyShares({
      buyer: signer2,
      subject: signer1.address,
      amount: 1n,
      expectedPrice: price2
    })

    // Buy 3rd ~ 5th share
    const price3 = getPrice(2n, 3n)
    await fixture.buyShares({
      buyer: signer2,
      subject: signer1.address,
      amount: 3n,
      expectedPrice: price3,
    })
  }, 20000)

  function getPrice(supply: bigint, amount: bigint): bigint {
    const sum1: bigint = supply == 0n ? 0n : (supply - 1n) * (supply) * (2n * (supply - 1n) + 1n) / 6n;
    const sum2: bigint = supply == 0n && amount == 1n ? 0n : (supply - 1n + amount) * (supply + amount) * (2n * (supply - 1n + amount) + 1n) / 6n;
    const summation = sum2 - sum1
    return summation * ONE_ALPH / 16000n;
  }

  function getSellPrice(supply: bigint, amount: bigint): bigint {
    return getPrice(supply - amount, amount)
  }

  function getSellPriceAfterFee(supply: bigint, amount: bigint): bigint {
    const price = getSellPrice(supply, amount)
    const protocolFee = price * 500n / 10000n
    const subjectFee = price * 500n / 10000n
    return price - protocolFee - subjectFee
  }
})

class TestFixture {
  friendTech: FriendTechInstance
  group = 0
  totalProtocolFee: bigint
  friendTechTotalBalance: bigint
  subjectSharesTotalBalance: bigint
  supply: bigint

  constructor(friendTech: FriendTechInstance) {
    this.friendTech = friendTech
    this.totalProtocolFee = 0n
    this.friendTechTotalBalance = ONE_ALPH
    this.subjectSharesTotalBalance = ONE_ALPH
    this.supply = 0n
  }

  public async buyShares(
    input: {
      buyer: SignerProvider,
      subject: string,
      amount: bigint,
      expectedPrice: bigint
    }): Promise<ExecuteScriptResult> {
    const expectedProtocolFee = this.getProtocolFee(input.expectedPrice)
    const expectedSubjectFee = this.getSubjectFee(input.expectedPrice)
    const totalPayment = input.expectedPrice + expectedProtocolFee + expectedSubjectFee + ONE_ALPH
    console.log("total payment", totalPayment)
    const result = await BuyShares.execute(input.buyer, {
      initialFields: {
        subject: input.subject,
        amount: input.amount,
        totalPayment,
        friendTech: this.friendTech.contractId!
      },
      attoAlphAmount: totalPayment
    })

    this.totalProtocolFee = this.totalProtocolFee + expectedProtocolFee
    this.friendTechTotalBalance = this.friendTechTotalBalance + expectedProtocolFee + input.expectedPrice
    this.subjectSharesTotalBalance = this.subjectSharesTotalBalance + expectedSubjectFee
    this.supply = this.supply + input.amount

    await this.verifyFriendTechState({ expectedTotalProtocolFee: this.totalProtocolFee, expectedBalance: this.friendTechTotalBalance })
    await this.verifySubjectSharesState({ subject: input.subject, expectedSupply: this.supply, expectedBalance: this.subjectSharesTotalBalance })

    return result
  }

  async verifyFriendTechState(input: { expectedBalance: bigint, expectedTotalProtocolFee: bigint }) {
    const states = await this.friendTech.fetchState()

    expect(states.fields.owner).toEqual(testAddress)
    expect(states.fields.protocolFeePercent).toEqual(500n)
    expect(states.fields.subjectFeePercent).toEqual(500n)

    expect(states.fields.totalProtocolFee).toEqual(input.expectedTotalProtocolFee)
    const balance = await web3.getCurrentNodeProvider().addresses.getAddressesAddressBalance(this.friendTech.address)
    expect(BigInt(balance.balance)).toEqual(input.expectedBalance)
  }

  async verifySubjectSharesState(input: { subject: string, expectedSupply: bigint, expectedBalance: bigint }) {
    const subjectSharesContractAddress = addressFromContractId(
      subContractId(this.friendTech.contractId!, binToHex(encodeAddress(input.subject)), this.group)
    )
    const signer1SharesContract = SubjectShares.at(subjectSharesContractAddress)
    const signer1SharesContractState = await signer1SharesContract.fetchState()
    expect(signer1SharesContractState.fields.subject).toEqual(input.subject)
    expect(signer1SharesContractState.fields.supply).toEqual(input.expectedSupply)

    const balance = await web3.getCurrentNodeProvider().addresses.getAddressesAddressBalance(subjectSharesContractAddress)
    expect(BigInt(balance.balance)).toEqual(input.expectedBalance)
  }

  getProtocolFee(price: bigint): bigint {
    return price * 500n / 10000n
  }

  getSubjectFee(price: bigint): bigint {
    return price * 500n / 10000n
  }
}