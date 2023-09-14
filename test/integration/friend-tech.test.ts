import { getSigners, testAddress } from '@alephium/web3-test'
import { deployToDevnet } from '@alephium/cli'
import { BuyShares, FriendTech, FriendTechInstance, SubjectShares } from '../../artifacts/ts'
import { web3, Project, ONE_ALPH, subContractId, addressFromContractId, encodeAddress, binToHex, SignerProvider, ExecuteScriptResult } from '@alephium/web3'
import { totalmem } from 'os'

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
    await verifyFriendTechState({ expectedTotalProtocolFee: 0n, expectedBalance: ONE_ALPH })

    let price = getPrice(0n, 1n)
    let protocolFee = getProtocolFee(price)
    let subjectFee = getSubjectFee(price)
    let totalPrice = price + protocolFee + subjectFee
    let totalProtocolFee = protocolFee
    let friendTechTotalBalance = ONE_ALPH
    let subjectSharesTotalBalance = ONE_ALPH

    // First share needs to be bought by the subject him or her self
    await expect(buyShares({ buyer: signer2, subject: signer1.address, amount: 1n, totalPayment: ONE_ALPH + totalPrice })).rejects.toThrow(Error)

    // Buy 1st share
    await buyShares({ buyer: signer1, subject: signer1.address, amount: 1n, totalPayment: ONE_ALPH })
    await verifyFriendTechState({ expectedTotalProtocolFee: totalProtocolFee, expectedBalance: friendTechTotalBalance })
    await verifySubjectSharesState({ subject: signer1.address, expectedSupply: 1n, expectedBalance: subjectSharesTotalBalance })

    // Buy 2nd share
    price = getPrice(1n, 1n)
    protocolFee = getProtocolFee(price)
    subjectFee = getSubjectFee(price)
    totalPrice = price + protocolFee + subjectFee
    totalProtocolFee = totalProtocolFee + protocolFee
    friendTechTotalBalance = friendTechTotalBalance + protocolFee + price
    subjectSharesTotalBalance = subjectSharesTotalBalance + subjectFee

    console.log("protocolFee", protocolFee)
    await buyShares({ buyer: signer2, subject: signer1.address, amount: 1n, totalPayment: ONE_ALPH + totalPrice })
    await verifyFriendTechState({ expectedTotalProtocolFee: totalProtocolFee, expectedBalance: friendTechTotalBalance })
    await verifySubjectSharesState({ subject: signer1.address, expectedSupply: 2n, expectedBalance: subjectSharesTotalBalance })

    // Buy 3rd ~ 5th share
    price = getPrice(2n, 3n)
    protocolFee = getProtocolFee(price)
    subjectFee = getSubjectFee(price)
    totalPrice = price + protocolFee + subjectFee
    totalProtocolFee = totalProtocolFee + protocolFee
    friendTechTotalBalance = friendTechTotalBalance + protocolFee + price
    subjectSharesTotalBalance = subjectSharesTotalBalance + subjectFee

    await buyShares({ buyer: signer2, subject: signer1.address, amount: 1n, totalPayment: ONE_ALPH + totalPrice })
    await verifyFriendTechState({ expectedTotalProtocolFee: totalProtocolFee, expectedBalance: friendTechTotalBalance })
    await verifyFriendTechState({ expectedTotalProtocolFee: 0n, expectedBalance: ONE_ALPH })
    await verifySubjectSharesState({ subject: signer1.address, expectedSupply: 5n, expectedBalance: subjectSharesTotalBalance })
  }, 20000)

  async function buyShares(
    input: {
      buyer: SignerProvider,
      subject: string,
      amount: bigint,
      totalPayment: bigint
    }): Promise<ExecuteScriptResult> {
    return BuyShares.execute(input.buyer, {
      initialFields: {
        subject: input.subject,
        amount: input.amount,
        totalPayment: input.totalPayment,
        friendTech: friendTech?.contractId!
      },
      attoAlphAmount: input.totalPayment
    })
  }


  async function verifyFriendTechState(input: { expectedBalance: bigint, expectedTotalProtocolFee: bigint }) {
    const states = await friendTech!.fetchState()

    expect(states.fields.owner).toEqual(testAddress)
    expect(states.fields.protocolFeePercent).toEqual(500n)
    expect(states.fields.subjectFeePercent).toEqual(500n)

    expect(states.fields.totalProtocolFee).toEqual(input.expectedTotalProtocolFee)
    const balance = await web3.getCurrentNodeProvider().addresses.getAddressesAddressBalance(friendTech!.address)
    expect(BigInt(balance.balance)).toEqual(input.expectedBalance)
  }

  async function verifySubjectSharesState(input: { subject: string, expectedSupply: bigint, expectedBalance: bigint }) {
    // TODO: verify balance
    const subjectSharesContractAddress = addressFromContractId(
      subContractId(friendTech?.contractId!, binToHex(encodeAddress(input.subject)), group)
    )
    const signer1SharesContract = SubjectShares.at(subjectSharesContractAddress)
    const signer1SharesContractState = await signer1SharesContract.fetchState()
    expect(signer1SharesContractState.fields.subject).toEqual(input.subject)
    expect(signer1SharesContractState.fields.supply).toEqual(input.expectedSupply)

    const balance = await web3.getCurrentNodeProvider().addresses.getAddressesAddressBalance(subjectSharesContractAddress)
    expect(BigInt(balance.balance)).toEqual(input.expectedBalance)
  }

  function getPrice(supply: bigint, amount: bigint): bigint {
    const sum1: bigint = supply == 0n ? 0n : (supply - 1n) * (supply) * (2n * (supply - 1n) + 1n) / 6n;
    const sum2: bigint = supply == 0n && amount == 1n ? 0n : (supply - 1n + amount) * (supply + amount) * (2n * (supply - 1n + amount) + 1n) / 6n;
    const summation = sum2 - sum1
    return summation * ONE_ALPH / 16000n;
  }

  function getBuyPriceAfterFee(supply: bigint, amount: bigint): bigint {
    const price = getPrice(supply, amount)
    const protocolFee = getProtocolFee(price)
    const subjectFee = getSubjectFee(price)
    return price + protocolFee + subjectFee
  }

  function getProtocolFee(price: bigint): bigint {
    return price * 500n / 10000n
  }

  function getSubjectFee(price: bigint): bigint {
    return price * 500n / 10000n
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
