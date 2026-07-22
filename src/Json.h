#ifndef GSX_INTEGRATOR_COMMBUS_JSON_H
#define GSX_INTEGRATOR_COMMBUS_JSON_H

#include <string>

namespace json
{
    bool ExtractString(const std::string& text, const char* key, std::string& out);
    bool ExtractInt(const std::string& text, const char* key, int& out);

    std::string Escape(const char* buffer, unsigned int size);
    std::string Escape(const std::string& value);
}

#endif // GSX_INTEGRATOR_COMMBUS_JSON_H
