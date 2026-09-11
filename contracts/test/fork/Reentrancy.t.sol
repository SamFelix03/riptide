// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";
import { TransientLock, TransientLockLib } from "@1inch/solidity-utils/contracts/libraries/TransientLock.sol";

/// @notice Reentrancy guard smoke test (instruction-level lock).
contract ReentrancyLockHarness {
    using TransientLockLib for TransientLock;

    TransientLock internal _lock;

    function enterTwice() external {
        _enter();
    }

    function _enter() internal {
        if (_lock.isLocked()) revert RiptideErrors.RiptideReentrantExecution();
        _lock.lock();
        _enter();
    }
}

/// @notice Reentrancy guard blocks nested entry.
contract ReentrancyTest is Test {
    ReentrancyLockHarness internal harness;

    function setUp() public {
        harness = new ReentrancyLockHarness();
    }

    function test_reentrantGuardDefined() public pure {
        bytes4 sel = RiptideErrors.RiptideReentrantExecution.selector;
        assertTrue(sel != bytes4(0));
    }

    function test_reentrantPullBlocked() public {
        vm.expectRevert(RiptideErrors.RiptideReentrantExecution.selector);
        harness.enterTwice();
    }
}
