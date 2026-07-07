#include <MSFS/MSFS.h>
#include <MSFS/MSFS_Flow.h>

#include "Bridge.h"

static GsxToolbarBridge* g_bridge = nullptr;

static void OnFlowEvent(const FsFlowEvent event, const char*, unsigned int, void*)
{
    if (!g_bridge)
    {
        return;
    }

    switch (event)
    {
    case FsFlowEvent_FlightStart:
        g_bridge->OnFlightStart();
        break;
    case FsFlowEvent_FlightEnd:
        g_bridge->OnFlightEnd();
        break;
    default:
        break;
    }
}

extern "C" MSFS_CALLBACK void module_init(void)
{
    g_bridge = new GsxToolbarBridge();
    g_bridge->Setup();
    fsFlowRegister(OnFlowEvent, nullptr);
}

extern "C" MSFS_CALLBACK void module_deinit(void)
{
    fsFlowUnregister(OnFlowEvent);
    if (g_bridge)
    {
        g_bridge->Shutdown();
        delete g_bridge;
        g_bridge = nullptr;
    }
}
