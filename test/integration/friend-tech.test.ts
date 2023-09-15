import { getSigners, testAddress } from '@alephium/web3-test'
import { deployToDevnet } from '@alephium/cli'
import { BuyShares, FriendTech, FriendTechInstance, SellShares, SubjectShares } from '../../artifacts/ts'
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
    // Only signer1 can buy 1st signer1's share, otherwise throw exception
    await expect(fixture.buyShares({
      buyer: signer2,
      subject: signer1.address,
      amount: 1n,
      expectedPrice: price
    })).rejects.toThrow(Error)

    // Signer1 buys 1st signer1's share
    await fixture.buyShares({
      buyer: signer1,
      subject: signer1.address,
      amount: 1n,
      expectedPrice: price
    })

    // Signer2 buys 2nd signer1's share
    const price2 = getPrice(1n, 1n)
    await fixture.buyShares({
      buyer: signer2,
      subject: signer1.address,
      amount: 1n,
      expectedPrice: price2
    })

    // Signer2 buys 3rd ~ 5th signer1's shares
    const price3 = getPrice(2n, 3n)
    await fixture.buyShares({
      buyer: signer2,
      subject: signer1.address,
      amount: 3n,
      expectedPrice: price3,
    })

    // Signer3 buys 6rd ~ 10th signher1's shares
    const price4 = getPrice(5n, 5n)
    await fixture.buyShares({
      buyer: signer3,
      subject: signer1.address,
      amount: 5n,
      expectedPrice: price4,
    })

    // Signer1 buys 11th and 12th signer1's own share
    const price5 = getPrice(10n, 2n)
    await fixture.buyShares({
      buyer: signer1,
      subject: signer1.address,
      amount: 2n,
      expectedPrice: price5,
    })

    // Signer2 sells one signer's share
    const price6 = getSellPrice(12n, 1n)
    await fixture.sellShares({
      seller: signer2,
      subject: signer1.address,
      amount: 1n,
      expectedPrice: price6,
    })

    // Signer2 is not allowed to sell more than what it owns
    const signer2Balance = fixture.getBalanceForHolder(signer2.address, signer1.address)
    const price7 = getSellPrice(11n, signer2Balance + 1n)
    await expect(fixture.sellShares({
      seller: signer2,
      subject: signer1.address,
      amount: signer2Balance + 1n,
      expectedPrice: price7,
    })).rejects.toThrow(Error)

    // Signer2 sells all the shares for signer1
    const price8 = getSellPrice(11n, signer2Balance)
    await fixture.sellShares({
      seller: signer2,
      subject: signer1.address,
      amount: signer2Balance,
      expectedPrice: price8,
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
})

class TestFixture {
  friendTech: FriendTechInstance
  group = 0
  totalProtocolFee: bigint
  friendTechTotalBalance: bigint
  subjectSharesTotalBalance: Map<string, bigint>
  supply: bigint
  subjectSharesBalance: Map<string, Map<string, bigint>>

  constructor(friendTech: FriendTechInstance) {
    this.friendTech = friendTech
    this.totalProtocolFee = 0n
    this.friendTechTotalBalance = ONE_ALPH
    this.subjectSharesTotalBalance = new Map()
    this.supply = 0n
    this.subjectSharesBalance = new Map()
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
    let currentSubjectSharesTotalBalance = this.subjectSharesTotalBalance.get(input.subject)
    if (!currentSubjectSharesTotalBalance) {
      currentSubjectSharesTotalBalance = ONE_ALPH
    }
    const buyerAddress = (await input.buyer.getSelectedAccount()).address
    if (!this.subjectSharesBalance.get(input.subject)) {
      this.subjectSharesBalance.set(input.subject, new Map())
    }

    const currentSubjectSharesForBuyer = this.subjectSharesBalance.get(input.subject)!.get(buyerAddress) ?? 0n
    this.subjectSharesBalance.get(input.subject)!.set(buyerAddress, currentSubjectSharesForBuyer + input.amount)
    this.subjectSharesTotalBalance.set(input.subject, currentSubjectSharesTotalBalance + expectedSubjectFee)
    this.supply = this.supply + input.amount

    await this.verifyFriendTechState({ expectedTotalProtocolFee: this.totalProtocolFee, expectedBalance: this.friendTechTotalBalance })
    await this.verifySubjectSharesState({
      subject: input.subject,
      expectedSupply: this.supply,
      expectedBalance: this.subjectSharesTotalBalance.get(input.subject)!,
      holderBalance: {
        address: buyerAddress,
        amount: this.subjectSharesBalance.get(input.subject)?.get(buyerAddress)!
      }
    })

    return result
  }

