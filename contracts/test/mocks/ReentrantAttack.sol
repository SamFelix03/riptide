// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { TokenMock } from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { RiptideRebalanceRouter } from "../../src/core/RiptideRebalanceRouter.sol";
import { RiptideErrors } from "../../src/types/RiptideErrors.sol";

interface IReentrantCallee {
    function onTokenMove() external;
}

contract HookQuoteToken is TokenMock {
    address public hookTarget;

    constructor() TokenMock("HookQuote", "HQT") {}

    function setHook(address target) external {
        hookTarget = target;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(to, amount);
        _invokeHook();
        return ok;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        bool ok = super.transferFrom(from, to, amount);
        _invokeHook();
        from;
        to;
        amount;
        return ok;
    }

    function _invokeHook() internal {
        if (hookTarget != address(0)) {
            IReentrantCallee(hookTarget).onTokenMove();
        }
    }
}

contract ReentrantResolver is IReentrantCallee {
    RiptideRebalanceRouter public router;
    ISwapVM.Order public order;
    bytes public takerData;
    bool public entered;

    function configure(RiptideRebalanceRouter router_, ISwapVM.Order memory order_, bytes memory takerData_) external {
        router = router_;
        order = order_;
        takerData = takerData_;
    }

    function onTokenMove() external override {
        if (entered) return;
        entered = true;
        router.swap(order, order.maker, address(0), 1, takerData);
    }
}
