# gsx-integrator-commbus

This is a companion module for **GSX Integrator**. It runs invisibly inside
Microsoft Flight Simulator 2024 or 2020 and lets the GSX Integrator client
reach parts of the simulator that a normal Windows program cannot.

On its own, this module does nothing you can see or use. It adds no toolbar
icon and no window. If you do not use GSX Integrator, there is no reason to
install it.

## What it does

Two features of GSX Integrator rely on this module:

- Showing GSX on screen. The client can open the GSX menu for you during the
  turnaround, so GSX's own prompts and messages appear in the sim.
- Loading PMDG airliners. Fuel, payload, chocks and ground power are sent to
  the aircraft's tablet through this module. Without it, PMDG aircraft will
  not refuel or board.

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

You will not see a new icon in the toolbar. That is normal: the module is
meant to stay invisible. GSX Integrator detects it automatically once you
are in a flight.

To uninstall, delete the folder from `Community`.

## Communication

For reference only; the GSX Integrator client handles this. The client and the
module exchange messages over three SimConnect client data areas:
`GSXI.CommBus.Tx` (client to module), `GSXI.CommBus.Rx` (module to client) and
`GSXI.CommBus.Ready` (protocol version). This is version 2 of the protocol; it
replaced the old `L:GSXI_TOOLBAR_*` LVars, so a client built for the LVar
version will not find this module.
