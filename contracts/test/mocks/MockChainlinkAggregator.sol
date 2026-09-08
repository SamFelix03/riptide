// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { IPriceOracle } from "@1inch/swap-vm/instructions/interfaces/IPriceOracle.sol";

/// @notice Configurable Chainlink-style aggregator for freshness tests.
contract MockChainlinkAggregator is IPriceOracle {
    uint8 public immutable override decimals = 8;
    int256 public answer = 100_00000000;
    uint256 public updatedAt;

    function setRound(int256 answer_, uint256 updatedAt_) external {
        answer = answer_;
        updatedAt = updatedAt_;
    }

    function description() external pure returns (string memory) {
        return "MOCK";
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80)
        external
        view
        returns (uint80 roundId, int256, uint256, uint256, uint80)
    {
        return (1, answer, 0, updatedAt, 1);
    }

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256, uint256, uint256, uint80)
    {
        return (1, answer, 0, updatedAt, 1);
    }
}
