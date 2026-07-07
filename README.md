# gsx-integrator-commbus

This is a companion module for **GSX Integrator**. It runs invisibly inside
Microsoft Flight Simulator 2024 or 2020 and lets the GSX Integrator client open and
close the GSX menu on your behalf.

On its own, this module does nothing you can see or use. It adds no toolbar
icon and no window. If you are not running `gsx-integrator-client`, there is
no reason to install it.

## What it does

The GSX menu can only be opened from inside the simulator. This module sits
in the background, waits for a request from the GSX Integrator client, and
presses the GSX toolbar button for it. That is its entire job.

## Requirements

- Microsoft Flight Simulator 2024 or 2020 (not tested on 2020)
- GSX Pro
- `gsx-integrator-client` (this module is useless without it)

## Installation

1. Copy the `gsx-integrator-commbus` package folder into your MSFS 2024 or 2020 (not tested on 2020)
   Community folder:

   ```
   ...\Microsoft Flight Simulator 2024\Community\gsx-integrator-commbus
   ```

2. Start the simulator.

You will not see a new icon in the toolbar. That is normal: the module is
meant to stay invisible. GSX Integrator detects it automatically once you
are in a flight.

To uninstall, delete the folder from `Community`.

## LVar reference

For information only. You do not need to read or write these yourself; the
GSX Integrator client handles them.

| LVar | Direction | Values |
|---|---|---|
| `L:GSXI_TOOLBAR_CMD` | client → module | `0` idle · `1` open · `2` close |
| `L:GSXI_TOOLBAR_STATE` | module → client | `0` unavailable · `1` ready · `2` open |
| `L:GSXI_GSX_TOOLBAR_ACTIVE` | module → anyone | `0` GSX inactive · `1` GSX active |
