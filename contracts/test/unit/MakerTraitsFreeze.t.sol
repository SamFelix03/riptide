// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";

import { MakerTraits, MakerTraitsLib } from "@1inch/swap-vm/libs/MakerTraits.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

/// @notice Freeze MakerTraits constants against pinned swap-vm v1.0.2.
contract MakerTraitsFreezeTest is Test {
    uint256 internal constant USE_AQUA_TRAIT = 1 << 254;
    uint256 internal constant ORDER_DATA_SLICES_INDEXES_BIT_OFFSET = 160;

    function test_constantsMatchSwapVM() public {
        ISwapVM.Order memory order = MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: address(0x1111),
                receiver: address(0),
                shouldUnwrapWeth: false,
                useAquaInsteadOfSignature: true,
                allowZeroAmountIn: false,
                hasPreTransferInHook: false,
                hasPostTransferInHook: false,
                hasPreTransferOutHook: false,
                hasPostTransferOutHook: false,
                preTransferInTarget: address(0),
                preTransferInData: "",
                postTransferInTarget: address(0),
                postTransferInData: "",
                preTransferOutTarget: address(0),
                preTransferOutData: "",
                postTransferOutTarget: address(0),
                postTransferOutData: "",
                program: hex"01"
            })
        );
        assertTrue(MakerTraitsLib.useAquaInsteadOfSignature(order.traits));
        assertTrue((uint256(MakerTraits.unwrap(order.traits)) & USE_AQUA_TRAIT) != 0);
    }

    function test_programSliceCoversPayloadPlusProgram() public {
        bytes memory payload = hex"52505431";
        bytes memory program = hex"01020304";
        bytes memory combined = bytes.concat(payload, program);

        ISwapVM.Order memory order = MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: address(0x1111),
                receiver: address(0),
                shouldUnwrapWeth: false,
                useAquaInsteadOfSignature: true,
                allowZeroAmountIn: false,
                hasPreTransferInHook: false,
                hasPostTransferInHook: false,
                hasPreTransferOutHook: false,
                hasPostTransferOutHook: false,
                preTransferInTarget: address(0),
                preTransferInData: "",
                postTransferInTarget: address(0),
                postTransferInData: "",
                preTransferOutTarget: address(0),
                preTransferOutData: "",
                postTransferOutTarget: address(0),
                postTransferOutData: "",
                program: combined
            })
        );

        assertTrue(MakerTraitsLib.useAquaInsteadOfSignature(order.traits));
        bytes memory programSlice = this._programSlice(order.data, order.traits);
        assertEq(programSlice.length, combined.length);
        assertEq(keccak256(programSlice), keccak256(combined));
        assertEq(programSlice.length, payload.length + program.length);
    }

    function _programSlice(bytes calldata data, MakerTraits traits) external pure returns (bytes memory) {
        bytes calldata slice = MakerTraitsLib.program(traits, data);
        return bytes(slice);
    }
}
