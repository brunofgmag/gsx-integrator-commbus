# gsx-integrator-commbus

This is a companion module for **GSX Integrator**. It runs inside Microsoft
Flight Simulator 2024 or 2020 and lets the GSX Integrator client reach parts of
the simulator that a normal Windows program cannot.

Most of it stays out of sight: it adds no toolbar icon and no window. The one
part you can see is the GSX Integrator app in the aircraft's EFB. If you do not
use GSX Integrator, there is no reason to install this.

## What it does

Three features of GSX Integrator rely on this module:

- Showing GSX on screen. The client can open the GSX menu for you during the
  turnaround, so GSX's own prompts and messages appear in the sim.
- Loading PMDG airliners. Fuel, payload, chocks and ground power are sent to
  the aircraft's tablet through this module. Without it, PMDG aircraft will
  not refuel or board.
- The GSX Integrator app in the EFB, which shows what the client is doing
  without you leaving the cockpit. It only exists in MSFS 2024, which is the
  only version with an EFB.

## Requirements

- Microsoft Flight Simulator 2024 or 2020 (not tested on 2020)
- GSX Pro
- GSX Integrator (this module is useless without it)

## Installation

The recommended way is the `gsx-integrator-installer`, which sets up this
module for you. If you use it, you can skip the rest of this section.

To install it manually instead:

1. Copy the `gsx-integrator-commbus` package folder into your MSFS 2024 or 2020
   Community folder:

   ```
   ...\Microsoft Flight Simulator 2024\Community\gsx-integrator-commbus
   ```

2. Start the simulator.

You will not see a new icon in the toolbar. That is normal. GSX Integrator
detects the module automatically once you are in a flight, and the GSX
Integrator app appears in the EFB app list.

To uninstall, delete the folder from `Community`.

## Building

`build.ps1` builds the WASM module and the EFB app, then packages both. It
needs the MSFS 2024 SDK (set `MSFS2024_SDK` or pass `-SdkRoot`), CMake with
Ninja, and Node.js 18 or newer for the EFB app. The app's own dependencies
come from the SDK's EFB sample, which `build.ps1` copies into
`PackageSources/GsxIntegrator/.sdk/` before running npm.

The app's payload reader is plain TypeScript with no simulator dependency, so
its tests run on Node alone:

```
cd PackageSources/GsxIntegrator
node --test "src/**/*.test.ts"
```

Node strips the types instead of compiling them, so the app cannot use
TypeScript syntax that survives into runtime: no enums, no namespaces, and no
constructor parameter properties. `tsconfig.json` turns on `erasableSyntaxOnly`
so the typecheck says so before Node does.

## Communication

For reference only; the GSX Integrator client handles this. The client and the
module exchange messages over three SimConnect client data areas:
`GSXI.CommBus.Tx` (client to module), `GSXI.CommBus.Rx` (module to client) and
`GSXI.CommBus.Ready` (protocol version). This is version 2 of the protocol; it
replaced the old `L:GSXI_TOOLBAR_*` LVars, so a client built for the LVar
version will not find this module.

From there the module forwards messages to the simulator's own JavaScript bus,
which is how the EFB app hears about the client. The app listens on
`GSXI.Efb.State`, and announces itself on `GSXI.Efb.Hello` so a client that
connected before the EFB started sends its state again.
