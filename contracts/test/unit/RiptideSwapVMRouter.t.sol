// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { RiptideConstants } from "../../src/core/RiptideConstants.sol";
import { RiptideStrategyCodec } from "../../src/core/RiptideStrategyCodec.sol";
import { RiptideSwapVMRouter } from "../../src/core/RiptideSwapVMRouter.sol";
import { RiptideTypes } from "../../src/types/RiptideTypes.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { MakerTraits, MakerTraitsLib } from "@1inch/swap-vm/libs/MakerTraits.sol";

contract RiptideSwapVMRouterTest is Test {
    function test_opcodeConstantsFrozen() public pure {
        assertEq(RiptideConstants.OP_DEADLINE, 13);
        assertEq(RiptideConstants.OP_XYCSWAP, 17);
        assertEq(RiptideConstants.RIPTIDE_REBALANCE_OPCODE, 34);
    }

    function test_buildSwapOrderProgramLayout() public {
        RiptideSwapVMRouter router = new RiptideSwapVMRouter(address(1), address(2), address(this), "t", "1", address(3), address(4));
        RiptideTypes.Strategy memory s = RiptideTypes.Strategy({
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

        ISwapVM.Order memory order = router.buildSwapOrder(address(this), s, uint40(block.timestamp + 100));
        uint256 off = RiptideStrategyCodec.PAYLOAD_LENGTH;
        assertEq(uint8(order.data[off]), RiptideConstants.OP_DEADLINE);
        bytes memory program = this._programSlice(order.data, order.traits);
        assertEq(uint8(program[0]), RiptideConstants.OP_DEADLINE);
        assertGt(program.length, 1);
    }

    function _programSlice(bytes calldata data, MakerTraits traits) external pure returns (bytes memory) {
        return bytes(MakerTraitsLib.program(traits, data));
    }
}
