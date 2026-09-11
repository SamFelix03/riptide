// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Context } from "@1inch/swap-vm/libs/VM.sol";
import { Controls } from "@1inch/swap-vm/instructions/Controls.sol";
import { XYCSwap } from "@1inch/swap-vm/instructions/XYCSwap.sol";
import { Decay } from "@1inch/swap-vm/instructions/Decay.sol";

import { RiptideConstants } from "./RiptideConstants.sol";
import { RiptideAuctionSchedule } from "./RiptideAuctionSchedule.sol";

/// @title RiptideOpcodes
/// @notice Rebalance opcode table with the same runtime indices as AquaOpcodes + RIPTIDE slots.
/// @dev Unused stock handlers are omitted so the rebalance router fits EIP-170.
abstract contract RiptideOpcodes is Controls, XYCSwap, Decay, RiptideAuctionSchedule {
    function _extendOpcodes(function(Context memory, bytes calldata) internal handlerRebalance)
        internal
        pure
        returns (function(Context memory, bytes calldata) internal[] memory result)
    {
        result = new function(Context memory, bytes calldata) internal[](RiptideConstants.RIPTIDE_OPCODE_COUNT);
        result[RiptideConstants.OP_DEADLINE] = Controls._deadline;
        result[RiptideConstants.OP_XYCSWAP] = XYCSwap._xycSwapXD;
        result[RiptideConstants.OP_DECAY] = Decay._decayXD;
        result[RiptideConstants.OP_SALT] = Controls._salt;
        result[RiptideConstants.RIPTIDE_REBALANCE_OPCODE] = handlerRebalance;
        result[RiptideConstants.OP_AUCTION_BALANCE_IN] = RiptideAuctionSchedule._riptideAuctionBalanceIn;
        result[RiptideConstants.OP_AUCTION_BALANCE_OUT] = RiptideAuctionSchedule._riptideAuctionBalanceOut;
    }
}
