# gsx-integrator-commbus

A companion module for [GSX Integrator](https://github.com/brunofgmag/gsx-integrator-client). It runs inside Microsoft Flight Simulator and lets the GSX Integrator client reach parts of the simulator that an ordinary Windows program can't.

It adds no toolbar icon and no window. The only visible part is the GSX Integrator app on the aircraft's EFB. Without GSX Integrator there's no reason to install it.

## What it does

GSX Integrator needs the module for three things:

- Opening the GSX menu for you during the turnaround, so GSX's own prompts and messages show up in the sim.
- Loading the PMDG aircraft. Fuel, payload, chocks and ground power reach the aircraft's tablet through the module. Without it, the PMDG aircraft won't refuel or board.
- The GSX Integrator app on the EFB, where you follow the turnaround and give the go-ahead without leaving the cockpit. MSFS 2024 only, since 2020 has no EFB.

## Requirements

- Microsoft Flight Simulator 2024 (2020 may work but is not tested)
- GSX Pro
- GSX Integrator

## Installing

The [installer](https://github.com/brunofgmag/gsx-integrator-installer) sets the module up for you. To do it by hand:

1. Copy the `gsx-integrator-commbus` package folder into your Community folder:

   ```
   ...\Microsoft Flight Simulator 2024\Community\gsx-integrator-commbus
   ```

2. Start the simulator.

Don't expect a toolbar icon. GSX Integrator finds the module once you're in a flight, and the GSX Integrator app shows up in the EFB app list.

To uninstall, delete the folder from `Community`.

## Building

`build.ps1` builds the WASM module and the EFB app and packages both. You need:

- The MSFS 2024 SDK, through `MSFS2024_SDK` or `-SdkRoot`
- CMake and Ninja
- Node.js 18 or newer, for the EFB app

The EFB app's dependencies come from the SDK's EFB sample. `build.ps1` copies them into `PackageSources/GsxIntegrator/.sdk/` before running npm.

The app's payload reader is plain TypeScript with no simulator dependency, so its tests run on Node alone:

```
cd PackageSources/GsxIntegrator
npm test
```

Node strips the types instead of compiling them, so the app can't use TypeScript syntax that survives to runtime: enums, namespaces and constructor parameter properties are out. `tsconfig.json` sets `erasableSyntaxOnly` so the typecheck catches them before Node does.

## Protocol

The client handles this; it's here for reference.

The client and the module talk over three SimConnect client data areas: `GSXI.CommBus.Tx` (client to module), `GSXI.CommBus.Rx` (module to client) and `GSXI.CommBus.Ready` (protocol version). This is protocol version 2. It replaced the old `L:GSXI_TOOLBAR_*` LVars, so a client built for those won't find this module.

The module forwards messages to the simulator's JavaScript bus, which is how the EFB app reaches the client. The app listens on `GSXI.Efb.State` and sends the pilot's actions on `GSXI.Efb.Command`. When it starts, it announces itself on `GSXI.Efb.Hello`, so a client that connected before the EFB was up sends its state again.
