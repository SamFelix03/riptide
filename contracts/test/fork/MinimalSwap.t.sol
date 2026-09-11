// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import { RiptideForkBase } from "../helpers/RiptideForkBase.sol";
import { ISwapVM } from "@1inch/swap-vm/interfaces/ISwapVM.sol";
import { MakerTraitsLib } from "@1inch/swap-vm/libs/MakerTraits.sol";
import { AquaSwapVMRouter } from "@1inch/swap-vm/routers/AquaSwapVMRouter.sol";
import { AquaOpcodesDebug } from "@1inch/swap-vm/opcodes/AquaOpcodesDebug.sol";
import { RiptideProgram, RiptideProgramBuilder } from "../helpers/RiptideProgramBuilder.sol";
import { XYCSwap } from "@1inch/swap-vm/instructions/XYCSwap.sol";
import { Controls, ControlsArgsBuilder } from "@1inch/swap-vm/instructions/Controls.sol";

contract ProgramBuildHelper is AquaOpcodesDebug {
    using RiptideProgramBuilder for RiptideProgram;

    constructor() AquaOpcodesDebug(address(0)) {}

    function buildXycSalt() external view returns (bytes memory program, bytes memory xycOnly) {
        RiptideProgram memory p = RiptideProgramBuilder.init(_opcodes());
        xycOnly = p.build(XYCSwap._xycSwapXD);
        program = bytes.concat(
            xycOnly,
            p.build(Controls._salt, ControlsArgsBuilder.buildSalt(1))
        );
    }
}

contract MinimalSwapTest is RiptideForkBase {
    ProgramBuildHelper internal helper;

    function setUp() public {
        _deploySystem();
        helper = new ProgramBuildHelper();
    }

    function _shipAndQuote(AquaSwapVMRouter router, bytes memory program) internal {
        ISwapVM.Order memory order = MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: maker,
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
                program: program
            })
        );

        tokenBase.mint(maker, 1000e18);
        tokenQuote.mint(maker, 2_000_000e18);
        vm.startPrank(maker);
        tokenBase.approve(address(aqua), type(uint256).max);
        tokenQuote.approve(address(aqua), type(uint256).max);
        aqua.ship(address(router), abi.encode(order), _tokens(), _amounts(100e18, 200_000e18));
        vm.stopPrank();

        (, uint256 out,) =
            router.asView().quote(order, address(tokenQuote), address(tokenBase), 1000e18, _quoteTakerData(true));
        assertGt(out, 0);
    }

    function test_stockRouterProgramBuilderQuote() public {
        AquaSwapVMRouter stock = new AquaSwapVMRouter(address(aqua), address(0), address(this), "t", "1");
        (bytes memory program,) = helper.buildXycSalt();
        _shipAndQuote(stock, program);
    }

    function test_builtOpcodeBytes() public view {
        (bytes memory program, bytes memory xycOnly) = helper.buildXycSalt();
        assertEq(uint8(xycOnly[0]), 17, "XYCSwap opcode via ProgramBuilder");
        assertEq(uint8(program[2]), 20, "Salt opcode via ProgramBuilder");
    }
}
