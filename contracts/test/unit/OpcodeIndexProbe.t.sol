// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { Test } from "forge-std/Test.sol";
import { AquaOpcodesDebug } from "@1inch/swap-vm/opcodes/AquaOpcodesDebug.sol";
import { Controls } from "@1inch/swap-vm/instructions/Controls.sol";
import { XYCSwap } from "@1inch/swap-vm/instructions/XYCSwap.sol";
import { Decay } from "@1inch/swap-vm/instructions/Decay.sol";
import { Fee } from "@1inch/swap-vm/instructions/Fee.sol";
import { RiptideProgram, RiptideProgramBuilder } from "../helpers/RiptideProgramBuilder.sol";

contract OpcodeIndexProbe is AquaOpcodesDebug {
    using RiptideProgramBuilder for RiptideProgram;

    constructor() AquaOpcodesDebug(address(0)) {}

    function deadlineOpcode() external view returns (uint8) {
        return uint8(RiptideProgramBuilder.init(_opcodes()).build(Controls._deadline)[0]);
    }

    function xycOpcode() external view returns (uint8) {
        return uint8(RiptideProgramBuilder.init(_opcodes()).build(XYCSwap._xycSwapXD)[0]);
    }

    function decayOpcode() external view returns (uint8) {
        return uint8(RiptideProgramBuilder.init(_opcodes()).build(Decay._decayXD)[0]);
    }

    function saltOpcode() external view returns (uint8) {
        return uint8(RiptideProgramBuilder.init(_opcodes()).build(Controls._salt)[0]);
    }

    function dynamicFeeOpcode() external view returns (uint8) {
        return uint8(RiptideProgramBuilder.init(_opcodes()).build(Fee._dynamicProtocolFeeAmountInXD)[0]);
    }

    function aquaDynamicFeeOpcode() external view returns (uint8) {
        return uint8(RiptideProgramBuilder.init(_opcodes()).build(Fee._aquaDynamicProtocolFeeAmountInXD)[0]);
    }
}

contract OpcodeIndexProbeTest is Test {
    OpcodeIndexProbe internal probe;

    function setUp() public {
        probe = new OpcodeIndexProbe();
    }

    function test_runtimeOpcodeIndices() public view {
        assertEq(probe.deadlineOpcode(), 13);
        assertEq(probe.xycOpcode(), 17);
        assertEq(probe.decayOpcode(), 19);
        assertEq(probe.saltOpcode(), 20);
        assertEq(probe.dynamicFeeOpcode(), 29);
        assertEq(probe.aquaDynamicFeeOpcode(), 30);
    }
}
