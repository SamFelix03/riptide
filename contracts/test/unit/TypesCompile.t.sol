// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { IRiptideEvents } from "../../src/interfaces/IRiptideEvents.sol";

contract TypesCompileHarness is IRiptideEvents {
    function emitAll() external {
        emit StrategyRuntimeInitialized(bytes32(0), bytes32(0), address(0), bytes32(0), 0, 0, 0);
        emit SwapFilled(
            bytes32(0), bytes32(0), address(0), bytes32(0), address(0), address(0), 0, 0, 0, 0, 0, 0, 0
        );
        emit RebalanceSettled(
            bytes32(0), address(0), address(0), bytes32(0), address(0), address(0), 0, 0, 0, 0, 0, 0, 0
        );
        emit FeeControllerUpdated(bytes32(0), 0, 0, 0);
        emit RouteExecuted(
            bytes32(0),
            bytes32(0),
            address(0),
            address(0),
            RiptideTypes.QuoteKind.ExactInput,
            address(0),
            address(0),
            0,
            0,
            0,
            0
        );
    }
}

contract TypesCompileTest is Test {
    TypesCompileHarness internal harness;

    function setUp() public {
        harness = new TypesCompileHarness();
    }

    function test_structInstantiation() public pure {
        RiptideTypes.FeePolicy memory fee;
        RiptideTypes.AuctionPolicy memory auction;
        RiptideTypes.OracleConfig memory oracle;
        RiptideTypes.Strategy memory strategy;
        RiptideTypes.ControllerState memory state;
        RiptideTypes.RebalanceResult memory result;

        fee.feeMin = 1;
        auction.beta = 1;
        oracle.feed = address(1);
        strategy.maker = address(2);
        state.feeReported = 3;
        result.surplusWad = 4;

        assertTrue(fee.feeMin == 1);
        assertTrue(auction.beta == 1);
        assertTrue(oracle.feed == address(1));
        assertTrue(strategy.maker == address(2));
        assertTrue(state.feeReported == 3);
        assertTrue(result.surplusWad == 4);
    }

    function test_quoteKindValues() public pure {
        assertTrue(uint8(RiptideTypes.QuoteKind.ExactInput) == 0);
        assertTrue(uint8(RiptideTypes.QuoteKind.ExactOutput) == 1);
    }

    function test_errorsAreRevertable() public {
        vm.expectRevert(RiptideErrors.RiptideZeroAddress.selector);
        this.revertZeroAddress();

        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideIdenticalTokens.selector, address(1)));
        this.revertIdenticalTokens(address(1));

        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideNoSurplus.selector, int256(-1)));
        this.revertNoSurplus(-1);

        vm.expectRevert(RiptideErrors.RiptideMathDivisionByZero.selector);
        this.revertDivisionByZero();

        vm.expectRevert(abi.encodeWithSelector(RiptideErrors.RiptideSlippageExceeded.selector, uint256(1), uint256(2)));
        this.revertSlippage(1, 2);
    }

    function revertZeroAddress() external pure {
        revert RiptideErrors.RiptideZeroAddress();
    }

    function revertIdenticalTokens(address token) external pure {
        revert RiptideErrors.RiptideIdenticalTokens(token);
    }

    function revertNoSurplus(int256 surplus) external pure {
        revert RiptideErrors.RiptideNoSurplus(surplus);
    }

    function revertDivisionByZero() external pure {
        revert RiptideErrors.RiptideMathDivisionByZero();
    }

    function revertSlippage(uint256 actual, uint256 limit) external pure {
        revert RiptideErrors.RiptideSlippageExceeded(actual, limit);
    }

    function test_eventsEmit() public {
        harness.emitAll();
    }
}
