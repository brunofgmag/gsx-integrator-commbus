#include "Bridge.h"

#include <algorithm>
#include <cstddef>
#include <cstring>
#include <string>

#include <SimConnect.h>
#include <MSFS/MSFS_CommBus.h>

#include "Json.h"
#include "Logger.h"

namespace
{
    constexpr char kTxAreaName[] = "GSXI.CommBus.Tx";
    constexpr char kRxAreaName[] = "GSXI.CommBus.Rx";
    constexpr DWORD kAreaSize = 8192;

    constexpr char kReadyAreaName[] = "GSXI.CommBus.Ready";
    constexpr int kProtocolVersion = 2;

    constexpr char kJsSubscribeChannel[] = "GSXI.Bridge.JsSubscribe";
    constexpr char kJsRelayChannel[] = "GSXI.Bridge.JsRelay";
    constexpr char kJsHelloChannel[] = "GSXI.Bridge.JsHello";
    constexpr int kFlagJs = 1;

    std::string BuildRxEnvelope(const std::string& channel, const std::string& payload)
    {
        std::string envelope = "{\"channel\":\"";
        envelope += json::Escape(channel);
        envelope += "\",\"payload\":\"";
        envelope += json::Escape(payload);
        envelope += "\"}";

        return envelope;
    }

    enum class Command { Call, Subscribe, Unsubscribe, Unknown };

    Command ParseCommand(const std::string& cmd)
    {
        if (cmd == "call")
        {
            return Command::Call;
        }
        if (cmd == "subscribe")
        {
            return Command::Subscribe;
        }
        if (cmd == "unsubscribe")
        {
            return Command::Unsubscribe;
        }

        return Command::Unknown;
    }
}

void CommBusRouter::Setup()
{
    if (!OpenConnection())
    {
        return;
    }

    CreateDataAreas();
    PublishReady();
    RegisterRelayChannels();

    (void)SimConnect_CallDispatch(hSimConnect_, &CommBusRouter::DispatchTrampoline, this);

    LOG_INFO("GSX CommBus router ready (protocol %d)", static_cast<int>(kProtocolVersion));
}

bool CommBusRouter::OpenConnection()
{
    if (const HRESULT hr = SimConnect_Open(&hSimConnect_, "GsxIntegratorCommBus", nullptr, 0, 0, 0);
        !SUCCEEDED(hr))
    {
        hSimConnect_ = 0;

        LOG_ERROR("SimConnect_Open failed (0x%08X)", static_cast<unsigned>(hr));

        return false;
    }

    return true;
}

