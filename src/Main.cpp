#include <MSFS/MSFS.h>
#include <MSFS/MSFS_Flow.h>

#include "Bridge.h"

static CommBusRouter* g_router = nullptr;

static void OnFlowEvent(const FsFlowEvent event, const char*, unsigned int, void*)
{
    if (!g_router)
    {
        return;
    }

    switch (event)
    {
    case FsFlowEvent_FlightStart:
        g_router->OnFlightStart();
        break;
    case FsFlowEvent_FlightEnd:
        g_router->OnFlightEnd();
        break;
    default:
        break;
    }
}

extern "C" MSFS_CALLBACK void module_init(void)
{
    g_router = new CommBusRouter();
    g_router->Setup();
    fsFlowRegister(OnFlowEvent, nullptr);
}

extern "C" MSFS_CALLBACK void module_deinit(void)
{
    fsFlowUnregister(OnFlowEvent);
    if (g_router)
    {
        g_router->Shutdown();
        delete g_router;
        g_router = nullptr;
    }
}
