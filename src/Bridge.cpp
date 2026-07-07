#include "Bridge.h"

#include <cstring>
#include <string>

#include <SimConnect.h>
#include <MSFS/MSFS_CommBus.h>

#include "Logger.h"

namespace
{
    constexpr char kLVarCmd[] = "L:GSXI_TOOLBAR_CMD";
    constexpr char kLVarState[] = "L:GSXI_TOOLBAR_STATE";
    constexpr char kLVarActive[] = "L:GSXI_GSX_TOOLBAR_ACTIVE";
    constexpr char kUnitNumber[] = "Number";

    constexpr char kEventCommand[] = "GSXI.Toolbar.Command";
    constexpr char kEventState[] = "GSXI.Toolbar.State";
}

void GsxToolbarBridge::Setup()
{
    if (const HRESULT hr = SimConnect_Open(&hSimConnect_, "GsxIntegratorCommBus", nullptr, 0, 0, 0);
        !SUCCEEDED(hr))
    {
        hSimConnect_ = 0;
        LOG_ERROR("SimConnect_Open failed (0x%08X)", static_cast<unsigned>(hr));
        return;
    }

    SimConnect_AddToDataDefinition(hSimConnect_, DEF_CMD, kLVarCmd, kUnitNumber, SIMCONNECT_DATATYPE_FLOAT64);
    SimConnect_AddToDataDefinition(hSimConnect_, DEF_STATE, kLVarState, kUnitNumber, SIMCONNECT_DATATYPE_FLOAT64);
    SimConnect_AddToDataDefinition(hSimConnect_, DEF_ACTIVE, kLVarActive, kUnitNumber, SIMCONNECT_DATATYPE_FLOAT64);

    commBusRegistered_ = fsCommBusRegister(kEventState, &GsxToolbarBridge::CommBusStateTrampoline, this);
    if (commBusRegistered_)
    {
        LOG_INFO("Registered CommBus event %s", kEventState);
    }
    else
    {
        LOG_WARN("fsCommBusRegister(%s) failed", kEventState);
    }

    SimConnect_RequestDataOnSimObject(hSimConnect_, REQ_CMD, DEF_CMD, SIMCONNECT_OBJECT_ID_USER,
                                      SIMCONNECT_PERIOD_SIM_FRAME,
                                      SIMCONNECT_DATA_REQUEST_FLAG_CHANGED, 0, 0, 0);

    SimConnect_CallDispatch(hSimConnect_, &GsxToolbarBridge::DispatchTrampoline, this);

    WriteLVars(0.0, 0.0);
    LOG_INFO("GSX CommBus bridge ready (waiting for flight start)");
}

void GsxToolbarBridge::Shutdown()
{
    if (commBusRegistered_)
    {
        fsCommBusUnregisterOneEvent(kEventState, &GsxToolbarBridge::CommBusStateTrampoline, this);
        commBusRegistered_ = false;
    }

    if (hSimConnect_ != 0)
    {
        double zero = 0.0;
        SimConnect_SetDataOnSimObject(hSimConnect_, DEF_CMD, SIMCONNECT_OBJECT_ID_USER, 0, 0, sizeof(double), &zero);
        SimConnect_Close(hSimConnect_);
        hSimConnect_ = 0;
    }

    bridgeReady_ = false;
    toolbarOpen_ = false;
}

void GsxToolbarBridge::OnFlightStart()
{
    sessionActive_ = true;
    LOG_INFO("Flight start (Ready to Fly) — command handling enabled");
    PublishState();
}

void GsxToolbarBridge::OnFlightEnd()
{
    sessionActive_ = false;
    toolbarOpen_ = false;
    bridgeReady_ = true;
    LOG_INFO("Flight end (returned to menu) — reset STATE=1, ACTIVE=0");
    WriteLVars(1.0, 0.0);
}

void GsxToolbarBridge::HandleTick(const double cmd)
{
    if (!sessionActive_)
    {
        return;
    }

    if (const int c = static_cast<int>(cmd); c == 1 || c == 2)
    {
        double zero = 0.0;
        SimConnect_SetDataOnSimObject(hSimConnect_, DEF_CMD, SIMCONNECT_OBJECT_ID_USER, 0, 0, sizeof(double), &zero);
        SendCommand(c == 1 ? "open" : "close");
    }

    PublishState();
}

void GsxToolbarBridge::SendCommand(const char* command)
{
    const bool sent = fsCommBusCall(kEventCommand, command,
                                    static_cast<unsigned int>(std::strlen(command) + 1),
                                    FsCommBusBroadcast_JS);
    if (!sent)
    {
        LOG_WARN("fsCommBusCall(%s, %s) failed", kEventCommand, command);
    }
}

void GsxToolbarBridge::PublishState()
{
    if (!sessionActive_)
    {
        return;
    }

    const double state = !bridgeReady_ ? 0.0 : (toolbarOpen_ ? 2.0 : 1.0);
    const double active = toolbarOpen_ ? 1.0 : 0.0;
    WriteLVars(state, active);
}

void GsxToolbarBridge::WriteLVars(double state, double active)
{
    if (hSimConnect_ == 0)
    {
        return;
    }

    SimConnect_SetDataOnSimObject(hSimConnect_, DEF_STATE, SIMCONNECT_OBJECT_ID_USER, 0, 0, sizeof(double), &state);
    SimConnect_SetDataOnSimObject(hSimConnect_, DEF_ACTIVE, SIMCONNECT_OBJECT_ID_USER, 0, 0, sizeof(double), &active);
}

void GsxToolbarBridge::OnState(const char* state)
{
    if (!state)
    {
        return;
    }

    LOG_INFO("OnState received from JS: %s", state);

    if (std::strcmp(state, "ready") == 0)
    {
        bridgeReady_ = true;
    }
    else if (std::strcmp(state, "open") == 0)
    {
        bridgeReady_ = true;
        toolbarOpen_ = true;
    }
    else if (std::strcmp(state, "closed") == 0)
    {
        bridgeReady_ = true;
        toolbarOpen_ = false;
    }
    else if (std::strcmp(state, "unavailable") == 0)
    {
        toolbarOpen_ = false;
        LOG_WARN("Companion JS reported GSX toolbar unavailable");
    }

    PublishState();
}

void CALLBACK GsxToolbarBridge::DispatchTrampoline(SIMCONNECT_RECV* pData, const DWORD cbData, void* ctx)
{
    auto* self = static_cast<GsxToolbarBridge*>(ctx);
    if (!self || !pData)
    {
        return;
    }

    if (pData->dwID == SIMCONNECT_RECV_ID_SIMOBJECT_DATA)
    {
        if (cbData < sizeof(SIMCONNECT_RECV_SIMOBJECT_DATA))
        {
            return;
        }

        const auto* data = reinterpret_cast<SIMCONNECT_RECV_SIMOBJECT_DATA*>(pData);
        if (data->dwRequestID == REQ_CMD)
        {
            double cmd = 0.0;
            std::memcpy(&cmd, &data->dwData, sizeof(double));
            self->HandleTick(cmd);
        }
    }
}

void GsxToolbarBridge::CommBusStateTrampoline(const char* buffer, const unsigned int size, void* ctx)
{
    auto* self = static_cast<GsxToolbarBridge*>(ctx);
    if (!self || !buffer || size == 0)
    {
        return;
    }

    std::string state(buffer, size);
    if (!state.empty() && state.back() == '\0')
    {
        state.pop_back();
    }

    self->OnState(state.c_str());
}