void CommBusRouter::CreateDataAreas() const
{
    (void)SimConnect_MapClientDataNameToID(hSimConnect_, kTxAreaName, DATA_TX);
    (void)SimConnect_CreateClientData(hSimConnect_, DATA_TX, kAreaSize, SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    (void)SimConnect_MapClientDataNameToID(hSimConnect_, kRxAreaName, DATA_RX);
    (void)SimConnect_CreateClientData(hSimConnect_, DATA_RX, kAreaSize, SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);

    (void)SimConnect_AddToClientDataDefinition(hSimConnect_, DEF_TX, 0, kAreaSize, 0, 0);
    (void)SimConnect_AddToClientDataDefinition(hSimConnect_, DEF_RX, 0, kAreaSize, 0, 0);

    (void)SimConnect_RequestClientData(hSimConnect_, DATA_TX, REQ_TX, DEF_TX,
                                       SIMCONNECT_CLIENT_DATA_PERIOD_ON_SET,
                                       SIMCONNECT_CLIENT_DATA_REQUEST_FLAG_DEFAULT, 0, 0, 0);

    (void)SimConnect_MapClientDataNameToID(hSimConnect_, kReadyAreaName, DATA_READY);
    (void)SimConnect_CreateClientData(hSimConnect_, DATA_READY, kAreaSize,
                                      SIMCONNECT_CREATE_CLIENT_DATA_FLAG_DEFAULT);
    (void)SimConnect_AddToClientDataDefinition(hSimConnect_, DEF_READY, 0, kAreaSize, 0, 0);
}

void CommBusRouter::RegisterRelayChannels()
{
    fsCommBusRegister(kJsRelayChannel, &CommBusRouter::JsRelayTrampoline, this);
    fsCommBusRegister(kJsHelloChannel, &CommBusRouter::JsHelloTrampoline, this);
}

void CommBusRouter::Shutdown()
{
    fsCommBusUnregisterAll();
    registrations_.clear();
    lastMessage_.clear();

    if (hSimConnect_ != 0)
    {
        (void)SimConnect_Close(hSimConnect_);
        hSimConnect_ = 0;
    }

    sessionActive_ = false;
}

void CommBusRouter::OnFlightStart()
{
    sessionActive_ = true;

    PublishReady();

    LOG_INFO("Flight start (Ready to Fly)");
}

void CommBusRouter::OnFlightEnd()
{
    sessionActive_ = false;

    lastMessage_.clear();

    LOG_INFO("Flight end (returned to menu) — cleared last-message cache");
}

void CommBusRouter::PublishReady() const
{
    if (hSimConnect_ == 0)
    {
        return;
    }

    char buffer[kAreaSize] = {};
    constexpr double value = kProtocolVersion;
    std::memcpy(buffer, &value, sizeof(double));

    (void)SimConnect_SetClientData(hSimConnect_,
                                   DATA_READY,
                                   DEF_READY,
                                   SIMCONNECT_CLIENT_DATA_SET_FLAG_DEFAULT,
                                   0,
                                   kAreaSize,
                                   buffer);
}

void CommBusRouter::OnTxEnvelope(const char* data, const unsigned int size)
{
    if (data == nullptr || size == 0)
    {
        return;
    }

    const std::size_t length = strnlen(data, size);
    const std::string text(data, length);

    std::string cmd;
    std::string channel;
    if (!json::ExtractString(text, "cmd", cmd) || !json::ExtractString(text, "channel", channel) || channel.empty())
    {
        LOG_WARN("Dropping malformed CommBus envelope");
        return;
    }

    switch (ParseCommand(cmd))
    {
    case Command::Call:
        {
            int flag = 0;
            std::string payload;
            json::ExtractInt(text, "flag", flag);
            json::ExtractString(text, "payload", payload);
            HandleCall(channel, flag, payload);
            break;
        }
    case Command::Subscribe:
        {
            int flag = 0;
            json::ExtractInt(text, "flag", flag);
            HandleSubscribe(channel, flag);
            break;
        }
    case Command::Unsubscribe:
        HandleUnsubscribe(channel);
        break;
    case Command::Unknown:
        LOG_WARN("Unknown CommBus command '%s'", cmd.c_str());
        break;
    }
}

void CommBusRouter::HandleCall(const std::string& channel, const int flag, const std::string& payload)
{
    const auto broadcast = static_cast<FsCommBusBroadcastFlags>(flag != 0 ? flag : FsCommBusBroadcast_Default);
    const bool sent = fsCommBusCall(channel.c_str(),
                                    payload.c_str(),
                                    static_cast<unsigned int>(payload.size() + 1),
                                    broadcast);
    if (!sent)
    {
        LOG_WARN("fsCommBusCall(%s) failed", channel.c_str());
    }
}

void CommBusRouter::HandleSubscribe(const std::string& channel, const int flag)
{
    if (flag == kFlagJs)
    {
        RegisterJsChannel(channel);
        ReplayLastMessage(channel);

        return;
    }

    if (RegisterWasmChannel(channel))
    {
        ReplayLastMessage(channel);
    }
}

void CommBusRouter::RegisterJsChannel(const std::string& channel)
{
    const bool known = std::find(jsChannels_.begin(), jsChannels_.end(), channel) != jsChannels_.end();
    if (!known)
    {
        jsChannels_.push_back(channel);
    }

    SendJsSubscribe(channel);
}

bool CommBusRouter::RegisterWasmChannel(const std::string& channel)
{
    for (const auto& registration : registrations_)
    {
        if (registration->channel == channel)
        {
            return true;
        }
    }

    auto registration = std::make_unique<Registration>();
    registration->channel = channel;
    registration->self = this;

    if (!fsCommBusRegister(channel.c_str(), &CommBusRouter::CommBusTrampoline, registration.get()))
    {
        LOG_WARN("fsCommBusRegister(%s) failed", channel.c_str());
        return false;
    }

    LOG_INFO("Registered CommBus channel %s", channel.c_str());
    registrations_.push_back(std::move(registration));

    return true;
}

void CommBusRouter::ReplayLastMessage(const std::string& channel) const
{
    const auto cached = lastMessage_.find(channel);
    if (cached != lastMessage_.end())
    {
        WriteRx(channel, cached->second);
    }
}

void CommBusRouter::HandleUnsubscribe(const std::string& channel)
{
    const auto jsIt = std::find(jsChannels_.begin(), jsChannels_.end(), channel);
    if (jsIt != jsChannels_.end())
    {
        jsChannels_.erase(jsIt);
        LOG_INFO("Unregistered JS CommBus channel %s (panel keeps listening)", channel.c_str());

        return;
    }

    for (auto it = registrations_.begin(); it != registrations_.end(); ++it)
    {
        if ((*it)->channel == channel)
        {
            fsCommBusUnregisterOneEvent(channel.c_str(), &CommBusRouter::CommBusTrampoline, it->get());
            registrations_.erase(it);
            LOG_INFO("Unregistered CommBus channel %s", channel.c_str());

            return;
        }
    }
}

void CommBusRouter::OnChannelMessage(const std::string& channel, const char* buffer, const unsigned int size)
{
    const std::size_t length = strnlen(buffer, size);
    CacheAndDeliver(channel, std::string(buffer, length));
}

void CommBusRouter::CacheAndDeliver(const std::string& channel, const std::string& payload)
{
    lastMessage_[channel] = payload;
    WriteRx(channel, payload);
}

void CommBusRouter::SendJsSubscribe(const std::string& channel)
{
    if (!fsCommBusCall(kJsSubscribeChannel, channel.c_str(),
                       static_cast<unsigned int>(channel.size() + 1), FsCommBusBroadcast_JS))
    {
        LOG_WARN("fsCommBusCall(%s) failed for %s", kJsSubscribeChannel, channel.c_str());
    }
    else
    {
        LOG_INFO("Forwarded JS subscription for %s to the panel", channel.c_str());
    }
}

void CommBusRouter::ResendJsSubscriptions()
{
    for (const auto& channel : jsChannels_)
    {
        SendJsSubscribe(channel);
    }
}

void CommBusRouter::OnJsRelay(const char* buffer, const unsigned int size)
{
    if (buffer == nullptr || size == 0)
    {
        return;
    }

    const std::size_t length = strnlen(buffer, size);
    const std::string text(buffer, length);

    std::string channel;
    std::string payload;
    if (!json::ExtractString(text, "channel", channel) || channel.empty()
        || !json::ExtractString(text, "payload", payload))
    {
        LOG_WARN("Dropping malformed JS relay envelope");
        return;
    }

    CacheAndDeliver(channel, payload);
}

void CommBusRouter::WriteRx(const std::string& channel, const std::string& payload) const
{
    if (hSimConnect_ == 0)
    {
        return;
    }

    const std::string envelope = BuildRxEnvelope(channel, payload);
    if (envelope.size() > kAreaSize - 1)
    {
        LOG_WARN("Dropping oversize relay for %s (%u bytes)", channel.c_str(),
                 static_cast<unsigned>(envelope.size()));

        return;
    }

    char buffer[kAreaSize] = {};
    std::memcpy(buffer, envelope.data(), envelope.size());

    (void)SimConnect_SetClientData(hSimConnect_, DATA_RX, DEF_RX, SIMCONNECT_CLIENT_DATA_SET_FLAG_DEFAULT, 0,
                                   kAreaSize, buffer);
}

void CALLBACK CommBusRouter::DispatchTrampoline(SIMCONNECT_RECV* pData, const DWORD cbData, void* ctx)
{
    auto* self = static_cast<CommBusRouter*>(ctx);
    if (!self || !pData)
    {
        return;
    }

    if (pData->dwID == SIMCONNECT_RECV_ID_EXCEPTION)
    {
        const auto* ex = reinterpret_cast<const SIMCONNECT_RECV_EXCEPTION*>(pData);
        LOG_WARN("SimConnect exception %u (sendId=%u)", static_cast<unsigned>(ex->dwException),
                 static_cast<unsigned>(ex->dwSendID));

        return;
    }

    if (pData->dwID == SIMCONNECT_RECV_ID_CLIENT_DATA)
    {
        if (cbData < sizeof(SIMCONNECT_RECV_CLIENT_DATA))
        {
            return;
        }

        const auto* data = reinterpret_cast<SIMCONNECT_RECV_CLIENT_DATA*>(pData);
        if (data->dwRequestID == REQ_TX)
        {
            const DWORD payloadSize = cbData - offsetof(SIMCONNECT_RECV_CLIENT_DATA, dwData);
            self->OnTxEnvelope(reinterpret_cast<const char*>(&data->dwData), payloadSize);
        }
    }
}

void CommBusRouter::CommBusTrampoline(const char* buffer, const unsigned int size, void* ctx)
{
    const auto* registration = static_cast<Registration*>(ctx);
    if (!registration || !registration->self || !buffer)
    {
        return;
    }

    registration->self->OnChannelMessage(registration->channel, buffer, size);
}

void CommBusRouter::JsRelayTrampoline(const char* buffer, const unsigned int size, void* ctx)
{
    if (auto* self = static_cast<CommBusRouter*>(ctx); self != nullptr)
    {
        self->OnJsRelay(buffer, size);
    }
}

void CommBusRouter::JsHelloTrampoline(const char*, const unsigned int, void* ctx)
{
    auto* self = static_cast<CommBusRouter*>(ctx);
    if (self == nullptr)
    {
        return;
    }

    LOG_INFO("JS panel announced ready; re-sending %u JS subscriptions",
             static_cast<unsigned>(self->jsChannels_.size()));

    self->ResendJsSubscriptions();
}
