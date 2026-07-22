#ifndef GSX_INTEGRATOR_COMMBUS_BRIDGE_H
#define GSX_INTEGRATOR_COMMBUS_BRIDGE_H

#include <map>
#include <memory>
#include <string>
#include <vector>

#include <MSFS/MSFS_WindowsTypes.h>

struct SIMCONNECT_RECV;

class CommBusRouter
{
public:
    void Setup();
    void Shutdown();

    void OnFlightStart();
    void OnFlightEnd();

private:
    enum DataId
    {
        DATA_TX = 1,
        DATA_RX = 2,
        DATA_READY = 3,
    };

    enum DataDefId
    {
        DEF_TX = 1,
        DEF_RX = 2,
        DEF_READY = 3,
    };

    enum RequestId
    {
        REQ_TX = 1,
    };

    struct Registration
    {
        std::string channel;
        CommBusRouter* self;
    };

    bool OpenConnection();
    void CreateDataAreas() const;
    void RegisterRelayChannels();

    void OnTxEnvelope(const char* data, unsigned int size);
    void HandleCall(const std::string& channel, int flag, const std::string& payload);
    void HandleSubscribe(const std::string& channel, int flag);
    void RegisterJsChannel(const std::string& channel);
    bool RegisterWasmChannel(const std::string& channel);
    void ReplayLastMessage(const std::string& channel) const;
    void HandleUnsubscribe(const std::string& channel);
    void OnChannelMessage(const std::string& channel, const char* buffer, unsigned int size);
    void CacheAndDeliver(const std::string& channel, const std::string& payload);
    void OnJsRelay(const char* buffer, unsigned int size);
    void SendJsSubscribe(const std::string& channel);
    void ResendJsSubscriptions();
    void WriteRx(const std::string& channel, const std::string& payload) const;
    void PublishReady() const;

    static void CALLBACK DispatchTrampoline(SIMCONNECT_RECV* pData, DWORD cbData, void* ctx);
    static void CommBusTrampoline(const char* buffer, unsigned int size, void* ctx);
    static void JsRelayTrampoline(const char* buffer, unsigned int size, void* ctx);
    static void JsHelloTrampoline(const char* buffer, unsigned int size, void* ctx);

    HANDLE hSimConnect_ = 0;
    std::vector<std::unique_ptr<Registration>> registrations_;
    std::vector<std::string> jsChannels_;
    std::map<std::string, std::string> lastMessage_;
    bool sessionActive_ = false;
};

#endif // GSX_INTEGRATOR_COMMBUS_BRIDGE_H
