/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import { RunScriptResult, DeployContractExecutionResult } from "@alephium/cli";
import { NetworkId } from "@alephium/web3";
import {
  SubjectSharesBalance,
  SubjectSharesBalanceInstance,
  SubjectShares,
  SubjectSharesInstance,
  FriendTech,
  FriendTechInstance,
} from ".";
import { default as devnetDeployments } from "../.deployments.devnet.json";

export type Deployments = {
  deployerAddress: string;
  contracts: {
    SubjectSharesBalance: DeployContractExecutionResult<SubjectSharesBalanceInstance>;
    SubjectShares: DeployContractExecutionResult<SubjectSharesInstance>;
    FriendTech: DeployContractExecutionResult<FriendTechInstance>;
  };
};

function toDeployments(json: any): Deployments {
  const contracts = {
    SubjectSharesBalance: {
      ...json.contracts["SubjectSharesBalance"],
      contractInstance: SubjectSharesBalance.at(
        json.contracts["SubjectSharesBalance"].contractInstance.address
      ),
    },
    SubjectShares: {
      ...json.contracts["SubjectShares"],
      contractInstance: SubjectShares.at(
        json.contracts["SubjectShares"].contractInstance.address
      ),
    },
    FriendTech: {
      ...json.contracts["FriendTech"],
      contractInstance: FriendTech.at(
        json.contracts["FriendTech"].contractInstance.address
      ),
    },
  };
  return {
    ...json,
    contracts: contracts as Deployments["contracts"],
  };
}

export function loadDeployments(
  networkId: NetworkId,
  deployerAddress?: string
): Deployments {
  const deployments = networkId === "devnet" ? devnetDeployments : undefined;
  if (deployments === undefined) {
    throw Error("The contract has not been deployed to the " + networkId);
  }
  const allDeployments = Array.isArray(deployments)
    ? deployments
    : [deployments];
  if (deployerAddress === undefined) {
    if (allDeployments.length > 1) {
      throw Error(
        "The contract has been deployed multiple times on " +
          networkId +
          ", please specify the deployer address"
      );
    } else {
      return toDeployments(allDeployments[0]);
    }
  }
  const result = allDeployments.find(
    (d) => d.deployerAddress === deployerAddress
  );
  if (result === undefined) {
    throw Error("The contract deployment result does not exist");
  }
  return toDeployments(result);
}
