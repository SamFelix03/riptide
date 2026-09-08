// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { MakerTraits } from "@1inch/swap-vm/libs/MakerTraits.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";

import { RiptideStrategyCodec } from "./RiptideStrategyCodec.sol";

/// @notice Builds SwapVM orders with RIPTIDE payload prefix + program bytecode.
library RiptideMakerTraits {
    uint256 internal constant USE_AQUA_TRAIT = 1 << 254;
    uint256 internal constant PROGRAM_OFFSET_SHIFT = 208;

    function buildOrder(address maker, bytes memory payloadAndProgram) internal pure returns (ISwapVM.Order memory order) {
        order = ISwapVM.Order({
            maker: maker,
            traits: MakerTraits.wrap(USE_AQUA_TRAIT | (RiptideStrategyCodec.PAYLOAD_LENGTH << PROGRAM_OFFSET_SHIFT)),
            data: payloadAndProgram
        });
    }

    function payload(bytes calldata data) internal pure returns (bytes calldata) {
        return data[:RiptideStrategyCodec.PAYLOAD_LENGTH];
    }
}
