// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { SwapVM } from "@1inch/swap-vm/SwapVM.sol";
import { Context } from "@1inch/swap-vm/libs/VM.sol";
import { Controls } from "@1inch/swap-vm/instructions/Controls.sol";
import { XYCSwap } from "@1inch/swap-vm/instructions/XYCSwap.sol";
import { Fee } from "@1inch/swap-vm/instructions/Fee.sol";

import { RiptideConstants } from "./RiptideConstants.sol";

/// @title RiptideSwapOpcodes
/// @notice Swap-only instruction table with the same runtime indices as AquaOpcodes.
/// @dev Omits unused AquaOpcodes mixins so the swap router fits EIP-170 on public networks.
abstract contract RiptideSwapOpcodes is SwapVM, Controls, XYCSwap, Fee {
    constructor(address aqua, address weth, address owner, string memory name, string memory version)
        SwapVM(aqua, weth, owner, name, version)
        Fee(aqua)
    {}

    function _instructions()
        internal
        pure
        override
        returns (function(Context memory, bytes calldata) internal[] memory)
    {
        return _opcodes();
    }

    function _opcodes()
        internal
        pure
        virtual
        returns (function(Context memory, bytes calldata) internal[] memory result)
    {
        result = new function(Context memory, bytes calldata) internal[](RiptideConstants.STOCK_OPCODE_COUNT);
        result[RiptideConstants.OP_DEADLINE] = Controls._deadline;
        result[RiptideConstants.OP_XYCSWAP] = XYCSwap._xycSwapXD;
        result[RiptideConstants.OP_SALT] = Controls._salt;
        result[RiptideConstants.OP_AQUA_DYNAMIC_PROTOCOL_FEE] = Fee._aquaDynamicProtocolFeeAmountInXD;
    }
}