  public async sellShares(
    input: {
      seller: SignerProvider,
      subject: string,
      amount: bigint,
      expectedPrice: bigint
    }): Promise<ExecuteScriptResult> {
    const expectedProtocolFee = this.getProtocolFee(input.expectedPrice)
    const expectedSubjectFee = this.getSubjectFee(input.expectedPrice)
    const result = await SellShares.execute(input.seller, {
      initialFields: {
        subject: input.subject,
        amount: input.amount,
        friendTech: this.friendTech.contractId!
      }
    })

    this.totalProtocolFee = this.totalProtocolFee + expectedProtocolFee
    const payoutToSeller = input.expectedPrice - expectedSubjectFee - expectedProtocolFee
    this.friendTechTotalBalance = this.friendTechTotalBalance - payoutToSeller - expectedSubjectFee

    const buyerAddress = (await input.seller.getSelectedAccount()).address

    const currentSubjectSharesForSeller = this.subjectSharesBalance.get(input.subject)?.get(buyerAddress) ?? 0n
    if (currentSubjectSharesForSeller - input.amount > 0) {
      this.subjectSharesBalance.get(input.subject)!.set(buyerAddress, currentSubjectSharesForSeller - input.amount)
    } else {
      this.subjectSharesBalance.get(input.subject)?.delete(buyerAddress)
    }

    let currentSubjectSharesTotalBalance = this.subjectSharesTotalBalance.get(input.subject)!
    this.subjectSharesTotalBalance.set(input.subject, currentSubjectSharesTotalBalance + expectedSubjectFee)
    this.supply = this.supply - input.amount

    await this.verifyFriendTechState({ expectedTotalProtocolFee: this.totalProtocolFee, expectedBalance: this.friendTechTotalBalance })

    await this.verifySubjectSharesState({
      subject: input.subject,
      expectedSupply: this.supply,
      expectedBalance: this.subjectSharesTotalBalance.get(input.subject)!,
      holderBalance: {
        address: buyerAddress,
        amount: this.subjectSharesBalance.get(input.subject)?.get(buyerAddress)!
      }
    })

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

  async verifySubjectSharesState(input: {
    subject: string,
    expectedSupply: bigint,
    expectedBalance: bigint,
    holderBalance: {
      address: string,
      amount: bigint
    }
  }) {
    const subjectSharesContractAddress = addressFromContractId(
      subContractId(this.friendTech.contractId!, binToHex(encodeAddress(input.subject)), this.group)
    )
    const signer1SharesContract = SubjectShares.at(subjectSharesContractAddress)
    const signer1SharesContractState = await signer1SharesContract.fetchState()
    expect(signer1SharesContractState.fields.subject).toEqual(input.subject)
    expect(signer1SharesContractState.fields.supply).toEqual(input.expectedSupply)

    const holderBalanceResult = (await signer1SharesContract.methods.getBalance({ args: { holder: input.holderBalance.address } })).returns
    expect(holderBalanceResult).toEqual(input.holderBalance.amount ?? 0n)

    const balance = await web3.getCurrentNodeProvider().addresses.getAddressesAddressBalance(subjectSharesContractAddress)
    expect(BigInt(balance.balance)).toEqual(input.expectedBalance)
  }

  getBalanceForHolder(holder: string, subject: string): bigint {
    return this.subjectSharesBalance.get(subject)?.get(holder) ?? 0n
  }

  getProtocolFee(price: bigint): bigint {
    return price * 500n / 10000n
  }

  getSubjectFee(price: bigint): bigint {
    return price * 500n / 10000n
  }
}