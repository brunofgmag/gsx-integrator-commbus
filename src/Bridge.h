#ifndef GSX_INTEGRATOR_COMMBUS_BRIDGE_H
#define GSX_INTEGRATOR_COMMBUS_BRIDGE_H

#include <MSFS/MSFS_WindowsTypes.h>

struct SIMCONNECT_RECV;

class GsxToolbarBridge
{
public:
    void Setup();
    void Shutdown();

    void OnFlightStart();
    void OnFlightEnd();

private:
    enum DataDefId
    {
        DEF_CMD = 1,
        DEF_STATE = 2,
        DEF_ACTIVE = 3,
    };

    enum RequestId
    {
        REQ_CMD = 1,
    };

    void HandleTick(double cmd);
    void SendCommand(const char* command);
    void PublishState();
    void WriteLVars(double state, double active);
    void OnState(const char* state);

    static void CALLBACK DispatchTrampoline(SIMCONNECT_RECV* pData, DWORD cbData, void* ctx);
    static void CommBusStateTrampoline(const char* buffer, unsigned int size, void* ctx);

    HANDLE hSimConnect_ = 0;
    bool commBusRegistered_ = false;
    bool bridgeReady_ = false;
    bool toolbarOpen_ = false;
    bool sessionActive_ = false;
};

#endif // GSX_INTEGRATOR_COMMBUS_BRIDGE_H
