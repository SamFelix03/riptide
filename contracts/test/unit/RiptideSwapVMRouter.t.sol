// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { MakerTraits, MakerTraitsLib } from "@1inch/swap-vm/libs/MakerTraits.sol";

import { RiptideConstants } from "../../src/core/RiptideConstants.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideSwapVMRouter } from "../../src/core/RiptideSwapVMRouter.sol";
import { RiptideRebalanceKernel } from "../../src/core/RiptideRebalanceKernel.sol";
import { RiptideRebalanceRouter } from "../../src/core/RiptideRebalanceRouter.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";

contract RiptideSwapVMRouterTest is Test {
    function test_opcodeConstantsFrozen() public pure {
        assertEq(RiptideConstants.OP_DEADLINE, 13);
        assertEq(RiptideConstants.OP_XYCSWAP, 17);
        assertEq(RiptideConstants.OP_AQUA_DYNAMIC_PROTOCOL_FEE, 30);
        assertEq(RiptideConstants.RIPTIDE_REBALANCE_OPCODE, 34);
        assertEq(RiptideConstants.OP_DUTCH_AUCTION_BALANCE_IN, 35);
        assertEq(RiptideConstants.OP_DUTCH_AUCTION_BALANCE_OUT, 36);
    }

    function _strategy() internal view returns (RiptideTypes.Strategy memory s) {
        s = RiptideTypes.Strategy({
            maker: address(this),
            baseToken: address(0xA),
            quoteToken: address(0xB),
            reserveBaseWad: 1e18,
            reserveQuoteWad: 2e18,
            fee: RiptideTypes.FeePolicy({
                feeMin: 1,
                feeMax: 2,
                lambda: 1e17,
                kp: 1e17,
                ki: 1e17,
                iMax: 1e18,
                sigmaMin: 1e16,
                sigmaMax: 1e18
            }),
            auction: RiptideTypes.AuctionPolicy({ beta: 95e16, duration: 100, decay: 99e16, antiSandwichPeriod: 10 }),
            oracle: RiptideTypes.OracleConfig({ feed: address(0xF), decimals: 8, maxStaleness: 100 }),
            feeProvider: address(0xC),
            salt: bytes32(uint256(7))
        });
    }

    function test_buildSwapOrderProgramLayout() public {
        RiptideSwapVMRouter router =
            new RiptideSwapVMRouter(address(1), address(2), address(this), "t", "1", address(3), address(4));
        ISwapVM.Order memory order = router.buildSwapOrder(address(this), _strategy(), uint40(block.timestamp + 100));
        bytes memory program = this._programSlice(order.data, order.traits);
        assertEq(uint8(program[0]), RiptideConstants.OP_DEADLINE);
        assertGt(program.length, 1);
    }

    function test_buildRebalanceOrderProgramLayout() public {
        RiptideRebalanceKernel kernel = new RiptideRebalanceKernel();
        RiptideRebalanceRouter router = new RiptideRebalanceRouter(
            address(1), address(2), address(this), "t", "1", address(kernel), address(3), address(4)
        );
        ISwapVM.Order memory order =
            router.buildRebalanceOrder(address(this), _strategy(), uint40(block.timestamp + 100), 1e17, address(0x5), true);
        bytes memory program = this._programSlice(order.data, order.traits);
        assertEq(uint8(program[0]), RiptideConstants.OP_DEADLINE);
    }

    function _programSlice(bytes calldata data, MakerTraits traits) external pure returns (bytes memory) {
        return bytes(MakerTraitsLib.program(traits, data));
    }
}
