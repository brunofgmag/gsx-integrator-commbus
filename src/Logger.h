#ifndef GSX_INTEGRATOR_COMMBUS_LOGGER_H
#define GSX_INTEGRATOR_COMMBUS_LOGGER_H

#include <cstdio>

#define GSXI_LOG(level, fmt, ...) \
    std::fprintf(stdout, "[GSXI CommBus][" level "] " fmt "\n", ##__VA_ARGS__)

#define LOG_INFO(fmt, ...)  GSXI_LOG("INFO",  fmt, ##__VA_ARGS__)
#define LOG_WARN(fmt, ...)  GSXI_LOG("WARN",  fmt, ##__VA_ARGS__)
#define LOG_ERROR(fmt, ...) GSXI_LOG("ERROR", fmt, ##__VA_ARGS__)

#endif // GSX_INTEGRATOR_COMMBUS_LOGGER_H
